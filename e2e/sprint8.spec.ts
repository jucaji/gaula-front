import { test, expect, type Page } from '@playwright/test'

/**
 * S8.FE.01-07 (docs/06 §8.3, SPEC-0209): flota y PWA de campo. `/campo` es
 * el recorrido crítico -- un operador sin señal en terreno debe poder
 * seguir registrando actuaciones y evidencia, ver su caso ir a la cola, y
 * confiar en que se envía sola al recuperar conexión (§1.4: nunca adivinar,
 * nunca perder el registro).
 */
const FIELD_OFFICER_SESSION = {
  userId: '00000000-0000-0000-0000-000000000204',
  displayName: 'Cabo Ríos Peña',
  roles: ['FIELD_OFFICER'],
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

async function mockSession(page: Page, session: Record<string, unknown>) {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }))
}

const TRACKING_NUMBER = 'GAULA-BOG-2026-000099'

function caseFileBody(overrides: Record<string, unknown> = {}) {
  return {
    trackingNumber: TRACKING_NUMBER,
    status: 'RECEIVED',
    summary: 'Denunciante reporta llamada exigiendo dinero por presunto secuestro.',
    municipalityCode: '11001',
    crimeTypeCode: 'KIDNAPPING',
    version: 1,
    ...overrides,
  }
}

test('S8.FE.02: /campo muestra una sola columna con los casos del operador de campo', async ({ page }) => {
  await mockSession(page, FIELD_OFFICER_SESSION)
  await page.route('**/api/v1/case-files?page=0&size=50', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [caseFileBody()] }) }),
  )

  await page.goto('/campo')
  await expect(page.getByRole('heading', { name: 'Mis casos' })).toBeVisible()
  await expect(page.getByText(TRACKING_NUMBER)).toBeVisible()
})

test('S8.FE.05: sin conexión, registrar una actuación la deja en cola y se envía sola al reconectar', async ({ page, context }) => {
  await mockSession(page, FIELD_OFFICER_SESSION)
  await page.route(`**/api/v1/case-files/${TRACKING_NUMBER}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(caseFileBody()) }),
  )
  let actionsCalls = 0
  await page.route(`**/api/v1/case-files/${TRACKING_NUMBER}/actions`, (route) => {
    actionsCalls += 1
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'action-1' }) })
  })

  await page.goto(`/campo/${TRACKING_NUMBER}`)
  await expect(page.getByText(TRACKING_NUMBER)).toBeVisible()

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Registrar actuación' }).click()
  await page.getByLabel('Tipo').selectOption('VERIFICATION')
  await page.getByLabel('Descripción').fill('Verificación en terreno, sin novedad.')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect(page.getByText('Sin conexión -- la actuación quedó en la cola, se enviará sola.')).toBeVisible()
  await expect(page.getByText('1 registro(s) en cola')).toBeVisible()
  expect(actionsCalls).toBe(0)

  await context.setOffline(false)
  await expect(page.getByText(/Todo sincronizado/)).toBeVisible({ timeout: 10_000 })
  expect(actionsCalls).toBe(1)
})

test('S8.FE.05: un rechazo real del servidor queda "rechazado" -- no se reintenta solo, y se puede reintentar o descartar a mano', async ({
  page,
  context,
}) => {
  await mockSession(page, FIELD_OFFICER_SESSION)
  await page.route(`**/api/v1/case-files/${TRACKING_NUMBER}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(caseFileBody()) }),
  )
  let actionsCalls = 0
  await page.route(`**/api/v1/case-files/${TRACKING_NUMBER}/actions`, (route) => {
    actionsCalls += 1
    return route.fulfill({
      status: 403,
      contentType: 'application/problem+json',
      body: JSON.stringify({ status: 403, title: 'Acceso denegado', detail: 'No tiene permiso para acceder a este recurso.', code: 'ACCESS_DENIED' }),
    })
  })

  await page.goto(`/campo/${TRACKING_NUMBER}`)
  await expect(page.getByText(TRACKING_NUMBER)).toBeVisible()

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Registrar actuación' }).click()
  await page.getByLabel('Tipo').selectOption('VERIFICATION')
  await page.getByLabel('Descripción').fill('Verificación en terreno, sin novedad.')
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByText('1 registro(s) en cola')).toBeVisible()

  await context.setOffline(false)
  await expect(page.getByText('1 rechazado(s) -- revisar')).toBeVisible({ timeout: 10_000 })
  expect(actionsCalls).toBe(1)

  // un rechazo del servidor es terminal -- drainQueue no lo reintenta solo, sin importar cuánto se espere
  await page.waitForTimeout(2_500)
  expect(actionsCalls).toBe(1)

  await page.getByRole('button', { name: '1 rechazado(s) -- revisar' }).click()
  await expect(page.getByText('No tiene permiso para acceder a este recurso.')).toBeVisible()
  await page.getByRole('button', { name: 'Descartar' }).click()
  await expect(page.getByText('Todo sincronizado', { exact: false })).toHaveCount(0)
  await expect(page.getByText(/rechazado/)).toHaveCount(0)
})

test('S8.FE.06: cambiar de estado exige conexión -- no se puede encolar', async ({ page, context }) => {
  await mockSession(page, FIELD_OFFICER_SESSION)
  await page.route(`**/api/v1/case-files/${TRACKING_NUMBER}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(caseFileBody()) }),
  )

  await page.goto(`/campo/${TRACKING_NUMBER}`)
  await expect(page.getByText(TRACKING_NUMBER)).toBeVisible()

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Cambiar estado' }).click()
  await expect(page.getByText('Cambiar de estado exige conexión -- vuelva a intentarlo cuando recupere señal.')).toBeVisible()
  await expect(page.getByLabel('Nuevo estado')).toHaveCount(0)
})

test('S8.FE.01: sin permiso FLEET, /recursos/flota redirige en vez de mostrar la flota', async ({ page }) => {
  await mockSession(page, ANALYST_SESSION)
  await page.goto('/recursos/flota')
  await expect(page).toHaveURL(/denied=FLEET/)
})
