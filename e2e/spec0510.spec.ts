import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * SPEC-0510 — La ficha del vehículo, por procesos.
 *
 * <p>Lo que defienden: que cada proceso tenga su pestaña y el Resumen no actúe;
 * que el caso se elija de una lista sin traer el expediente; que el
 * mantenimiento se pueda programar sin tocar el vehículo; y que las métricas
 * digan «sin dato» en vez de cero.
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

const UNIT_A = '00000000-0000-0000-0000-000000000001'
const VEHICLE_ID = '11111111-1111-1111-1111-111111111111'
const DRIVER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const CASE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const vehicle = (status: string) => ({
  id: VEHICLE_ID, plate: 'OBG101', vehicleType: 'CAMIONETA', make: 'Toyota', model: 'Hilux',
  modelYear: 2022, territorialUnitId: UNIT_A, status, odometerKm: 12000, version: 3, attention: null,
})

const MISSION = {
  assignmentId: 'a1', driverId: DRIVER_ID, driverName: 'Sargento Rueda Ortiz', missionTypeName: 'Patrullaje',
  caseTrackingNumber: null, purpose: null, since: '2026-09-10T02:00:00Z', expectedEndAt: null, overdue: false,
}

const SCHEDULED = {
  orderId: 's1', orderType: 'PREVENTIVE', description: 'Cambio de aceite', scheduledFor: '2026-09-01T12:00:00Z',
  expectedExitAt: null, due: true,
}

