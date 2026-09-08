import { test, expect, type Page } from '@playwright/test'

/**
 * SPEC-0806: el formulario de captura del observatorio se DIBUJA con el perfil
 * vigente. La prueba de que funciona no es que se vea bonito: es que una
 * columna que no existe en el código de la consola -- `INVESTIGADO` -- aparezca
 * en el formulario, viaje al backend y se vea de vuelta en la tabla, sólo
 * porque el perfil la declara.
 */
const ANALYST_SESSION = {
  userId: '00000000-0000-0000-0000-000000000202',
  displayName: 'Sargento Cárdenas Marín',
  roles: ['INTELLIGENCE_ANALYST'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

const PROFILE_V2 = {
  id: '00000000-0000-0000-0000-000000000902',
  code: 'FISCALIA_EXTORSION_SECUESTRO',
  version: 2,
  provisional: true,
  displayName: 'Fiscalía — Extorsión y Secuestro (v2 con INVESTIGADO)',
  sheets: ['SECUESTRO', 'EXTORSION'],
  validFrom: '2026-01-01',
  forms: [
    {
      sheetName: 'SECUESTRO',
      profile: 'KIDNAPPING',
      fields: [
        { code: 'occurredOn', label: 'FECHA', type: 'DATE', required: true, dynamic: false, options: [] },
        {
          code: 'kidnappingType',
          label: 'TIPO SECUESTRO',
          type: 'ENUM',
          required: false,
          dynamic: false,
          options: [{ value: 'SIMPLE', label: 'SECUESTRO SIMPLE' }],
        },
        { code: 'departmentText', label: 'DEPARTAMENTO', type: 'TEXT', required: true, dynamic: false, options: [] },
        { code: 'municipalityText', label: 'MUNICIPIO', type: 'TEXT', required: true, dynamic: false, options: [] },
        { code: 'authorGroup', label: 'AUTOR', type: 'TEXT', required: true, dynamic: false, options: [] },
        { code: 'investigado', label: 'INVESTIGADO', type: 'TEXT', required: false, dynamic: true, options: [] },
      ],
    },
  ],
}

const INCIDENT_WITH_ATTRIBUTE = {
  id: 'a1d3f9c2-77aa-4bd8-9d4f-51f5b1c0e777',
  snapshotId: '2b8f0a3c-5f1e-4c3a-9a11-0f2ce3f1a001',
  profile: 'KIDNAPPING',
  occurredOn: '2026-02-15',
  departmentText: 'ANTIOQUIA',
  municipalityText: 'MEDELLIN',
  municipalityCode: '05001',
  municipalityUnresolved: false,
  authorGroup: 'GDCO',
  kidnappingType: 'SIMPLE',
  victimStatus: null,
  occupation: null,
  modality: null,
  notes: null,
  attributes: { investigado: 'CTI 110016000000202600123' },
  sourceRowNumber: null,
  registeredAt: '2026-09-08T14:05:00Z',
  updatedAt: null,
}

async function mockObservatory(page: Page, incidents: Record<string, unknown>[]) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYST_SESSION) }),
  )
  await page.route('**/api/v1/observatory/snapshots/active', (route) => route.fulfill({ status: 204, body: '' }))
  await page.route('**/api/v1/observatory/profiles', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([PROFILE_V2]) }),
  )
  await page.route('**/api/v1/observatory/incidents?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        content: incidents,
        totalElements: incidents.length,
        totalPages: incidents.length ? 1 : 0,
        pageNumber: 0,
        pageSize: 50,
      }),
    }),
  )
}

test('SPEC-0806 CA-1/CA-2: el formulario sale del perfil, con el orden y las etiquetas del Excel', async ({ page }) => {
  await mockObservatory(page, [])

  let posted: Record<string, unknown> | null = null
  await page.route('**/api/v1/observatory/incidents', (route) => {
    posted = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(INCIDENT_WITH_ATTRIBUTE) })
  })

  await page.goto('/observatorio/hechos')
  await page.getByRole('button', { name: 'Registrar hecho' }).click()

  // El orden es el de la hoja, no el que se le ocurra a la consola.
  const capture = page.locator('section', { hasText: 'Registrar hecho directamente' })
  const labels = await capture.locator('label > span').allInnerTexts()
  expect(labels.map((label) => label.replace('(columna del perfil)', '').replace('*', '').trim())).toEqual([
    'DELITO (HOJA)',
    'FECHA',
    'TIPO SECUESTRO',
    'DEPARTAMENTO',
    'MUNICIPIO',
    'AUTOR',
    'INVESTIGADO',
  ])

  await capture.getByLabel('FECHA').fill('2026-02-15')
  await capture.getByLabel('DEPARTAMENTO').fill('ANTIOQUIA')
  await capture.getByLabel('MUNICIPIO', { exact: true }).fill('MEDELLIN')
  await capture.getByLabel('AUTOR').fill('GDCO')
  await capture.getByLabel('TIPO SECUESTRO').selectOption('SIMPLE')
  await capture.getByLabel('INVESTIGADO').fill('CTI 110016000000202600123')
  await page.getByRole('button', { name: 'Registrar', exact: true }).click()

  // La columna declarada viaja en `attributes`, NO como columna tipada.
  await expect.poll(() => posted).not.toBeNull()
  expect(posted).toMatchObject({
    profile: 'KIDNAPPING',
    occurredOn: '2026-02-15',
    authorGroup: 'GDCO',
    kidnappingType: 'SIMPLE',
    attributes: { investigado: 'CTI 110016000000202600123' },
  })
})

test('SPEC-0806 CA-3: lo capturado en una columna declarada se ve de vuelta en la tabla', async ({ page }) => {
  await mockObservatory(page, [INCIDENT_WITH_ATTRIBUTE])

  await page.goto('/observatorio/hechos')

  await expect(page.getByRole('columnheader', { name: 'INVESTIGADO' })).toBeVisible()
  await expect(page.getByText('CTI 110016000000202600123')).toBeVisible()
})
