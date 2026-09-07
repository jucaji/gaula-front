import { test, expect, type Page } from '@playwright/test'

/**
 * E2.6 (SPEC-0407, S11.ADI.03): tablero ampliado -- exportar el comparativo
 * período-contra-período/por modalidad ya visible en `/analitica` (Sprint 7).
 * Sin frontend, `/api/v1/analytics/kpi/compare/export` nunca tuvo un llamador
 * real: eso fue justo lo que dejó en pie, sin descubrir hasta ahora, un bug
 * real de transacción de sólo lectura en el backend (ver
 * `ExportKpiComparisonService`/`ExportAnalyticsService`, corregido).
 */
const ANALYST_SESSION = {
  userId: '00000000-0000-0000-0000-000000000202',
  displayName: 'Sargento Cárdenas Marín',
  roles: ['INTELLIGENCE_ANALYST'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

async function mockSession(page: Page, session: Record<string, unknown>) {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }))
}

test('S11.ADI.03: exportar el comparativo de analítica descarga un xlsx real', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route('**/api/v1/analytics/kpi/compare**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentTotal: { reportCount: 12, arrests: 5, rescues: 1, preventedPaymentAmount: 2_000_000, weaponsSeized: 2, vehiclesSeized: 0 },
        previousTotal: { reportCount: 8, arrests: 3, rescues: 0, preventedPaymentAmount: 1_000_000, weaponsSeized: 1, vehiclesSeized: 1 },
        byModality: [{ crimeTypeCode: 'EXTORTION', current: { reportCount: 12 }, previous: { reportCount: 8 } }],
      }),
    }),
  )
  await page.route('**/api/v1/analytics/series**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))

  let exportRequested = false
  await page.route('**/api/v1/analytics/kpi/compare/export**', (route) => {
    exportRequested = true
    return route.fulfill({
      status: 200,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      headers: { 'Content-Disposition': 'attachment; filename="comparativo.xlsx"' },
      body: Buffer.from('xlsx-fake-bytes'),
    })
  })

  await page.goto('/analitica')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar comparativo' }).click()
  const download = await downloadPromise

  expect(exportRequested).toBe(true)
  expect(download.suggestedFilename()).toMatch(/^comparativo-.*\.xlsx$/)
})

test('S11.ADI.03: un rechazo real del backend al exportar muestra el error, no falla en silencio', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  await page.route('**/api/v1/analytics/kpi/compare**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ currentTotal: {}, previousTotal: {}, byModality: [] }),
    }),
  )
  await page.route('**/api/v1/analytics/series**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/v1/analytics/kpi/compare/export**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/problem+json',
      body: JSON.stringify({ status: 500, title: 'Error interno', detail: 'Ocurrió un error inesperado.', code: 'UNEXPECTED_ERROR' }),
    }),
  )

  await page.goto('/analitica')
  await page.getByRole('button', { name: 'Exportar comparativo' }).click()
  await expect(page.getByText('Ocurrió un error inesperado.')).toBeVisible()
})
