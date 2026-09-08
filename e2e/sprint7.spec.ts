import { test, expect, type Page } from '@playwright/test'

/**
 * S7.FE.01 (cola de revisión de correo) y S7.FE.04 (tablero de analítica).
 * El correo es la red de seguridad, no el plan (§1.4) -- estos recorridos
 * verifican que sigue siendo una bandeja secundaria, nunca un atajo que
 * adivine el reporte por el operador.
 */
const HOTLINE_OPERATOR_SESSION = {
  userId: '00000000-0000-0000-0000-000000000201',
  displayName: 'Soldado Ramírez Gómez',
  roles: ['HOTLINE_OPERATOR'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

const ANALYST_SESSION = {
  userId: '00000000-0000-0000-0000-000000000202',
  displayName: 'Sargento Cárdenas Marín',
  roles: ['INTELLIGENCE_ANALYST'],
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

const EMAIL_ID = '33333333-3333-3333-3333-333333333333'

test('S7.FE.01: resolver un correo en revisión captura el reporte completo desde cero (sin pre-llenado)', async ({ page }) => {
  await mockSession(page, HOTLINE_OPERATOR_SESSION)
  await page.route(`**/api/v1/review-queue/${EMAIL_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: EMAIL_ID,
        sender: 'comandante.puesto@ejercito.mil.co',
        subject: 'Reporte operativo - Vereda El Retiro',
        receivedAt: '2026-09-07T15:00:00Z',
        status: 'NEEDS_REVIEW',
        extractedText: 'Dos personas capturadas por extorsión en la vereda El Retiro.',
        attempts: 0,
      }),
    }),
  )
  await page.route('**/api/v1/report-templates/current', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIMPLE_TEMPLATE) }),
  )
  let resolveBody: Record<string, unknown> | null = null
  await page.route(`**/api/v1/review-queue/${EMAIL_ID}/resolve`, (route) => {
    resolveBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: '44444444-4444-4444-4444-444444444444', status: 'DRAFT' }),
    })
  })
  await page.route('**/api/v1/operational-reports/44444444-4444-4444-4444-444444444444', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '44444444-4444-4444-4444-444444444444',
        templateId: SIMPLE_TEMPLATE.id,
        status: 'DRAFT',
        payload: { incidentDate: '2026-09-07', narrative: 'Dos personas capturadas por extorsión.' },
      }),
    }),
  )
  await page.route(`**/api/v1/report-templates/${SIMPLE_TEMPLATE.id}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIMPLE_TEMPLATE) }),
  )

  await page.goto(`/reportes/revision/${EMAIL_ID}`)
  await expect(page.getByText('comandante.puesto@ejercito.mil.co')).toBeVisible()
  await expect(page.getByText('Dos personas capturadas por extorsión en la vereda El Retiro.')).toBeVisible()

  // El formulario arranca VACÍO -- nada se pre-llena a partir del texto extraído.
  await expect(page.getByLabel('Narrativa de la operación *')).toHaveValue('')

  await page.getByLabel('Fecha del incidente *').fill('2026-09-07')
  await page.getByLabel('Narrativa de la operación *').fill('Dos personas capturadas por extorsión.')
  await page.getByRole('button', { name: 'Crear reporte' }).click()

  await expect(page).toHaveURL(/\/reportes\/44444444-4444-4444-4444-444444444444/)
  expect(resolveBody).toMatchObject({
    territorialUnitId: HOTLINE_OPERATOR_SESSION.territorialUnitId,
    operationalUnitId: HOTLINE_OPERATOR_SESSION.operationalUnitId,
    payload: { incidentDate: '2026-09-07', narrative: 'Dos personas capturadas por extorsión.' },
  })
})

test('S7.FE.01: un correo que no está en revisión no se puede resolver desde aquí', async ({ page }) => {
  await mockSession(page, HOTLINE_OPERATOR_SESSION)
  await page.route(`**/api/v1/review-queue/${EMAIL_ID}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: EMAIL_ID,
        sender: 'x@example.com',
        subject: 'Ya procesado',
        receivedAt: '2026-09-07T15:00:00Z',
        status: 'PARSED',
        extractedText: null,
        reportId: '55555555-5555-5555-5555-555555555555',
        attempts: 1,
      }),
    }),
  )
  await page.route('**/api/v1/report-templates/current', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SIMPLE_TEMPLATE) }),
  )

  await page.goto(`/reportes/revision/${EMAIL_ID}`)
  await expect(page.getByText(/no está en estado "Necesita revisión"/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear reporte' })).toHaveCount(0)
})

test('S7.FE.04: el tablero de analítica muestra el comparativo de período y respeta ANALYTICS', async ({ page }) => {
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
  await page.route('**/api/v1/analytics/series**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { bucket: '2026-09-05', value: 4 },
        { bucket: '2026-09-06', value: 8 },
      ]),
    }),
  )

  await page.goto('/analitica')
  await expect(page.getByRole('heading', { name: 'Analítica' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Cifras del período' })).toBeVisible()
  await expect(page.getByText('REPORTES').locator('..').getByText('12', { exact: true })).toBeVisible()
  await expect(page.getByText('50.0% vs. período anterior')).toBeVisible()
})

test('S7.FE.04 (corregido 2026-09-08): sin reportes validados el tablero lo DICE, no muestra seis ceros', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )
  // `mv_daily_kpi` sólo cuenta reportes VALIDADOS: un tablero recién puesto en
  // marcha se ve idéntico a una unidad que trabajó y no obtuvo nada. Un cero
  // afirma "cero capturas", y eso este tablero no está en condiciones de decirlo.
  await page.route('**/api/v1/analytics/kpi/compare**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        currentTotal: { reportCount: 0, arrests: 0, rescues: 0, preventedPaymentAmount: 0, weaponsSeized: 0, vehiclesSeized: 0 },
        previousTotal: { reportCount: 0, arrests: 0, rescues: 0, preventedPaymentAmount: 0, weaponsSeized: 0, vehiclesSeized: 0 },
        byModality: [],
      }),
    }),
  )
  await page.route('**/api/v1/analytics/series**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  )

  await page.goto('/analitica')

  await expect(page.getByText('No hay reportes validados en este rango')).toBeVisible()
  await expect(page.getByText(/no significa que no haya habido operaciones/)).toBeVisible()
  // Las tarjetas de cifras NO se pintan: no hay nada que cifrar. Se comprueba por
  // la región completa y no por el texto de una tarjeta -- "Capturas" y "Dinero
  // dejado de pagar" son también opciones del selector de métrica, y buscarlas
  // por texto daría un falso positivo.
  await expect(page.getByRole('region', { name: 'Cifras del período' })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ver la cola de revisión' })).toBeVisible()
})

test('S7.FE.04: sin permiso ANALYTICS, /analitica redirige en vez de mostrar el tablero', async ({ page }) => {
  await mockSession(page, HOTLINE_OPERATOR_SESSION)
  await page.goto('/analitica')
  await expect(page).toHaveURL(/denied=ANALYTICS/)
})
