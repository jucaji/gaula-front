import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * SPEC-0506 — Comando de flota.
 *
 * Lo que estas pruebas defienden es lo que el módulo existe para garantizar:
 * que un dato ausente NUNCA se lea como un cero, que «nunca reportó» y «sin
 * señal» se vean distintos, y que un dato simulado se anuncie como tal.
 *
 * <p><strong>El mapa no se verifica aquí.</strong> Playwright sin cabeza no
 * tiene WebGL, y Google Maps además necesita salir a internet — dos razones
 * independientes para que el SDK se mockee y el mapa real se mire en vivo, que
 * es la misma conclusión a la que llegó SPEC-0807 con MapLibre.
 */
const COMMANDER = {
  userId: '00000000-0000-0000-0000-000000000205',
  displayName: 'Mayor Peláez Rincón',
  roles: ['UNIT_COMMANDER'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

const ADMIN_STAFF = {
  userId: '00000000-0000-0000-0000-000000000206',
  displayName: 'Técnico Gómez Salas',
  roles: ['ADMIN_STAFF'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const FIELDS = [
  'vehicleId', 'territorialUnitId', 'lat', 'lon', 'speedKph', 'speedAvailability',
  'speedSource', 'state', 'reason', 'recordedAt', 'ageSeconds', 'stale', 'simulated',
]

const VEHICLE_MOVING = '11111111-1111-1111-1111-111111111111'
const VEHICLE_NO_SPEED = '22222222-2222-2222-2222-222222222222'
const VEHICLE_OFFLINE = '33333333-3333-3333-3333-333333333333'
const VEHICLE_NEVER = '44444444-4444-4444-4444-444444444444'
const UNIT = '00000000-0000-0000-0000-000000000001'

function snapshot() {
  return {
    observedAt: new Date().toISOString(),
    fields: FIELDS,
    truncated: false,
    total: 4,
    rows: [
      [VEHICLE_MOVING, UNIT, 4.6512, -74.0721, 62.5, 'SUPPORTED', 'REPORTED', 'MOVING',
        'REPORTED_SPEED_ABOVE_THRESHOLD', new Date().toISOString(), 8, false, false],
      // El caso que importa: proveedor que NO entrega velocidad.
      [VEHICLE_NO_SPEED, UNIT, 4.6612, -74.0821, null, 'NOT_AVAILABLE', 'NONE', 'UNDETERMINED',
        'NO_SPEED_AND_NO_PRIOR_FIX', new Date().toISOString(), 12, false, true],
      [VEHICLE_OFFLINE, UNIT, 4.6712, -74.0921, null, 'NOT_AVAILABLE', 'NONE', 'NO_SIGNAL',
        'SIGNAL_LOST', new Date(Date.now() - 3_600_000).toISOString(), 3600, true, false],
      [VEHICLE_NEVER, UNIT, null, null, null, 'NOT_AVAILABLE', 'NONE', 'NEVER_REPORTED',
        'NO_DEVICE_ENROLLED', null, null, false, false],
    ],
  }
}

async function mockConsole(page: Page, session: Record<string, unknown>) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }))
  await page.route('**/api/v1/telemetry/map-config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Sin clave: el mapa degrada a su marcador de posición. Es el mismo
      // camino que recorrería un despliegue aislado (docs/08 §5), así que
      // probarlo aquí prueba algo real, no sólo evita cargar el SDK.
      body: JSON.stringify({ provider: 'GOOGLE', apiKey: null, mapId: null, configured: false }),
    }))
  await page.route('**/api/v1/telemetry/positions*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot()) }))
}

test.describe('SPEC-0506: comando de flota', () => {
  test('CA-1/CA-3: sin velocidad del proveedor NO se pinta un cero', async ({ page }) => {
    await mockConsole(page, COMMANDER)
    await page.goto('/flota')

    // El vehículo sin velocidad aparece como "Sin determinar", no como detenido
    // ni con 0 km/h. Un cero aquí sería una afirmación que nadie hizo.
    await expect(page.getByRole('button', { name: /Sin determinar/i }).first()).toBeVisible()
    const lista = page.getByRole('list', { name: 'Vehículos' })
    await expect(lista).not.toContainText('0 km/h')
  })

  test('CA-2: "nunca reportó" y "sin señal" se ven distintos', async ({ page }) => {
    await mockConsole(page, COMMANDER)
    await page.goto('/flota')

    const resumen = page.getByRole('group', { name: 'Estado de la flota' })
    await expect(resumen.getByRole('button', { name: /Sin señal/ })).toBeVisible()
    await expect(resumen.getByRole('button', { name: /Nunca reportó/ })).toBeVisible()

    const lista = page.getByRole('list', { name: 'Vehículos' })
    await expect(lista).toContainText('Sin señal')
    await expect(lista).toContainText('Nunca reportó')
    await expect(lista).toContainText('Sin ninguna posición registrada')
  })

  test('CA-8: el dato simulado se anuncia', async ({ page }) => {
    await mockConsole(page, COMMANDER)
    await page.goto('/flota')

    await expect(page.getByText('Simulado').first()).toBeVisible()
  })

  test('CA-15: la antigüedad de cada posición está en pantalla', async ({ page }) => {
    await mockConsole(page, COMMANDER)
    await page.goto('/flota')

    const lista = page.getByRole('list', { name: 'Vehículos' })
    await expect(lista).toContainText(/hace/)
  })

  test('el mapa sin configurar lo DICE, en vez de dejar un rectángulo en blanco', async ({ page }) => {
    await mockConsole(page, COMMANDER)
    await page.goto('/flota')

    await expect(page.getByText(/El mapa no está configurado/)).toBeVisible()
    // Y la consola sigue sirviendo: la lista está ahí con sus vehículos.
    await expect(page.getByRole('list', { name: 'Vehículos' })).toBeVisible()
  })

  test('filtrar por estado deja sólo ese estado, y el filtro vive en la URL', async ({ page }) => {
    await mockConsole(page, COMMANDER)
    await page.goto('/flota')

    await page.getByRole('group', { name: 'Estado de la flota' })
      .getByRole('button', { name: /Sin señal/ }).click()

    await expect(page).toHaveURL(/estado=NO_SIGNAL/)
    const lista = page.getByRole('list', { name: 'Vehículos' })
    await expect(lista.getByRole('listitem')).toHaveCount(1)
  })

  test('docs/04 §2.4: la unidad administrativa NO entra al comando de flota', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)
    await page.goto('/flota')

    // Gestiona la flota y no ve la operación: la guarda de ruta la devuelve.
    await expect(page).not.toHaveURL(/\/flota$/)
    await expect(page.getByRole('link', { name: 'Comando de flota' })).toHaveCount(0)
  })

  test('accesibilidad: sin violaciones serias', async ({ page }) => {
    await mockConsole(page, COMMANDER)
    await page.goto('/flota')
    await page.getByRole('list', { name: 'Vehículos' }).waitFor()

    const resultados = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()

    expect(resultados.violations).toEqual([])
  })
})
