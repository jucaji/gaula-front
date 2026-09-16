import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** SPEC-0513: el recorrido dibujado y reproducible, y marcadores que laten. */
const MOCK_SESSION = {
  userId: '00000000-0000-0000-0000-000000000201',
  displayName: 'Soldado Ramírez Gómez',
  roles: ['UNIT_COMMANDER'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const VEHICULO = '00000000-0000-0000-0000-0000000004a1'

const FIELDS = [
  'vehicleId', 'plate', 'vehicleType', 'territorialUnitId', 'lat', 'lon', 'speedKph',
  'speedAvailability', 'speedSource', 'state', 'reason', 'recordedAt', 'ageSeconds',
  'stale', 'simulated',
]

const UNIT = '00000000-0000-0000-0000-000000000001'

function snapshot() {
  return {
    observedAt: new Date().toISOString(),
    fields: FIELDS,
    truncated: false,
    total: 2,
    rows: [
      [VEHICULO, 'OBG101', 'CAMIONETA', UNIT, 4.6, -74.08, 42, 'SUPPORTED', 'REPORTED', 'MOVING',
        'REPORTED_SPEED_ABOVE_THRESHOLD', new Date().toISOString(), 30, false, true],
      ['00000000-0000-0000-0000-0000000004a2', 'OBG102', 'CAMIONETA', UNIT, 4.65, -74.1, null,
        'NOT_AVAILABLE', 'NONE', 'NO_SIGNAL', 'SIGNAL_LOST', new Date(Date.now() - 3_600_000).toISOString(),
        3600, true, true],
    ],
  }
}

/** Tres posiciones, con un hueco de 20 minutos entre la segunda y la tercera. */
const HISTORIAL = {
  content: [
    { id: 'f3', vehicleId: VEHICULO, latitude: 4.62, longitude: -74.07, recordedAt: '2026-09-16T11:30:00Z', receivedAt: '2026-09-16T11:30:05Z', speedKph: { availability: 'SUPPORTED', value: 30 }, headingDegrees: { availability: 'NOT_AVAILABLE', value: null }, ignitionOn: { availability: 'UNKNOWN', value: null }, simulated: true },
    { id: 'f2', vehicleId: VEHICULO, latitude: 4.61, longitude: -74.075, recordedAt: '2026-09-16T11:10:00Z', receivedAt: '2026-09-16T11:10:05Z', speedKph: { availability: 'SUPPORTED', value: 20 }, headingDegrees: { availability: 'NOT_AVAILABLE', value: null }, ignitionOn: { availability: 'UNKNOWN', value: null }, simulated: true },
    { id: 'f1', vehicleId: VEHICULO, latitude: 4.6, longitude: -74.08, recordedAt: '2026-09-16T11:09:00Z', receivedAt: '2026-09-16T11:09:05Z', speedKph: { availability: 'SUPPORTED', value: 10 }, headingDegrees: { availability: 'NOT_AVAILABLE', value: null }, ignitionOn: { availability: 'UNKNOWN', value: null }, simulated: true },
  ],
  totalElements: 3,
  totalPages: 1,
  pageNumber: 0,
  pageSize: 1000,
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mockTelemetry(page: Page, { historial = HISTORIAL } = {}) {
  const pedidos: string[] = []
  await page.route('**/api/v1/me', (route) => route.fulfill(json(MOCK_SESSION)))
  // Sin configuración de mapa la consola degrada a la lista, que es lo que
  // queremos en E2E: el SDK de Google no carga en un navegador sin red.
  await page.route('**/api/v1/telemetry/map-config', (route) =>
    route.fulfill(json({ provider: 'GOOGLE', apiKey: null, mapId: null, configured: false })))
  await page.route('**/api/v1/telemetry/positions*', (route) => route.fulfill(json(snapshot())))
  await page.route(`**/api/v1/telemetry/vehicles/${VEHICULO}`, (route) =>
    route.fulfill(json({
      vehicleId: VEHICULO, plate: 'OBG101', territorialUnitId: UNIT, trackingState: 'ENROLLED',
      // `movement` lo lee entero el panel de detalle: estado, motivo, velocidad,
      // antigüedad y si está añeja. Faltaba `speedKph` y la pantalla reventaba.
      movement: {
        state: 'MOVING', reason: 'REPORTED_SPEED_ABOVE_THRESHOLD', speedSource: 'REPORTED',
        speedKph: { availability: 'SUPPORTED', value: 42 }, ageSeconds: 30, stale: false,
      },
      lastFix: {
        id: 'f0', vehicleId: VEHICULO, latitude: 4.6, longitude: -74.08,
        recordedAt: new Date().toISOString(), receivedAt: new Date().toISOString(),
        transportLagSeconds: 5,
        speedKph: { availability: 'SUPPORTED', value: 42 },
        headingDegrees: { availability: 'UNKNOWN', value: null },
        accuracyMeters: { availability: 'UNKNOWN', value: null },
        altitudeMeters: { availability: 'UNKNOWN', value: null },
        ignitionOn: { availability: 'UNKNOWN', value: null },
        odometerKm: { availability: 'UNKNOWN', value: null },
        simulated: true, providerCode: 'SIMULATOR',
      },
      ageSeconds: 30, simulated: true, providerCode: 'SIMULATOR', deviceLabel: 'SIM-1',
      // El panel de detalle lee las capacidades declaradas del proveedor: sin
      // ellas la pantalla revienta, y una respuesta real siempre las trae.
      capabilities: {
        providerCode: 'SIMULATOR',
        // `fields` es un objeto anidado: el panel lo recorre con Object.entries.
        fields: {
          speedKph: 'NOT_PROVIDED',
          headingDegrees: 'UNKNOWN',
          ignitionOn: 'UNKNOWN',
          odometerKm: 'UNKNOWN',
        },
        nominalIntervalSeconds: { availability: 'UNKNOWN', value: null },
      },
    })),
  )
  await page.route('**/api/v1/telemetry/vehicles/*/history**', (route) => {
    pedidos.push(new URL(route.request().url()).search)
    return route.fulfill(json(historial))
  })
  await page.route('**/api/v1/telemetry/vehicles/*/trips?**', (route) =>
    route.fulfill(json({ content: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 20 })),
  )
  return { pedidos }
}

test('el visor reproduce el rango: avanza por posiciones registradas y muestra su reloj', async ({ page }) => {   // CA-5, CA-6
  await mockTelemetry(page)
  await page.goto(`/flota?vehiculo=${VEHICULO}&vivo=false&recorrido=hoy`)

  const visor = page.getByRole('region', { name: /Recorrido de/ })
  await expect(visor).toBeVisible()
  await expect(visor.getByText('1 de 3 posiciones')).toBeVisible()

  // Arrastrar la barra mueve la reproducción sin perder la posición.
  await visor.getByLabel('Momento del recorrido').fill('2')
  await expect(visor.getByText('3 de 3 posiciones')).toBeVisible()

  await visor.getByRole('button', { name: 'Reproducir el recorrido' }).click()
  await expect(visor.getByRole('button', { name: 'Pausar la reproducción' })).toBeVisible()
})

test('CA-9: un hueco entre dos posiciones se señala', async ({ page }) => {
  await mockTelemetry(page)
  await page.goto(`/flota?vehiculo=${VEHICULO}&vivo=false&recorrido=hoy`)

  const visor = page.getByRole('region', { name: /Recorrido de/ })
  // La tercera posición llega 20 minutos después de la segunda.
  await visor.getByLabel('Momento del recorrido').fill('2')

  await expect(visor.getByText(/Hueco de 20 min sin reportar/)).toBeVisible()
})

test('CA-8: un rango sin posiciones lo dice', async ({ page }) => {
  await mockTelemetry(page, {
    historial: { content: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 1000 },
  })
  await page.goto(`/flota?vehiculo=${VEHICULO}&vivo=false&recorrido=hoy`)

  await expect(page.getByText('No hay posiciones en ese rango.')).toBeVisible()
})

test('cambiar de rango vuelve a pedir el historial de ese rango', async ({ page }) => {
  const { pedidos } = await mockTelemetry(page)
  await page.goto(`/flota?vehiculo=${VEHICULO}&vivo=false&recorrido=hoy`)
  await expect(page.getByRole('region', { name: /Recorrido de/ })).toBeVisible()

  await page.getByRole('button', { name: 'Ayer' }).click()

  await expect.poll(() => pedidos.length).toBeGreaterThan(1)
  expect(pedidos.at(-1)).toContain('from=')
})

test('el visor se cierra y deja de pedir recorrido', async ({ page }) => {
  await mockTelemetry(page)
  await page.goto(`/flota?vehiculo=${VEHICULO}&vivo=false&recorrido=hoy`)

  await page.getByRole('region', { name: /Recorrido de/ }).getByRole('button', { name: 'Cerrar' }).click()

  await expect(page.getByRole('region', { name: /Recorrido de/ })).toHaveCount(0)
  await expect(page).not.toHaveURL(/recorrido=/)
})

test('accesibilidad: sin violaciones serias con el visor abierto', async ({ page }) => {   // CA-11
  await mockTelemetry(page)
  await page.goto(`/flota?vehiculo=${VEHICULO}&vivo=false&recorrido=hoy`)
  await expect(page.getByRole('region', { name: /Recorrido de/ })).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serias = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serias.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})
