import { test, expect, type Page } from '@playwright/test'

/**
 * S13.FE.01-03 (SPEC-0801/0802): el observatorio del delito -- cargue de la
 * plantilla (Vía A), captura y corrección directas (Vía B) y la banda de
 * vigencia permanente.
 *
 * La banda es la prueba que más importa: reemplaza el `VERSIÓN 27` escrito a
 * mano sobre la lámina que hoy ve el comando, así que tiene que decir de qué
 * corte viene lo que se está mirando -- y decirlo también cuando NO hay corte.
 */
const ANALYST_SESSION = {
  userId: '00000000-0000-0000-0000-000000000202',
  displayName: 'Sargento Cárdenas Marín',
  roles: ['INTELLIGENCE_ANALYST'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

const OPERATOR_SESSION = { ...ANALYST_SESSION, roles: ['HOTLINE_OPERATOR'] }

const SNAPSHOT = {
  id: '2b8f0a3c-5f1e-4c3a-9a11-0f2ce3f1a001',
  source: 'Fiscalía General de la Nación',
  cutoffDate: '2025-12-31',
  label: 'Mesa de Seguimiento No.52',
  status: 'ACTIVE',
  loadedBy: ANALYST_SESSION.userId,
  loadedByName: 'Sargento Cárdenas Marín',
  loadedAt: '2026-09-07T14:05:00Z',
  incidentCount: 9,
}

const PROFILE = {
  id: '00000000-0000-0000-0000-000000000901',
  code: 'FISCALIA_EXTORSION_SECUESTRO',
  version: 1,
  provisional: true,
  displayName: 'Fiscalía — Extorsión y Secuestro (plantilla observada 19/08/2026)',
  sheets: ['SECUESTRO', 'EXTORSION'],
  validFrom: '2026-01-01',
}

const UNRESOLVED_INCIDENT = {
  id: 'a1d3f9c2-77aa-4bd8-9d4f-51f5b1c0e001',
  snapshotId: SNAPSHOT.id,
  profile: 'KIDNAPPING',
  occurredOn: '2026-02-15',
  departmentText: 'CUNDINAMARCA',
  municipalityText: 'BOGOTÁ, D.C.',
  municipalityCode: null,
  municipalityUnresolved: true,
  authorGroup: 'GDCO',
  kidnappingType: 'SIMPLE',
  victimStatus: 'LIBERADO',
  occupation: 'COMERCIANTE',
  modality: null,
  notes: null,
  sourceRowNumber: 4,
  registeredAt: '2026-09-07T14:05:00Z',
  updatedAt: null,
}

async function mockSession(page: Page, session: Record<string, unknown>) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }),
  )
}

async function mockActiveSnapshot(page: Page, snapshot: Record<string, unknown> | null) {
  await page.route('**/api/v1/observatory/snapshots/active', (route) =>
    snapshot
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) })
      : route.fulfill({ status: 204, body: '' }),
  )
}

test('S13.FE.03: la banda de vigencia dice de qué corte viene lo que se está mirando', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await mockActiveSnapshot(page, SNAPSHOT)
  await page.route('**/api/v1/observatory/incidents?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [UNRESOLVED_INCIDENT], totalElements: 1, totalPages: 1, pageNumber: 0, pageSize: 50 }),
    }),
  )

  await page.goto('/observatorio/hechos')

  const band = page.getByRole('status', { name: 'Corte de datos vigente' })
  await expect(band).toContainText('Corte al 31 de diciembre de 2025')
  await expect(band).toContainText('Mesa de Seguimiento No.52')
  await expect(band).toContainText('Fiscalía General de la Nación')
  await expect(band).toContainText('Cargado por Sargento Cárdenas Marín')
})

test('S13.FE.03: sin ningún corte cargado la banda lo DICE, no se queda en blanco', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await mockActiveSnapshot(page, null)
  await page.route('**/api/v1/observatory/incidents?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 50 }),
    }),
  )

  await page.goto('/observatorio/hechos')

  await expect(page.getByText('Sin corte vigente')).toBeVisible()
  await expect(page.getByText('Todavía no se ha cargado ningún corte del registro nacional.')).toBeVisible()
})

test('S13.FE.02: corregir en línea el municipio que la carga no pudo resolver, sin volver al Excel', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await mockActiveSnapshot(page, SNAPSHOT)

  let patched: Record<string, unknown> | null = null
  let incidents: Record<string, unknown>[] = [UNRESOLVED_INCIDENT]
  await page.route('**/api/v1/observatory/incidents?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: incidents, totalElements: incidents.length, totalPages: 1, pageNumber: 0, pageSize: 50 }),
    }),
  )
  await page.route('**/api/v1/catalog/municipalities?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ code: '11001', name: 'Bogotá D.C.', departmentName: 'Bogotá D.C.' }]),
    }),
  )
  await page.route(`**/api/v1/observatory/incidents/${UNRESOLVED_INCIDENT.id}/municipality`, (route) => {
    patched = route.request().postDataJSON() as Record<string, unknown>
    incidents = [{ ...UNRESOLVED_INCIDENT, municipalityCode: '11001', municipalityUnresolved: false }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(incidents[0]) })
  })

  await page.goto('/observatorio/hechos')

  // El texto original del archivo se ve SIEMPRE, resuelto o no (SPEC-0801 CA-3).
  await expect(page.getByText('BOGOTÁ, D.C.')).toBeVisible()
  await expect(page.getByText('sin resolver', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Corregir municipio' }).click()
  await page.getByLabel('Municipio del catálogo').selectOption('11001')
  await page.getByRole('button', { name: 'Guardar municipio' }).click()

  await expect(page.getByText('sin resolver', { exact: true })).toBeHidden()
  await expect(page.getByText('11001')).toBeVisible()
  expect(patched).toEqual({ municipalityCode: '11001' })
})

