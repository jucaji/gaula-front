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
  'vehicleId', 'plate', 'vehicleType', 'territorialUnitId', 'lat', 'lon', 'speedKph',
  'speedAvailability', 'speedSource', 'state', 'reason', 'recordedAt', 'ageSeconds',
  'stale', 'simulated',
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
      [VEHICLE_MOVING, 'OBG101', 'CAMIONETA', UNIT, 4.6512, -74.0721, 62.5, 'SUPPORTED', 'REPORTED',
        'MOVING', 'REPORTED_SPEED_ABOVE_THRESHOLD', new Date().toISOString(), 8, false, false],
      // El caso que importa: proveedor que NO entrega velocidad.
      [VEHICLE_NO_SPEED, 'OBG102', 'CAMIONETA', UNIT, 4.6612, -74.0821, null, 'NOT_AVAILABLE', 'NONE',
        'UNDETERMINED', 'NO_SPEED_AND_NO_PRIOR_FIX', new Date().toISOString(), 12, false, true],
      [VEHICLE_OFFLINE, 'OBG103', 'MOTOCICLETA', UNIT, 4.6712, -74.0921, null, 'NOT_AVAILABLE', 'NONE',
        'NO_SIGNAL', 'SIGNAL_LOST', new Date(Date.now() - 3_600_000).toISOString(), 3600, true, false],
      // Sin placa: un vehículo que `resource` ya no conoce sigue en el mapa.
      [VEHICLE_NEVER, null, null, UNIT, null, null, null, 'NOT_AVAILABLE', 'NONE', 'NEVER_REPORTED',
        'NO_DEVICE_ENROLLED', null, null, false, false],
    ],
  }
}

async function mockConsole(
  page: Page,
  session: Record<string, unknown>,
  mapa: { provider: string; apiKey: string | null } = { provider: 'GOOGLE', apiKey: null },
) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }))
  await page.route('**/api/v1/telemetry/map-config', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Sin clave: el mapa degrada a su marcador de posición. Es el mismo
      // camino que recorrería un despliegue aislado (docs/08 §5), así que
      // probarlo aquí prueba algo real, no sólo evita cargar el SDK.
      body: JSON.stringify({
        provider: mapa.provider,
        apiKey: mapa.apiKey,
        mapId: null,
        configured: Boolean(mapa.apiKey),
      }),
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

  test('cada vehículo se identifica por su PLACA, no por un UUID recortado', async ({ page }) => {
    await mockConsole(page, COMMANDER)
    await page.goto('/flota')

    const lista = page.getByRole('list', { name: 'Vehículos' })
    // El defecto que esto previene: con identificadores consecutivos, recortar
    // el UUID a ocho caracteres hacía que TODOS los vehículos se vieran igual
    // -- «00000000» -- y el requisito de identificarlos quedaba sin cumplir.
    await expect(lista).toContainText('OBG101')
    await expect(lista).toContainText('OBG102')
    await expect(lista).toContainText('OBG103')
    // Y sin placa se muestra el identificador abreviado, no un guion mudo: un
    // vehículo que `resource` ya no conoce sigue estando y hay que señalarlo.
    await expect(lista).toContainText('44444444…')
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
    // Flota es un solo módulo con dos secciones, y este rol sólo alcanza una:
    // la pestaña «Comando» no debe existir para él -- ofrecer lo que el backend
    // va a denegar es peor que no ofrecerlo. Con una sola sección visible la
    // barra entera se oculta, así que se comprueba por el enlace.
    await expect(page.getByRole('link', { name: 'Comando', exact: true })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Flota' })).toHaveAttribute('href', '/recursos/flota')
  })

  test('el proveedor cartográfico se cambia por configuración, sin tocar la consola', async ({ page }) => {
    // Un puerto con un solo adaptador es una hipótesis; con dos es un hecho.
    // MapLibre además no necesita clave ni internet: es el que queda si la
    // sede resulta ser un despliegue aislado (docs/08 §5).
    await mockConsole(page, COMMANDER, { provider: 'MAPLIBRE', apiKey: null })
    await page.goto('/flota')

    await expect(page.getByRole('list', { name: 'Vehículos' })).toBeVisible()
    // Con MapLibre NO aplica el mensaje de «falta la clave»: no la necesita.
    await expect(page.getByText(/El mapa no está configurado/)).toHaveCount(0)
    // Sin WebGL en un navegador sin cabeza, degrada diciéndolo en vez de
    // romper la pantalla -- que es también lo correcto en un puesto sin
    // aceleración gráfica.
    await expect(
      page.getByRole('application', { name: 'Mapa de la flota' })
        .or(page.getByText(/No se pudo dibujar el mapa/)),
    ).toBeVisible()
  })

  test('un proveedor no reconocido lo DICE, en vez de caer a otro en silencio', async ({ page }) => {
    await mockConsole(page, COMMANDER, { provider: 'CARTOGRAFIA_INVENTADA', apiKey: null })
    await page.goto('/flota')

    // Caer a un default haría que un error de configuración se viera como si
    // funcionara -- y con el mapa equivocado debajo.
    await expect(page.getByText(/Proveedor de mapa no reconocido/)).toBeVisible()
    await expect(page.getByText(/GOOGLE y MAPLIBRE/)).toBeVisible()
    await expect(page.getByRole('list', { name: 'Vehículos' })).toBeVisible()
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
