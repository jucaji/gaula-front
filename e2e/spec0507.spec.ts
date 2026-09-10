import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * SPEC-0507 — Gestión de flota.
 *
 * <p>Lo que estas pruebas defienden es lo que el cliente señaló que faltaba:
 * que la flota se pueda ADMINISTRAR desde la consola y no sólo mirar. Y, con la
 * misma importancia, que no se le ofrezca a nadie una acción que el backend le
 * va a denegar — la matriz de acceso a la flota nunca fue plana (V38).
 */
const ADMIN_STAFF = {
  userId: '00000000-0000-0000-0000-000000000206',
  displayName: 'Técnico Gómez Salas',
  roles: ['ADMIN_STAFF'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const FIELD_OFFICER = {
  userId: '00000000-0000-0000-0000-000000000207',
  displayName: 'Sargento Rueda',
  roles: ['FIELD_OFFICER'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const SYSTEM_ADMIN = {
  userId: '00000000-0000-0000-0000-000000000203',
  displayName: 'Administrador',
  roles: ['SYSTEM_ADMIN'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const UNIT_A = '00000000-0000-0000-0000-000000000001'
const UNIT_B = '00000000-0000-0000-0000-000000000002'
const VEHICLE_ID = '11111111-1111-1111-1111-111111111111'
const FREE_DEVICE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

const VEHICLE = {
  id: VEHICLE_ID,
  plate: 'OBG101',
  vehicleType: 'CAMIONETA',
  make: 'Toyota',
  model: 'Hilux',
  modelYear: 2022,
  territorialUnitId: UNIT_A,
  status: 'AVAILABLE',
  odometerKm: 12000,
  version: 3,
}

const UNITS = [
  { id: UNIT_A, code: 'BOG', name: 'GAULA Bogotá', departmentCode: '11' },
  { id: UNIT_B, code: 'MED', name: 'GAULA Medellín', departmentCode: '05' },
]

const DEVICES = {
  content: [
    {
      deviceId: FREE_DEVICE, providerCode: 'SIMULATOR', externalDeviceId: 'IMEI-900',
      label: 'Equipo de reserva', status: 'ACTIVE', installedAt: null, vehicleId: null, plate: null,
    },
    {
      deviceId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', providerCode: 'SIMULATOR',
      externalDeviceId: 'IMEI-901', label: null, status: 'DECOMMISSIONED', installedAt: null,
      vehicleId: null, plate: null,
    },
  ],
  totalElements: 2,
}

async function mockConsole(page: Page, session: Record<string, unknown>) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }))
  await page.route('**/api/v1/territorial-units', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(UNITS) }))
  await page.route('**/api/v1/vehicles?*', (route) =>
    route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ content: [VEHICLE], totalElements: 1 }),
    }))
  await page.route('**/api/v1/vehicles/assignments*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ content: [] }) }))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}`, (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VEHICLE) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VEHICLE) })
  })
  await page.route('**/api/v1/telemetry/devices*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DEVICES) }))
}

