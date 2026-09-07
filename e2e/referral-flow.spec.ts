import { test, expect, type Page } from '@playwright/test'

/**
 * S5.QA.01 -- E2E de derivación (criterio A3, docs/00 §6): "una llamada que
 * no es competencia del GAULA queda registrada + con la orientación entregada
 * + la evidencia que debe reunir el ciudadano". SPEC-0103.
 */
const MOCK_SESSION = {
  userId: '00000000-0000-0000-0000-000000000201',
  displayName: 'Soldado Ramírez Gómez',
  roles: ['HOTLINE_OPERATOR'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const CALL_ID = '11111111-1111-1111-1111-111111111111'

async function mockSession(page: Page) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION) }),
  )
}

async function mockOpenCall(page: Page) {
  await page.route('**/api/v1/calls', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: CALL_ID, sequenceNumber: 42, startedAt: new Date().toISOString(), status: 'IN_PROGRESS' }),
    })
  })
  await page.route(`**/api/v1/calls/${CALL_ID}`, (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: CALL_ID, sequenceNumber: 42, startedAt: new Date().toISOString(), status: 'IN_PROGRESS' }),
    })
  })
}

test('S5.QA.01: derivar una llamada que no es competencia del GAULA registra autoridad, orientación y evidencia (criterio A3)', async ({
  page,
}) => {
  await mockSession(page)
  await mockOpenCall(page)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ code: 'DOMESTIC_VIOLENCE', name: 'Violencia intrafamiliar', gaulaJurisdiction: false }]),
    }),
  )
  await page.route('**/api/v1/catalog/modus-operandi**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/v1/catalog/referral-guidelines**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          authorityId: '00000000-0000-0000-0000-000000000601',
          authorityName: 'Policía Nacional',
          authorityHotline: '123',
          crimeTypeCode: 'DOMESTIC_VIOLENCE',
          instructions: 'Derivar a la línea 123 y, si hay menores involucrados, notificar también al ICBF (141).',
          requiredEvidence: ['Fotografías de lesiones si las hay', 'Testigos', 'Antecedentes de episodios previos'],
        },
      ]),
    }),
  )
  let referralRequestBody: Record<string, unknown> | null = null
  await page.route(`**/api/v1/calls/${CALL_ID}/close-as-referral`, (route) => {
    referralRequestBody = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/recepcion')
  await expect(page.getByText(/GRABANDO/)).toBeVisible()

  await page.getByLabel('Tipología').selectOption('DOMESTIC_VIOLENCE')
  await expect(page.getByText('● REFERRED')).toBeVisible()

  await page.getByRole('button', { name: 'Derivar' }).click()
  await expect(page.getByText(/competencia del GAULA/)).not.toBeVisible()
  await expect(page.getByText('Policía Nacional · 123')).toBeVisible()
  await expect(page.getByText(/Evidencia: Fotografías de lesiones/)).toBeVisible()

  await page.getByText('Policía Nacional · 123').click()
  await page.getByLabel('Orientación entregada al denunciante').check()
  await page.getByPlaceholder('Notas del operador (opcional)').fill('Se orientó telefónicamente.')
  await page.getByRole('button', { name: 'Confirmar derivación' }).click()

  await expect(page).toHaveURL(/\/recepcion\/llamadas/)
  expect(referralRequestBody).toMatchObject({
    authorityId: '00000000-0000-0000-0000-000000000601',
    guidanceDelivered: true,
    evidenceInstructed: ['Fotografías de lesiones si las hay', 'Testigos', 'Antecedentes de episodios previos'],
    operatorNotes: 'Se orientó telefónicamente.',
  })
})

test('S5.QA.01: derivar una tipología de competencia del GAULA se bloquea explícitamente (SPEC-0103 CA-1)', async ({ page }) => {
  await mockSession(page)
  await mockOpenCall(page)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ code: 'KIDNAPPING', name: 'Secuestro extorsivo', gaulaJurisdiction: true }]),
    }),
  )
  await page.route('**/api/v1/catalog/modus-operandi**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  let referralGuidelinesRequested = false
  await page.route('**/api/v1/catalog/referral-guidelines**', (route) => {
    referralGuidelinesRequested = true
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/recepcion')
  await expect(page.getByText(/GRABANDO/)).toBeVisible()

  await page.getByLabel('Tipología').selectOption('KIDNAPPING')
  await page.getByRole('button', { name: 'Derivar' }).click()

  await expect(page.getByText('Esta tipología es competencia del GAULA -- no se puede derivar (SPEC-0103 CA-1).')).toBeVisible()
  expect(referralGuidelinesRequested, 'no debe consultarse el catálogo de derivación si ni siquiera se puede derivar').toBe(false)
})

/**
 * S5.FE.03: señales de alerta y recomendaciones se filtran por tipología EN
 * VIVO -- cambiar la tipología a mitad de llamada debe refrescar el panel de
 * apoyo, no dejar pegado el contenido de la tipología anterior.
 */
test('S5.FE.03: el panel de apoyo al operador se refiltra al cambiar la tipología', async ({ page }) => {
  await mockSession(page)
  await mockOpenCall(page)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { code: 'KIDNAPPING', name: 'Secuestro extorsivo', gaulaJurisdiction: true },
        { code: 'EXTORTION', name: 'Extorsión', gaulaJurisdiction: true },
      ]),
    }),
  )
  await page.route('**/api/v1/catalog/modus-operandi**', (route) => {
    const url = new URL(route.request().url())
    const crimeTypeCode = url.searchParams.get('crimeTypeCode')
    const body =
      crimeTypeCode === 'KIDNAPPING'
        ? [{ id: 'mo-1', name: 'Falso secuestro', warningSigns: ['Exige verificar la voz y se niega'], recommendations: ['No pagar'] }]
        : [{ id: 'mo-2', name: 'Extorsión carcelaria', warningSigns: ['Llama desde un número desconocido'], recommendations: ['Conservar mensajes'] }]
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })

  await page.goto('/recepcion')
  await expect(page.getByText(/GRABANDO/)).toBeVisible()

  await page.getByLabel('Tipología').selectOption('KIDNAPPING')
  await expect(page.getByText('Falso secuestro')).toBeVisible()
  await expect(page.getByText('Extorsión carcelaria')).not.toBeVisible()

  await page.getByLabel('Tipología').selectOption('EXTORTION')
  await expect(page.getByText('Extorsión carcelaria')).toBeVisible()
  await expect(page.getByText('Falso secuestro')).not.toBeVisible()
})
