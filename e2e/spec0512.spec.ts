import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * SPEC-0512 — Misiones y conductores.
 *
 * <p>Lo que defienden: que una misión se cree y se arme en su propia pantalla,
 * con vehículos y conductores; que los conductores se gestionen como los
 * vehículos; que los autorizados de un vehículo se vinculen desde su ficha; y
 * que un conductor no autorizado exija un motivo.
 */
const ADMIN_STAFF = {
  userId: '00000000-0000-0000-0000-000000000206',
  displayName: 'Técnico Gómez Salas',
  roles: ['ADMIN_STAFF'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}
const UNIT = '00000000-0000-0000-0000-000000000001'
const VEHICLE_ID = '11111111-1111-1111-1111-111111111111'
const MISSION_ID = '22222222-2222-2222-2222-222222222222'
const RUEDA = 'dddddddd-dddd-dddd-dddd-000000000001'
const ALBA = 'dddddddd-dddd-dddd-dddd-000000000002'
const CASE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const driver = (id: string, first: string, extra: Record<string, unknown> = {}) => ({
  id, territorialUnitId: UNIT, rank: 'Sargento', firstName: first, lastName: 'Pérez', displayName: `Sargento ${first} Pérez`,
  militaryId: `CO-${first}`, licenseNumber: 'LC-1', licenseCategory: 'C2', licenseExpiresOn: '2030-01-01', licenseValid: true,
  appUserId: null, status: 'ACTIVE', decommissionReason: null, version: 2, authorizedPlates: [], ...extra,
})

const mission = (extra: Record<string, unknown> = {}) => ({
  id: MISSION_ID, code: 'M-2026-0007', territorialUnitId: UNIT, missionTypeId: 't1', missionTypeName: 'Patrullaje',
  caseFileId: null, caseTrackingNumber: null, purpose: 'Escolta', plannedStartAt: null, expectedEndAt: null,
  status: 'PLANNED', startedAt: null, endedAt: null, closingNote: null, cancelReason: null, overdue: false, version: 0,
  vehicles: [], ...extra,
})

async function mockConsole(page: Page) {
  await page.route('**/api/**', (route) => route.fulfill(json([])))
  await page.route('**/api/v1/me', (route) => route.fulfill(json(ADMIN_STAFF)))
  await page.route('**/api/v1/territorial-units', (route) =>
    route.fulfill(json([{ id: UNIT, code: 'BOG', name: 'GAULA Bogotá', departmentCode: '11' }])))
  await page.route('**/api/v1/mission-types', (route) =>
    route.fulfill(json([{ id: 't1', name: 'Patrullaje', description: null, active: true }])))
}

test.describe('SPEC-0512: conductores', () => {
  test('CA-8: se registra un conductor con su licencia', async ({ page }) => {
    await mockConsole(page)
    let body: Record<string, unknown> | null = null
    await page.route('**/api/v1/drivers?*', (route) => route.fulfill(json([])))
    await page.route('**/api/v1/drivers', (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill(json(driver(RUEDA, 'Luis'), 201))
    })
    await page.goto('/recursos/conductores')

    await page.getByRole('button', { name: 'Registrar conductor' }).click()
    const form = page.getByRole('form', { name: 'Registrar conductor' })
    const submit = form.getByRole('button', { name: 'Registrar' })
    await expect(submit).toBeDisabled()
    await form.getByLabel('Grado').fill('Sargento')
    await form.getByLabel('Nombres *').fill('Luis')
    await form.getByLabel('Apellidos *').fill('Rueda')
    await form.getByLabel('Identificación militar *').fill('CO-123')
    await form.getByLabel('Número de licencia *').fill('LC-9988')
    await form.getByLabel('Categoría de licencia *').fill('C2')
    await form.getByLabel('Licencia vence *').fill('2030-01-01')
    await submit.click()

    await expect.poll(() => body).not.toBeNull()
    expect(body).toMatchObject({ territorialUnitId: UNIT, firstName: 'Luis', militaryId: 'CO-123', licenseExpiresOn: '2030-01-01' })
    expect(body).not.toHaveProperty('appUserId')
  })

  test('la lista dice qué vehículos puede conducir y marca la licencia vencida o sin registrar', async ({ page }) => {
    await mockConsole(page)
    await page.route('**/api/v1/drivers?*', (route) => route.fulfill(json([
      driver(RUEDA, 'Luis', { authorizedPlates: ['OBG101', 'OBG102'] }),
      driver(ALBA, 'Ana', { licenseValid: false, licenseExpiresOn: '2026-09-01' }),
      driver('dddddddd-dddd-dddd-dddd-000000000003', 'Migrado', { licenseNumber: null, licenseCategory: null, licenseExpiresOn: null, licenseValid: false }),
    ])))
    await page.goto('/recursos/conductores')

    const list = page.getByRole('list', { name: 'Conductores' })
    await expect(list.getByText('Autorizado para OBG101, OBG102')).toBeVisible()
    await expect(list.getByText('Licencia vencida')).toBeVisible()
    await expect(list.getByText('Licencia sin registrar')).toBeVisible()
  })

  test('CA-8: dar de baja exige motivo', async ({ page }) => {
    await mockConsole(page)
    let body: Record<string, unknown> | null = null
    await page.route('**/api/v1/drivers?*', (route) => route.fulfill(json([driver(RUEDA, 'Luis')])))
    await page.route(`**/api/v1/drivers/${RUEDA}/decommission`, (route) => {
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill(json(driver(RUEDA, 'Luis', { status: 'DECOMMISSIONED' })))
    })
    await page.goto('/recursos/conductores')

    await page.getByRole('button', { name: 'Dar de baja' }).click()
    const confirm = page.getByRole('button', { name: 'Confirmar baja' })
    await expect(confirm).toBeDisabled()
    await page.getByLabel('Motivo de la baja *').fill('Traslado a otra unidad')
    await confirm.click()
    await expect.poll(() => body).toMatchObject({ note: 'Traslado a otra unidad' })
  })

  test('CA-9: eliminar a quien tiene historia lo da de baja y lo dice', async ({ page }) => {
    await mockConsole(page)
    await page.route('**/api/v1/drivers?*', (route) => route.fulfill(json([driver(RUEDA, 'Luis')])))
    await page.route(`**/api/v1/drivers/${RUEDA}`, (route) => {
      if (route.request().method() !== 'DELETE') return route.fallback()
      return route.fulfill(json({ outcome: 'ARCHIVED' }))
    })
    await page.goto('/recursos/conductores')

    await page.getByRole('button', { name: 'Eliminar' }).click()
    await page.getByRole('button', { name: 'Sí, eliminar' }).click()
    await expect(page.getByText('Tenía historia en la flota: se dio de baja en vez de eliminarse.')).toBeVisible()
  })

  test('CA-8: editar manda la versión en pantalla en el If-Match', async ({ page }) => {
    await mockConsole(page)
    let ifMatch: string | null = null
    await page.route('**/api/v1/drivers?*', (route) => route.fulfill(json([driver(RUEDA, 'Luis')])))
    await page.route(`**/api/v1/drivers/${RUEDA}`, (route) => {
      if (route.request().method() !== 'PUT') return route.fallback()
      ifMatch = route.request().headers()['if-match'] ?? null
      return route.fulfill(json(driver(RUEDA, 'Luis')))
    })
    await page.goto('/recursos/conductores')

    await page.getByRole('button', { name: 'Editar' }).click()
    const form = page.getByRole('form', { name: 'Editar Sargento Luis Pérez' })
    await form.getByLabel('Categoría de licencia *').fill('C3')
    await form.getByRole('button', { name: 'Guardar' }).click()
    await expect.poll(() => ifMatch).toBe('"2"')
  })
})

test.describe('SPEC-0512: misiones', () => {
  test('CA-1: se crea una misión eligiendo tipo y caso de listas, sin pedir el expediente', async ({ page }) => {
    await mockConsole(page)
    const caseFileCalls: string[] = []
    page.on('request', (request) => { if (request.url().includes('/api/v1/case-files')) caseFileCalls.push(request.url()) })
    let body: Record<string, unknown> | null = null
    await page.route('**/api/v1/missions/linkable-cases?*', (route) =>
      route.fulfill(json([{ id: CASE_ID, trackingNumber: 'GAULA-BOG-2026-000001', status: 'IN_OPERATION' }])))
    await page.route('**/api/v1/missions', (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill(json(mission(), 201))
    })
    await page.route(`**/api/v1/missions/${MISSION_ID}`, (route) => route.fulfill(json(mission())))
    await page.goto(`/recursos/misiones?nueva=true&vehiculo=${VEHICLE_ID}`)

    const form = page.getByRole('form', { name: 'Nueva misión' })
    await expect(form.getByRole('button', { name: 'Gestionar tipos' })).toBeVisible()
    await form.getByLabel('Tipo de misión *').selectOption({ label: 'Patrullaje' })
    await form.getByRole('combobox', { name: 'Caso vinculado' }).selectOption({ label: 'GAULA-BOG-2026-000001 · En operación' })
    await form.getByLabel('Propósito').fill('Escolta')
    await form.getByRole('button', { name: 'Crear misión' }).click()

    await expect.poll(() => body).not.toBeNull()
    expect(body).toMatchObject({ territorialUnitId: UNIT, missionTypeId: 't1', caseFileId: CASE_ID, purpose: 'Escolta' })
    await expect(page).toHaveURL(new RegExp(`/recursos/misiones/${MISSION_ID}\\?vehiculo=${VEHICLE_ID}`))
    expect(caseFileCalls).toEqual([])
  })

  test('CA-4/CA-10: al agregar un vehículo, los autorizados van primero y uno no autorizado pide motivo', async ({ page }) => {
    await mockConsole(page)
    let body: Record<string, unknown> | null = null
    await page.route(`**/api/v1/missions/${MISSION_ID}`, (route) => route.fulfill(json(mission())))
    await page.route('**/api/v1/vehicles?*', (route) => route.fulfill(json({ content: [
      { id: VEHICLE_ID, plate: 'OBG101', status: 'AVAILABLE', territorialUnitId: UNIT },
    ] })))
    await page.route(`**/api/v1/missions/${MISSION_ID}/driver-options?*`, (route) => route.fulfill(json([
      { driverId: RUEDA, displayName: 'Sargento Luis Pérez', licenseCategory: 'C2', licenseExpiresOn: '2030-01-01', licenseValid: true, authorized: true, busy: false },
      { driverId: ALBA, displayName: 'Cabo Ana Pérez', licenseCategory: 'B1', licenseExpiresOn: '2030-01-01', licenseValid: true, authorized: false, busy: true },
    ])))
    await page.route(`**/api/v1/missions/${MISSION_ID}/vehicles`, (route) => {
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill(json(mission()))
    })
    await page.goto(`/recursos/misiones/${MISSION_ID}?vehiculo=${VEHICLE_ID}`)

    const add = page.getByRole('region', { name: 'Agregar vehículo' })
    const options = add.getByRole('list', { name: 'Conductores disponibles' }).getByRole('listitem')
    await expect(options.first()).toContainText('Autorizado')
    await expect(options.last()).toContainText('En otra misión en curso')

    await options.first().getByRole('checkbox').check()
    await options.last().getByRole('checkbox').check()
    const submit = add.getByRole('button', { name: 'Agregar vehículo' })
    await expect(submit).toBeDisabled()
    await add.getByLabel('Por qué conduce este vehículo sin estar autorizado *').fill('Relevo del titular')
    await submit.click()

    await expect.poll(() => body).not.toBeNull()
    expect(body).toMatchObject({
      vehicleId: VEHICLE_ID,
      crew: [{ driverId: RUEDA }, { driverId: ALBA, overrideReason: 'Relevo del titular' }],
    })
  })

  test('CA-3: no se inicia sin conductores y la misión dice por qué', async ({ page }) => {
    await mockConsole(page)
    let started = false
    await page.route(`**/api/v1/missions/${MISSION_ID}`, (route) => route.fulfill(json(mission({
      vehicles: [{ vehicleId: VEHICLE_ID, plate: 'OBG101', vehicleStatus: 'MAINTENANCE', releasedAt: null,
        warnings: ['Está en el taller.'], crew: [] }],
    }))))
    await page.route(`**/api/v1/missions/${MISSION_ID}/start`, (route) => { started = true; return route.fulfill(json(mission())) })
    await page.goto(`/recursos/misiones/${MISSION_ID}`)

    await expect(page.getByText('Está en el taller.')).toBeVisible()
    await expect(page.getByText('Sin conductor: agregue al menos uno para poder iniciar.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Iniciar misión' })).toBeDisabled()
    expect(started).toBe(false)
  })

  test('CA-2/CA-7: una misión lista se inicia; cancelar exige motivo', async ({ page }) => {
    await mockConsole(page)
    let started = false
    let cancelBody: Record<string, unknown> | null = null
    const ready = mission({ vehicles: [{ vehicleId: VEHICLE_ID, plate: 'OBG101', vehicleStatus: 'AVAILABLE', releasedAt: null,
      warnings: [], crew: [{ driverId: ALBA, displayName: 'Cabo Ana Pérez', authorized: false, overrideReason: 'Relevo', active: true, licenseValid: true }] }] })
    await page.route(`**/api/v1/missions/${MISSION_ID}`, (route) => route.fulfill(json(ready)))
    await page.route(`**/api/v1/missions/${MISSION_ID}/start`, (route) => { started = true; return route.fulfill(json({ ...ready, status: 'IN_PROGRESS' })) })
    await page.route(`**/api/v1/missions/${MISSION_ID}/cancel`, (route) => {
      cancelBody = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill(json({ ...ready, status: 'CANCELLED', cancelReason: 'Se suspendió' }))
    })
    await page.goto(`/recursos/misiones/${MISSION_ID}`)

    const crew = page.getByRole('list', { name: 'Conductores de OBG101' })
    await expect(crew.getByText('Principal')).toBeVisible()
    await expect(crew.getByText('Motivo: Relevo')).toBeVisible()

    await page.getByRole('button', { name: 'Iniciar misión' }).click()
    await expect.poll(() => started).toBe(true)

    await page.getByRole('button', { name: 'Cancelar misión' }).click()
    const confirm = page.getByRole('button', { name: 'Confirmar cancelación' })
    await expect(confirm).toBeDisabled()
    await page.getByLabel('Por qué se cancela *').fill('Se suspendió')
    await confirm.click()
    await expect.poll(() => cancelBody).toMatchObject({ note: 'Se suspendió' })
  })

  test('la lista de misiones enlaza cada una por su código', async ({ page }) => {
    await mockConsole(page)
    await page.route('**/api/v1/missions', (route) => route.fulfill(json([
      mission({ status: 'IN_PROGRESS', overdue: true, vehicles: [{ vehicleId: VEHICLE_ID, plate: 'OBG101', vehicleStatus: 'IN_MISSION', releasedAt: null, warnings: [], crew: [] }] }),
    ])))
    await page.goto('/recursos/misiones')

    const list = page.getByRole('list', { name: 'Misiones' })
    await expect(list.getByRole('link', { name: 'M-2026-0007' })).toHaveAttribute('href', `/recursos/misiones/${MISSION_ID}`)
    await expect(list.getByText('En curso')).toBeVisible()
    await expect(list.getByText('Vencida')).toBeVisible()
    await expect(list.getByText('OBG101')).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Secciones de flota' }).getByRole('link', { name: 'Conductores' })).toBeVisible()
  })
})