test.describe('SPEC-0507: gestión de flota', () => {
  test('CA-13: la unidad administrativa puede registrar un vehículo, con la unidad territorial como lista', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)
    let body: Record<string, unknown> | null = null
    await page.route('**/api/v1/vehicles', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(VEHICLE) })
    })

    await page.goto('/recursos/flota')
    await page.getByRole('button', { name: 'Registrar vehículo' }).click()

    await page.getByLabel('Placa *').fill('xyz 987')
    await page.getByLabel('Tipo *').fill('MOTO')
    // La unidad se elige, no se teclea: un UUID escrito a mano pone el vehículo
    // en la territorial de otro, con lo que eso significa para quién lo ve.
    await page.getByLabel('Unidad territorial *').selectOption(UNIT_B)
    await page.getByRole('button', { name: 'Registrar', exact: true }).click()

    await expect.poll(() => body).not.toBeNull()
    expect(body!.plate).toBe('xyz 987')
    expect(body!.territorialUnitId).toBe(UNIT_B)
    // Año vacío viaja ausente, nunca como 0: un cero no es «no hay dato».
    expect(body!.modelYear).toBeUndefined()
  })

  test('CA-1: un oficial de campo NO ve el botón de registrar', async ({ page }) => {
    await mockConsole(page, FIELD_OFFICER)

    await page.goto('/recursos/flota')

    // La matriz (V38) le da FLEET/READ y nada más. Ofrecerle el alta sería
    // ofrecerle un 403.
    await expect(page.getByRole('button', { name: 'Registrar vehículo' })).toHaveCount(0)
  })

  test('CA-4: corregir manda la versión que está en pantalla en el If-Match', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)
    let ifMatch: string | null = null
    let patched: Record<string, unknown> | null = null
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}`, async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      ifMatch = route.request().headers()['if-match'] ?? null
      patched = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VEHICLE) })
    })

    await page.goto(`/recursos/flota/${VEHICLE_ID}`)
    await page.getByRole('button', { name: 'Corregir' }).click()
    await page.getByLabel('Marca').fill('Nissan')
    await page.getByRole('button', { name: 'Guardar' }).click()

    await expect.poll(() => ifMatch).toBe('"3"')
    expect(patched!.make).toBe('Nissan')
    // CA-5: la unidad territorial NO viaja en la corrección.
    expect(patched!).not.toHaveProperty('territorialUnitId')
  })

  test('CA-5: el formulario de corrección no ofrece la unidad territorial', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)

    await page.goto(`/recursos/flota/${VEHICLE_ID}`)
    await page.getByRole('button', { name: 'Corregir' }).click()

    await expect(page.getByLabel('Unidad territorial *')).toHaveCount(0)
    // Está en su propia acción, con su propia advertencia.
    await expect(page.getByRole('heading', { name: 'Trasladar de unidad' })).toBeVisible()
  })

  test('CA-6: el traslado no ofrece como destino la unidad en la que ya está', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)
    let transferred: Record<string, unknown> | null = null
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/transfer`, (route) => {
      transferred = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(VEHICLE) })
    })

    await page.goto(`/recursos/flota/${VEHICLE_ID}`)
    const destino = page.getByLabel('Unidad de destino *')
    await expect(destino.getByRole('option')).toHaveCount(2)   // «Seleccione…» + la otra unidad

    await destino.selectOption(UNIT_B)
    await page.getByRole('button', { name: 'Trasladar' }).click()

    await expect.poll(() => transferred).not.toBeNull()
    expect(transferred!.targetTerritorialUnitId).toBe(UNIT_B)
  })

  test('CA-8: dar de baja dice que no borra nada', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)

    await page.goto(`/recursos/flota/${VEHICLE_ID}`)

    await expect(page.getByText(/No se borra/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Dar de baja' })).toBeVisible()
  })

  test('CA-12: la unidad administrativa no ve el bloque de equipo GPS', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)

    await page.goto(`/recursos/flota/${VEHICLE_ID}`)

    // Administra la flota y no la operación (docs/04 §2.4): los equipos son de
    // SYSTEM_ADMIN, y el backend le devolvería 403 en cada acción de ese panel.
    await expect(page.getByRole('heading', { name: 'Equipo GPS' })).toHaveCount(0)
  })

  test('CA-10/CA-11: el administrador ve los equipos y puede vincular uno libre', async ({ page }) => {
    await mockConsole(page, SYSTEM_ADMIN)
    let enrolled: Record<string, unknown> | null = null
    await page.route(`**/api/v1/telemetry/vehicles/${VEHICLE_ID}/enroll`, (route) => {
      enrolled = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
    })

    await page.goto(`/recursos/flota/${VEHICLE_ID}`)

    await expect(page.getByText('Este vehículo no tiene equipo vinculado.')).toBeVisible()
    await page.getByLabel('Equipo libre').selectOption(FREE_DEVICE)
    await page.getByRole('button', { name: 'Vincular equipo' }).click()

    await expect.poll(() => enrolled).not.toBeNull()
    expect(enrolled!.deviceId).toBe(FREE_DEVICE)
  })

  test('CA-10: un equipo dado de baja sigue en la lista, marcado, en vez de desaparecer', async ({ page }) => {
    await mockConsole(page, SYSTEM_ADMIN)

    await page.goto('/recursos/equipos')

    const lista = page.getByRole('list', { name: 'Equipos GPS' })
    await expect(lista.getByRole('listitem')).toHaveCount(2)
    await expect(lista.getByText(/Dado de baja/)).toBeVisible()
    // Y el libre se dice libre: es el que se puede vincular.
    await expect(lista.getByText('Libre').first()).toBeVisible()
  })

  test('la unidad administrativa no entra a los equipos GPS', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)

    await page.goto('/recursos/equipos')

    await expect(page).not.toHaveURL(/\/recursos\/equipos$/)
  })

  test('un vacío por alcance NO dice «ajuste los filtros»', async ({ page }) => {
    await mockConsole(page, FIELD_OFFICER)
    // Un oficial de campo sin vehículos asignados: la lista vuelve vacía y la
    // causa NO son los filtros, que ni siquiera están puestos.
    await page.route('**/api/v1/vehicles?*', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: [], totalElements: 0 }),
      }))

    await page.goto('/recursos/flota')

    await expect(page.getByText(/Ajuste los filtros/)).toHaveCount(0)
    await expect(page.getByText(/sólo los vehículos que su rol alcanza/)).toBeVisible()
  })

  test('con un filtro puesto, el vacío sí es del filtro y se ofrece quitarlo', async ({ page }) => {
    await mockConsole(page, ADMIN_STAFF)
    await page.route('**/api/v1/vehicles?*', (route) =>
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ content: [], totalElements: 0 }),
      }))

    await page.goto('/recursos/flota?status=OUT_OF_SERVICE')

    await expect(page.getByText('Ningún vehículo coincide con este filtro')).toBeVisible()
    await page.getByRole('button', { name: 'Quitar filtros' }).click()
    await expect(page).not.toHaveURL(/status=/)
  })

  test('accesibilidad: sin violaciones serias en la ficha administrable', async ({ page }) => {
    await mockConsole(page, SYSTEM_ADMIN)
    await page.goto(`/recursos/flota/${VEHICLE_ID}`)
    await expect(page.getByRole('heading', { name: 'Equipo GPS' })).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical')

    expect(serious.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([])
  })
})