test('S13.FE.02: capturar un hecho por la Vía B, sin pasar por el Excel', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await mockActiveSnapshot(page, SNAPSHOT)

  let posted: Record<string, unknown> | null = null
  await page.route('**/api/v1/observatory/incidents?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ content: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 50 }),
    }),
  )
  await page.route('**/api/v1/observatory/incidents', (route) => {
    posted = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(UNRESOLVED_INCIDENT) })
  })

  await page.goto('/observatorio/hechos')
  await page.getByRole('button', { name: 'Registrar hecho' }).click()

  await page.getByLabel('Delito del hecho').selectOption('KIDNAPPING')
  await page.getByLabel('Fecha del hecho').fill('2026-02-15')
  await page.getByLabel('Departamento').fill('ANTIOQUIA')
  await page.getByLabel('Municipio', { exact: true }).fill('MEDELLIN')
  await page.getByPlaceholder('GDCO, ELN, DELINCUENCIA COMÚN…').fill('GDCO')
  await page.getByLabel('Tipo de secuestro').selectOption('SIMPLE')
  await page.getByLabel('Situación de la víctima').selectOption('LIBERADO')
  await page.getByRole('button', { name: 'Registrar', exact: true }).click()

  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toMatchObject({
    profile: 'KIDNAPPING',
    occurredOn: '2026-02-15',
    departmentText: 'ANTIOQUIA',
    municipalityText: 'MEDELLIN',
    authorGroup: 'GDCO',
    kidnappingType: 'SIMPLE',
    victimStatus: 'LIBERADO',
    // El perfil de secuestro no manda modalidad de extorsión: son hojas distintas del mismo libro.
    modality: null,
  })
})

test('S13.FE.01: previsualizar antes de cargar, y el cargue sólo se habilita después', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await mockActiveSnapshot(page, SNAPSHOT)
  await page.route('**/api/v1/observatory/profiles', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PROFILE]) }),
  )

  let previewQuery = ''
  await page.route('**/api/v1/observatory/imports/preview?**', (route) => {
    previewQuery = new URL(route.request().url()).search
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        totalRows: 10,
        created: 9,
        updated: 0,
        skipped: 0,
        unresolvedMunicipalities: 6,
        failures: [{ sheetName: 'EXTORSION', rowNumber: 7, reason: "no se reconoce 'ayer' como fecha" }],
      }),
    })
  })

  const jobId = '7c1f1f6e-3f1e-4a52-8f7e-1d0a2b3c4d5e'
  await page.route('**/api/v1/observatory/imports?**', (route) =>
    route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ jobId }) }),
  )
  await page.route(`**/api/v1/observatory/imports/${jobId}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobId,
        status: 'DONE',
        snapshotId: SNAPSHOT.id,
        totalRows: 10,
        createdRows: 9,
        skippedRows: 0,
        failures: [{ sheetName: 'EXTORSION', rowNumber: 7, reason: "no se reconoce 'ayer' como fecha" }],
        requestedAt: '2026-09-07T14:05:00Z',
        completedAt: '2026-09-07T14:05:03Z',
      }),
    }),
  )

  await page.goto('/observatorio/cargue')

  // El mapeo provisional se dice en pantalla, no se esconde (docs/00 §8.8).
  await expect(page.getByText(/Mapeo provisional/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmar cargue' })).toBeDisabled()

  await page.getByLabel('Fecha de corte').fill('2025-12-31')
  await page.getByLabel('Etiqueta de la mesa (opcional)').fill('Mesa de Seguimiento No.52')
  await page.getByLabel('Archivo').setInputFiles({
    name: 'DELITO EXTORSION - SECUESTRO.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('PK-fake-xlsx'),
  })

  await page.getByRole('button', { name: 'Previsualizar' }).click()

  await expect(page.getByText('Previsualización — no se escribió nada todavía')).toBeVisible()
  await expect(page.getByText("EXTORSION · fila 7")).toBeVisible()
  await expect(page.getByText("no se reconoce 'ayer' como fecha")).toBeVisible()
  expect(previewQuery).toContain('profileCode=FISCALIA_EXTORSION_SECUESTRO')
  expect(previewQuery).toContain('cutoffDate=2025-12-31')

  await page.getByRole('button', { name: 'Confirmar cargue' }).click()
  await expect(page.getByText(/9 hechos nuevos y 0 que ya estaban, de 10 filas leídas/)).toBeVisible()
})

test('S13.FE.01: un HOTLINE_OPERATOR no entra al observatorio ni lo ve en el menú', async ({ page }) => {
  await mockSession(page, OPERATOR_SESSION)

  await page.goto('/observatorio/hechos')

  await expect(page).toHaveURL(/\/\?denied=OBSERVATORY/)
  await expect(page.getByRole('link', { name: 'Observatorio' })).toBeHidden()
})