test.describe('SPEC-0512: la ficha del vehículo', () => {
  async function mockVehicle(page: Page, status: string, situation: Record<string, unknown> = {}) {
    await mockConsole(page)
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}`, (route) => route.fulfill(json({
      id: VEHICLE_ID, plate: 'OBG101', vehicleType: 'CAMIONETA', make: 'Toyota', model: 'Hilux', modelYear: 2022,
      territorialUnitId: UNIT, status, odometerKm: 12000, version: 3,
    })))
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/situation`, (route) => route.fulfill(json({
      vehicleId: VEHICLE_ID, status, mission: null, openOrders: [], scheduledOrders: [], decommissionReason: null, ...situation,
    })))
  }

  test('CA-10: los conductores autorizados se vinculan desde Administración', async ({ page }) => {
    await mockVehicle(page, 'AVAILABLE')
    let body: Record<string, unknown> | null = null
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/authorized-drivers`, (route) => {
      if (route.request().method() === 'POST') {
        body = JSON.parse(route.request().postData() ?? '{}')
      }
      return route.fulfill(json([{ driverId: RUEDA, displayName: 'Sargento Luis Pérez', licenseCategory: 'C2', licenseExpiresOn: '2030-01-01', licenseValid: true, active: true }]))
    })
    await page.route('**/api/v1/drivers?*', (route) => route.fulfill(json([driver(RUEDA, 'Luis'), driver(ALBA, 'Ana')])))
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=administracion`)

    const panel = page.getByRole('region', { name: 'Conductores autorizados' })
    await expect(panel.getByText('Sargento Luis Pérez')).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Desvincular' })).toBeVisible()
    // Ya autorizado: no se vuelve a ofrecer.
    await expect(panel.getByLabel('Autorizar conductor').getByRole('option')).toHaveCount(2)
    await panel.getByLabel('Autorizar conductor').selectOption(ALBA)
    await panel.getByRole('button', { name: 'Vincular', exact: true }).click()
    await expect.poll(() => body).toMatchObject({ driverId: ALBA })
  })

  test('en misión, la ficha enlaza la misión y dice quiénes conducen', async ({ page }) => {
    await mockVehicle(page, 'IN_MISSION', {
      mission: {
        assignmentId: 'a1', missionId: MISSION_ID, missionCode: 'M-2026-0007', driverId: RUEDA, driverName: 'Sargento Luis Pérez',
        driverNames: ['Sargento Luis Pérez', 'Cabo Ana Pérez'], missionTypeName: 'Patrullaje', caseTrackingNumber: null,
        purpose: null, since: '2026-09-15T12:00:00Z', expectedEndAt: null, overdue: false,
      },
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)

    const card = page.getByRole('region', { name: 'Misión en curso' })
    await expect(card.getByRole('link', { name: 'Ver la misión M-2026-0007' })).toHaveAttribute('href', `/recursos/misiones/${MISSION_ID}`)
    await expect(card.getByText('Sargento Luis Pérez, Cabo Ana Pérez')).toBeVisible()
  })
})

