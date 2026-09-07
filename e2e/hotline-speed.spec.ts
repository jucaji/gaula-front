import { test, expect, type Page } from '@playwright/test'

/**
 * S4.QA.01 -- `HotlineSpeedTest`. Criterio de aceptación A1 (docs/00 §6):
 * "una llamada a la 147 produce un caso con radicado en ≤ 3 interacciones
 * del operador". docs/11 §"Pirámide de pruebas": "cuenta las interacciones
 * y falla si son cuatro".
 *
 * Cuenta cada `fill`/`selectOption`/`click` real emitido contra la página --
 * no cada tecla individual (eso volvería inalcanzable a cualquier campo de
 * texto) -- porque SPEC-0101 mide el conteo con Playwright justamente a este
 * nivel de granularidad.
 *
 * Hallazgo real al construir esta prueba: el camino mínimo (tipología +
 * municipio + "Crear caso") pedía 4 acciones porque seleccionar un municipio
 * exigía escribir Y ADEMÁS hacer clic en la sugerencia. Fix aplicado en
 * `recepcion/index.tsx`: si sólo queda una coincidencia, salir del campo
 * (`onBlur`) la selecciona sola -- el clic en el siguiente control (Tipología)
 * ya produce ese `blur` de forma natural, sin gastar una interacción aparte.
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

test('HotlineSpeedTest: crear un caso desde una llamada toma ≤ 3 interacciones (criterio A1)', async ({ page }) => {
  await mockSession(page)

  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ code: 'KIDNAPPING', name: 'Secuestro extorsivo', gaulaJurisdiction: true }]),
    }),
  )
  await page.route('**/api/v1/catalog/municipalities**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { code: '05001', name: 'Medellín', departmentName: 'Antioquia', territorialUnitName: 'GAULA Militar Antioquia' },
      ]),
    }),
  )
  await page.route('**/api/v1/catalog/modus-operandi**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )

  let call: Record<string, unknown> = {
    id: CALL_ID,
    sequenceNumber: 42,
    startedAt: new Date().toISOString(),
    status: 'IN_PROGRESS',
  }
  await page.route('**/api/v1/calls', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(call) })
  })
  await page.route(`**/api/v1/calls/${CALL_ID}`, (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    call = { ...call, ...(route.request().postDataJSON() as Record<string, unknown>) }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(call) })
  })
  await page.route(`**/api/v1/calls/${CALL_ID}/close-as-case`, (route) => {
    expect(call.municipalityCode, 'el municipio debe haber quedado guardado antes de cerrar (SPEC-0106 CA-1)').toBe('05001')
    expect(call.crimeTypeCode, 'la tipología debe haber quedado guardada antes de cerrar (SPEC-0106 CA-1)').toBe('KIDNAPPING')
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })

  await page.goto('/recepcion')
  await expect(page.getByText(/GRABANDO/)).toBeVisible()

  let interactions = 0
  const interact = async (action: () => Promise<void>) => {
    await action()
    interactions += 1
  }

  // 1) Municipio -- escribir hasta que quede una sola coincidencia; se
  // autoselecciona sola en cuanto llega esa única coincidencia.
  await interact(() => page.getByPlaceholder('Tolerante a acentos y errores').fill('medel'))
  await expect(page.getByText('GAULA Militar Antioquia')).toBeVisible()

  // 2) Tipología.
  await interact(async () => {
    await page.getByLabel('Tipología').selectOption('KIDNAPPING')
  })
  await expect(page.getByText('● GAULA')).toBeVisible()
  await page.waitForLoadState('networkidle')

  // 3) Crear caso -- el desenlace.
  await interact(() => page.getByRole('button', { name: 'Crear caso' }).click())

  await expect(page).toHaveURL(/\/recepcion\/llamadas/)
  expect(interactions, 'A1: crear un caso desde una llamada debe tomar 3 interacciones o menos').toBeLessThanOrEqual(3)
})