const METRICS = {
  windowDays: 30, from: '2026-08-12T12:00:00Z', to: '2026-09-11T12:00:00Z', missions: 3, kilometers: null,
  averageKmPerLiter: null, fuelLiters: 40, fuelCost: null, loadsWithoutCost: 1, workshopDays: 0,
  openOrders: 0, scheduledOrders: 1,
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function mockConsole(page: Page, status: string, extra: Record<string, unknown> = {},
                           session: Record<string, unknown> = ADMIN_STAFF) {
  await page.route('**/api/v1/me', (route) => route.fulfill(json(session)))
  await page.route('**/api/v1/territorial-units', (route) =>
    route.fulfill(json([{ id: UNIT_A, code: 'BOG', name: 'GAULA Bogotá', departmentCode: '11' }])))
  await page.route('**/api/v1/vehicles?*', (route) => route.fulfill(json({ content: [vehicle(status)], totalElements: 1 })))
  await page.route('**/api/v1/vehicles/assignments*', (route) => route.fulfill(json({ content: [] })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}`, (route) => route.fulfill(json(vehicle(status))))
  await page.route('**/api/v1/vehicles/assignable-drivers', (route) =>
    route.fulfill(json([{ id: DRIVER_ID, displayName: 'Sargento Rueda Ortiz', rank: 'Sargento' }])))
  await page.route('**/api/v1/telemetry/devices*', (route) => route.fulfill(json({ content: [], totalElements: 0 })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/fuel`, (route) =>
    route.fulfill(json({ records: [], averageKmPerLiter: null, calculableTramos: 0, loadsWithoutCost: 0 })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/maintenance-orders`, (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    return route.fulfill(json([
      { id: 'c1', vehicleId: VEHICLE_ID, orderType: 'CORRECTIVE', status: 'CLOSED', description: 'Frenos',
        cost: 350000, openedAt: '2026-08-01T12:00:00Z', closedAt: '2026-08-03T12:00:00Z',
        closingNote: 'Cambio de pastillas', startedAt: '2026-08-01T12:00:00Z' },
      { id: 'x1', vehicleId: VEHICLE_ID, orderType: 'PREVENTIVE', status: 'CANCELLED', description: 'Alineación',
        cost: null, openedAt: '2026-08-05T12:00:00Z', closedAt: '2026-08-06T12:00:00Z',
        closingNote: 'Se hizo en otro taller', scheduledFor: '2026-08-10T12:00:00Z' },
    ]))
  })
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/assignments`, (route) => route.fulfill(json([])))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/events*`, (route) => route.fulfill(json({ content: [], totalElements: 0 })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/situation`, (route) => route.fulfill(json({
    vehicleId: VEHICLE_ID, status, mission: null, openOrders: [], scheduledOrders: [], decommissionReason: null, ...extra,
  })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/metrics*`, (route) => route.fulfill(json(METRICS)))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/linkable-cases*`, (route) => route.fulfill(json([
    { id: CASE_ID, trackingNumber: 'GAULA-BOG-2026-000001', status: 'IN_OPERATION' },
    { id: 'c2', trackingNumber: 'GAULA-BOG-2026-000002', status: 'UNDER_VERIFICATION' },
  ])))
  await page.route('**/api/v1/mission-types', (route) =>
    route.fulfill(json([{ id: 't1', name: 'Patrullaje', description: null, active: true }])))
}

test.describe('SPEC-0510: la ficha por procesos', () => {
  test('CA-1: una pestaña por proceso, y el Resumen no tiene formularios', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE', { scheduledOrders: [SCHEDULED] })
    await page.goto(`/recursos/flota/${VEHICLE_ID}`)

    const nav = page.getByRole('navigation', { name: 'Secciones de la ficha' })
    for (const label of ['Resumen', 'Misiones', 'Mantenimiento', 'Combustible', 'Historial', 'Administración']) {
      await expect(nav.getByRole('button', { name: label })).toBeVisible()
    }
    await expect(page.getByRole('region', { name: 'Ahora' })).toBeVisible()
    await expect(page.getByRole('textbox')).toHaveCount(0)
    await expect(page.getByRole('combobox')).toHaveCount(0)
    // El resumen avisa del mantenimiento atrasado y lleva a donde se actúa.
    await expect(page.getByRole('region', { name: 'Ahora' }).getByText('Atrasado')).toBeVisible()
    await page.getByRole('button', { name: 'Ver mantenimiento' }).click()
    await expect(page).toHaveURL(/tab=mantenimiento/)
  })

  test('CA-2: ?tab= abre directamente la pestaña', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE')
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=combustible`)

    await expect(page.getByRole('form', { name: 'Registrar combustible' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Combustible' })).toHaveAttribute('aria-current', 'page')
  })

  test('CA-3/CA-5: el caso se elige de la lista y la ficha no pide el expediente', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE')
    const caseFileCalls: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/case-files')) caseFileCalls.push(request.url())
    })
    let body: Record<string, unknown> | null = null
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/assign`, (route) => {
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)

    const caso = page.getByRole('combobox', { name: 'Caso vinculado' })
    await expect(caso.getByRole('option', { name: 'GAULA-BOG-2026-000001 · En operación' })).toHaveCount(1)
    await page.getByLabel('Conductor *').selectOption(DRIVER_ID)
    await page.getByLabel('Tipo de misión *').selectOption({ label: 'Patrullaje' })
    await caso.selectOption(CASE_ID)
    await page.getByRole('button', { name: 'Asignar vehículo' }).click()

    await expect.poll(() => body).not.toBeNull()
    expect(body!.caseFileId).toBe(CASE_ID)
    expect(caseFileCalls).toEqual([])
  })

  test('CA-12: el catálogo de tipos se abre junto al desplegable', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE')
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)

    await page.getByRole('button', { name: 'Gestionar tipos' }).click()
    await expect(page.getByRole('dialog', { name: 'Tipos de misión' })).toBeVisible()
  })

  test('quien sólo consulta no ve formularios de misión ni el catálogo', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE', {}, FIELD_OFFICER)
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)

    await expect(page.getByRole('region', { name: 'Historial de misiones' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Asignar vehículo' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Gestionar tipos' })).toHaveCount(0)
    await expect(page.getByRole('navigation', { name: 'Secciones de la ficha' })
      .getByRole('button', { name: 'Administración' })).toHaveCount(0)
  })

  test('CA-6: programar manda la fecha y el botón lo dice', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE')
    let body: Record<string, unknown> | null = null
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/maintenance-orders`, (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=mantenimiento`)

    await page.getByLabel('Programar', { exact: true }).check()
    await page.getByLabel('Qué se va a hacer *').fill('Cambio de aceite')
    const submit = page.getByRole('button', { name: 'Programar' })
    await expect(submit).toBeDisabled()
    await page.getByLabel('Programado para *').fill('2026-12-01T08:00')
    await submit.click()

    await expect.poll(() => body).not.toBeNull()
    expect(String(body!.scheduledFor)).toMatch(/Z$/)
  })

  test('CA-8: en misión sólo se puede programar', async ({ page }) => {
    await mockConsole(page, 'IN_MISSION', { mission: MISSION })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=mantenimiento`)

    await expect(page.getByLabel('Ingresa al taller ahora')).toBeDisabled()
    await expect(page.getByLabel('Programar', { exact: true })).toBeChecked()
    await expect(page.getByText(/sólo se puede programar/)).toBeVisible()
  })

  test('CA-7/CA-9: una programada ingresa al taller o se cancela con motivo', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE', { scheduledOrders: [SCHEDULED] })
    let started = false
    let cancelBody: Record<string, unknown> | null = null
    await page.route('**/api/v1/maintenance-orders/s1/start', (route) => {
      started = true
      return route.fulfill(json({}))
    })
    await page.route('**/api/v1/maintenance-orders/s1/cancel', (route) => {
      cancelBody = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill(json({}))
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=mantenimiento`)

    const programadas = page.getByRole('list', { name: 'Órdenes programadas' })
    await expect(programadas.getByText('Cambio de aceite')).toBeVisible()
    await expect(programadas.getByText('Atrasado')).toBeVisible()
    await programadas.getByRole('button', { name: 'Ingresar al taller' }).click()
    await expect.poll(() => started).toBe(true)

    await programadas.getByRole('button', { name: 'Cancelar programación' }).click()
    const confirm = programadas.getByRole('button', { name: 'Cancelar programación' })
    await expect(confirm).toBeDisabled()
    await programadas.getByLabel('Por qué no se hará *').fill('Se hizo en otro taller')
    await confirm.click()
    await expect.poll(() => cancelBody).toMatchObject({ reason: 'Se hizo en otro taller' })
  })

  test('el historial de mantenimiento dice qué se hizo y por qué se canceló', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE')
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=mantenimiento`)

    const historial = page.getByRole('list', { name: 'Órdenes de mantenimiento' })
    await expect(historial.getByText('Qué se hizo: Cambio de pastillas')).toBeVisible()
    await expect(historial.getByText('Motivo: Se hizo en otro taller')).toBeVisible()
    await expect(historial.getByText('Cancelada', { exact: true })).toBeVisible()
  })

  test('CA-11: sin tramos, las métricas dicen «sin dato», no cero', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE')
    await page.goto(`/recursos/flota/${VEHICLE_ID}`)

    const metrics = page.getByRole('region', { name: 'Últimos 30 días' })
    await expect(metrics.getByText('3', { exact: true })).toBeVisible()
    await expect(metrics.getByText('Sin dato')).toHaveCount(2)
    await expect(metrics.getByText('0 km', { exact: true })).toHaveCount(0)
  })

  test('CA-13: la administración va en columnas que fluyen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await mockConsole(page, 'AVAILABLE')
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=administracion`)

    const characteristics = page.getByRole('heading', { name: 'Características' })
    await expect(characteristics).toBeVisible()
    const columns = await characteristics.evaluate((node) => {
      let element: HTMLElement | null = node as HTMLElement
      while (element && getComputedStyle(element).columnCount === 'auto') element = element.parentElement
      return element ? getComputedStyle(element).columnCount : 'auto'
    })
    expect(columns).toBe('2')
    // Y el combustible ya no está aquí: tiene su pestaña.
    await expect(page.getByRole('heading', { name: 'Registrar combustible' })).toHaveCount(0)
  })

  for (const tab of ['resumen', 'misiones', 'mantenimiento']) {
    test(`accesibilidad: sin violaciones serias en la pestaña ${tab}`, async ({ page }) => {
      await mockConsole(page, 'AVAILABLE', { scheduledOrders: [SCHEDULED] })
      await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=${tab}`)
      await expect(page.getByRole('navigation', { name: 'Secciones de la ficha' })).toBeVisible()
      await page.waitForLoadState('networkidle')

      const results = await new AxeBuilder({ page }).analyze()
      const serious = results.violations.filter((violation) =>
        violation.impact === 'serious' || violation.impact === 'critical')
      expect(serious.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.html}`)))
        .toEqual([])
    })
  }
})