for (const [name, path, setup] of [
  ['conductores', '/recursos/conductores', async (page: Page) => {
    await page.route('**/api/v1/drivers?*', (route) => route.fulfill(json([driver(RUEDA, 'Luis', { authorizedPlates: ['OBG101'] })])))
  }],
  ['detalle de misión', `/recursos/misiones/${MISSION_ID}`, async (page: Page) => {
    await page.route(`**/api/v1/missions/${MISSION_ID}`, (route) => route.fulfill(json(mission({ vehicles: [{ vehicleId: VEHICLE_ID,
      plate: 'OBG101', vehicleStatus: 'AVAILABLE', releasedAt: null, warnings: ['También está en la misión planeada M-2026-0003.'],
      crew: [{ driverId: RUEDA, displayName: 'Sargento Luis Pérez', authorized: true, overrideReason: null, active: true, licenseValid: true }] }] }))))
    await page.route('**/api/v1/vehicles?*', (route) => route.fulfill(json({ content: [] })))
  }],
] as const) {
  test(`accesibilidad: sin violaciones serias en ${name}`, async ({ page }) => {
    await mockConsole(page)
    await setup(page)
    await page.goto(path)
    await page.waitForLoadState('networkidle')

    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    expect(serious.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.html}`))).toEqual([])
  })
}
