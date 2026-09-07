import { test, expect, type Page } from '@playwright/test'

/**
 * S6.QA.01 (criterio A8): "un reporte cargado en el formulario valida al
 * momento y no requiere transcripción" -- el mensaje que aparece bajo cada
 * campo es el mismo que devuelve `ReportValidationEngine` en el backend
 * (docs/05 §4), no una reimplementación de las reglas en el cliente.
 */
const HOTLINE_OPERATOR_SESSION = {
  userId: '00000000-0000-0000-0000-000000000201',
  displayName: 'Soldado Ramírez Gómez',
  roles: ['HOTLINE_OPERATOR'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

const UNIT_COMMANDER_SESSION = {
  userId: '00000000-0000-0000-0000-000000000301',
  displayName: 'Teniente Coronel Vargas',
  roles: ['UNIT_COMMANDER'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

const SIMPLE_TEMPLATE = {
  id: '00000000-0000-0000-0000-000000000801',
  code: 'OPERATIONAL_REPORT',
  version: 1,
  provisional: true,
  validFrom: '2026-01-01',
  sections: [
    {
      code: 'identificacion',
      title: 'Identificación',
      fields: [
        { code: 'incidentDate', label: 'Fecha del incidente', type: 'DATE', required: true, notFuture: true, fields: [] },
        { code: 'narrative', label: 'Narrativa de la operación', type: 'TEXT', required: true, maxLength: 4000, fields: [] },
      ],
    },
  ],
}

async function mockSession(page: Page, session: Record<string, unknown>) {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }))
}

test('S6.QA.01: el formulario dirigido por plantilla muestra el mensaje del backend bajo cada campo (criterio A8)', async ({ page }) => {
  await mockSession(page, HOTLINE_OPERATOR_SESSION)
  await page.route('**/api/v1/report-templates/current', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIMPLE_TEMPLATE) }),
  )
  await page.route('**/api/v1/operational-reports', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({
      status: 422,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        title: 'Violaciones de validación',
        status: 422,
        detail: 'El payload tiene errores.',
        code: 'REPORT_VALIDATION_FAILED',
        errors: [
          { field: 'incidentDate', message: 'Es obligatorio.' },
          { field: 'narrative', message: 'Es obligatorio.' },
        ],
      }),
    })
  })

  await page.goto('/reportes/nuevo')
  await expect(page.getByRole('heading', { name: 'Nuevo reporte operacional' })).toBeVisible()
  await expect(page.getByText('Plantilla provisional')).toBeVisible()

  await page.getByRole('button', { name: 'Guardar borrador' }).click()

  const dateField = page.getByLabel('Fecha del incidente *')
  const narrativeField = page.getByLabel('Narrativa de la operación *')
  await expect(dateField.locator('xpath=following-sibling::span[1]')).toHaveText('Es obligatorio.')
  await expect(narrativeField.locator('xpath=following-sibling::span[1]')).toHaveText('Es obligatorio.')
})

test('S6.FE.05: rechazar un reporte en revisión exige un motivo (UNIT_COMMANDER)', async ({ page }) => {
  await mockSession(page, UNIT_COMMANDER_SESSION)
  const reportId = '11111111-1111-1111-1111-111111111111'
  let report: Record<string, unknown> = {
    id: reportId,
    templateId: SIMPLE_TEMPLATE.id,
    status: 'UNDER_REVIEW',
    source: 'FORM',
    incidentDate: '2026-09-01',
    payload: { incidentDate: '2026-09-01', narrative: 'Operación sin novedad.' },
    submittedBy: HOTLINE_OPERATOR_SESSION.userId,
    submittedAt: '2026-09-01T10:00:00Z',
  }
  await page.route(`**/api/v1/operational-reports/${reportId}`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) })
  })
  await page.route(`**/api/v1/report-templates/${SIMPLE_TEMPLATE.id}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIMPLE_TEMPLATE) }),
  )
  let rejectBody: Record<string, unknown> | null = null
  await page.route(`**/api/v1/operational-reports/${reportId}/reject`, (route) => {
    rejectBody = route.request().postDataJSON() as Record<string, unknown>
    report = { ...report, status: 'REJECTED', rejectionReason: rejectBody.reason }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(report) })
  })

  await page.goto(`/reportes/${reportId}`)
  await expect(page.getByText('En revisión')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Confirmar rechazo' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Rechazar' }).click()
  const confirmButton = page.getByRole('button', { name: 'Confirmar rechazo' })
  await expect(confirmButton).toBeDisabled()

  await page.getByLabel('Motivo del rechazo *').fill('Faltan soportes fotográficos.')
  await expect(confirmButton).toBeEnabled()
  await confirmButton.click()

  await expect(page.getByText('Rechazado')).toBeVisible()
  expect(rejectBody).toMatchObject({ reason: 'Faltan soportes fotográficos.' })
})

test('S6.FE.06: importar Excel muestra progreso y el reporte de filas rechazadas', async ({ page }) => {
  await mockSession(page, HOTLINE_OPERATOR_SESSION)
  await page.route('**/api/v1/operational-reports?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [] }) }),
  )
  const jobId = '22222222-2222-2222-2222-222222222222'
  await page.route('**/api/v1/operational-reports/import?*', (route) =>
    route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({ jobId }) }),
  )
  let pollCount = 0
  await page.route(`**/api/v1/operational-reports/import/${jobId}`, (route) => {
    pollCount += 1
    if (pollCount < 2) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jobId, status: 'PROCESSING' }) })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jobId,
        status: 'DONE',
        totalRows: 5,
        created: 4,
        failures: [{ rowNumber: 3, reason: 'arrests: Es obligatorio.' }],
      }),
    })
  })

  await page.goto('/reportes')
  await page.getByRole('button', { name: 'Importar Excel' }).click()

  await page.setInputFiles('input[type="file"]', {
    name: 'reportes.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: Buffer.from('fake-excel-content'),
  })
  await page.getByRole('button', { name: 'Subir' }).click()

  await expect(page.getByText('Procesando el archivo…')).toBeVisible()
  await expect(page.getByText('4 de 5 filas se importaron correctamente.')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('Fila 3: arrests: Es obligatorio.')).toBeVisible()
})
