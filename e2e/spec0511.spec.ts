import { test, expect, type Page } from '@playwright/test'

/**
 * SPEC-0511 — La dirección de la última posición.
 *
 * <p>La coordenada es el dato y no se quita nunca; la dirección es su
 * traducción aproximada, dice de dónde salió, y si no la hay dice por qué.
 */
const COMMANDER = {
  userId: '00000000-0000-0000-0000-000000000205',
  displayName: 'Mayor Peláez Rincón',
  roles: ['UNIT_COMMANDER'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}
const VEHICLE_ID = '11111111-1111-1111-1111-111111111111'
const none = { availability: 'NOT_AVAILABLE', value: null }

const TELEMETRY = {
  vehicleId: VEHICLE_ID, plate: 'OBG101', trackingState: 'ENROLLED', providerCode: 'SIMULATOR',
  capabilities: { fields: {}, nominalIntervalSeconds: { availability: 'UNKNOWN', value: null }, pushCapable: false, pullCapable: true },
  lastFix: {
    vehicleId: VEHICLE_ID, latitude: 4.6612, longitude: -74.0621,
    recordedAt: '2026-09-11T12:00:00Z', receivedAt: '2026-09-11T12:00:05Z', transportLagSeconds: 5,
    speedKph: none, headingDegrees: none, altitudeMeters: none, accuracyMeters: none,
    ignitionOn: { availability: 'UNKNOWN', value: null }, odometerKm: none,
  },
  movement: {
    state: 'STOPPED', reason: 'MOVED_LESS_THAN_GPS_ERROR', speedKph: none, speedSource: 'NONE',
    observedAt: '2026-09-11T12:00:00Z', ageSeconds: 30, stale: false,
  },
  simulated: true,
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function mockConsole(page: Page, address: Record<string, unknown>) {
  // Primero el comodín: en Playwright gana la última ruta registrada.
  await page.route('**/api/**', (route) => route.fulfill(json([])))
  await page.route('**/api/v1/me', (route) => route.fulfill(json(COMMANDER)))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}`, (route) => route.fulfill(json({
    id: VEHICLE_ID, plate: 'OBG101', vehicleType: 'CAMIONETA', make: 'Toyota', model: 'Hilux', modelYear: 2022,
    territorialUnitId: COMMANDER.territorialUnitId, status: 'AVAILABLE', odometerKm: 12000, version: 3,
  })))
  await page.route(`**/api/v1/telemetry/vehicles/${VEHICLE_ID}`, (route) => route.fulfill(json(TELEMETRY)))
  await page.route(`**/api/v1/telemetry/vehicles/${VEHICLE_ID}/address`, (route) => route.fulfill(json({
    vehicleId: VEHICLE_ID, fromCache: false, latitude: 4.6612, longitude: -74.0621, ...address,
  })))
}

test.describe('SPEC-0511: la dirección de la última posición', () => {
  test('CA-1: la dirección aparece bajo la coordenada, como aproximada y con su fuente', async ({ page }) => {
    await mockConsole(page, { status: 'RESOLVED', address: 'Cra. 11 #72-30, Bogotá, Colombia', provider: 'GOOGLE' })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=ubicacion`)

    await expect(page.getByText('4.66120, -74.06210')).toBeVisible()
    await expect(page.getByText('Cra. 11 #72-30, Bogotá, Colombia')).toBeVisible()
    await expect(page.getByText('Dirección aproximada · Google')).toBeVisible()
  })

  test('una dirección reutilizada dentro de 100 m dice a cuántos metros está', async ({ page }) => {
    await mockConsole(page, {
      status: 'RESOLVED', address: 'Cra. 11 #72-30, Bogotá, Colombia', provider: 'GOOGLE', fromCache: true, offsetMeters: 56,
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=ubicacion`)

    await expect(page.getByText('Dirección aproximada (a unos 56 m) · Google')).toBeVisible()
  })

  test('CA-5: apagada, la coordenada sigue y se dice por qué no hay dirección', async ({ page }) => {
    await mockConsole(page, {
      status: 'DISABLED', address: null, provider: null,
      detail: 'La consulta de direcciones no está habilitada en este despliegue.',
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=ubicacion`)

    await expect(page.getByText('4.66120, -74.06210')).toBeVisible()
    await expect(page.getByText('La consulta de direcciones no está habilitada en este despliegue.')).toBeVisible()
    await expect(page.getByText(/Dirección aproximada/)).toHaveCount(0)
  })

  test('CA-6: con el servicio caído la ficha no se rompe', async ({ page }) => {
    await mockConsole(page, { status: 'UNAVAILABLE', provider: 'GOOGLE', detail: 'El servicio de direcciones no está disponible.' })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=ubicacion`)

    await expect(page.getByText('4.66120, -74.06210')).toBeVisible()
    await expect(page.getByText('El servicio de direcciones no está disponible.')).toBeVisible()
  })
})
