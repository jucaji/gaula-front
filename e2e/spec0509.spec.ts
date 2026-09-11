import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * SPEC-0509 — Estados operativos del vehículo.
 *
 * <p>Lo que estas pruebas defienden: que la ficha diga POR QUÉ un vehículo está
 * en el estado en que está, y que sólo ofrezca lo que ese estado permite. Desde
 * SPEC-0510 cada proceso vive en su pestaña (`?tab=`), así que las pruebas van
 * directo a la pestaña donde se actúa.
 */
const ADMIN_STAFF = {
  userId: '00000000-0000-0000-0000-000000000206',
  displayName: 'Técnico Gómez Salas',
  roles: ['ADMIN_STAFF'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const UNIT_A = '00000000-0000-0000-0000-000000000001'
const VEHICLE_ID = '11111111-1111-1111-1111-111111111111'
const DRIVER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd'
const TYPE_ID = '00000000-0000-0000-0000-0000000005a1'

const vehicle = (status: string, attention: string | null = null) => ({
  id: VEHICLE_ID, plate: 'OBG101', vehicleType: 'CAMIONETA', make: 'Toyota', model: 'Hilux',
  modelYear: 2022, territorialUnitId: UNIT_A, status, odometerKm: 12000, version: 3, attention,
})

const MISSION = {
  assignmentId: 'a1', driverId: DRIVER_ID, driverName: 'Sargento Rueda Ortiz',
  missionTypeName: 'Patrullaje', caseTrackingNumber: 'GAULA-BOG-2026-000004', purpose: 'Ronda nocturna',
  since: '2026-09-10T02:00:00Z', expectedEndAt: '2026-09-10T08:00:00Z', overdue: true,
}

const OPEN_ORDER = {
  orderId: 'm1', orderType: 'CORRECTIVE', description: 'Frenos', openedAt: '2026-09-05T12:00:00Z',
  expectedExitAt: null, cost: null, overdue: false,
}

const situation = (status: string, extra: Record<string, unknown> = {}) => ({
  vehicleId: VEHICLE_ID, status, mission: null, openOrders: [], scheduledOrders: [], decommissionReason: null, ...extra,
})

const METRICS = {
  windowDays: 30, from: '2026-08-12T12:00:00Z', to: '2026-09-11T12:00:00Z', missions: 2, kilometers: 400,
  averageKmPerLiter: 10, fuelLiters: 40, fuelCost: 200000, loadsWithoutCost: 0, workshopDays: 1.5,
  openOrders: 0, scheduledOrders: 0,
}

const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

async function mockConsole(page: Page, status: string, extra: Record<string, unknown> = {}, attention: string | null = null) {
  let types = [
    { id: TYPE_ID, name: 'Operativo de caso', description: null, active: true },
    { id: '00000000-0000-0000-0000-0000000005a2', name: 'Patrullaje', description: null, active: true },
  ]
  await page.route('**/api/v1/me', (route) => route.fulfill(json(ADMIN_STAFF)))
  await page.route('**/api/v1/territorial-units', (route) =>
    route.fulfill(json([{ id: UNIT_A, code: 'BOG', name: 'GAULA Bogotá', departmentCode: '11' }])))
  await page.route('**/api/v1/vehicles?*', (route) =>
    route.fulfill(json({ content: [vehicle(status, attention)], totalElements: 1 })))
  await page.route('**/api/v1/vehicles/assignments*', (route) => route.fulfill(json({ content: [] })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}`, (route) => route.fulfill(json(vehicle(status))))
  await page.route('**/api/v1/vehicles/assignable-drivers', (route) =>
    route.fulfill(json([{ id: DRIVER_ID, displayName: 'Sargento Rueda Ortiz', rank: 'Sargento' }])))
  await page.route('**/api/v1/telemetry/devices*', (route) => route.fulfill(json({ content: [], totalElements: 0 })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/fuel`, (route) =>
    route.fulfill(json({ records: [], averageKmPerLiter: null, calculableTramos: 0, loadsWithoutCost: 0 })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/maintenance-orders`, (route) => route.fulfill(json([])))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/assignments`, (route) => route.fulfill(json([])))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/events*`, (route) => route.fulfill(json({ content: [], totalElements: 0 })))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/situation`, (route) => route.fulfill(json(situation(status, extra))))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/metrics*`, (route) => route.fulfill(json(METRICS)))
  await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/linkable-cases*`, (route) => route.fulfill(json([])))
  await page.route('**/api/v1/mission-types', (route) => {
    if (route.request().method() === 'GET') return route.fulfill(json(types))
    return route.fallback()
  })
  return { setTypes: (next: typeof types) => { types = next } }
}

test.describe('SPEC-0509: estados operativos del vehículo', () => {
  test('CA-11: en misión se ve la misión y sólo se ofrece terminarla', async ({ page }) => {
    await mockConsole(page, 'IN_MISSION', { mission: MISSION })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)

    const card = page.getByRole('region', { name: 'Misión en curso' })
    await expect(card.getByText('Sargento Rueda Ortiz')).toBeVisible()
    await expect(card.getByText('Patrullaje')).toBeVisible()
    await expect(card.getByText('GAULA-BOG-2026-000004')).toBeVisible()
    await expect(card.getByText('Vencida')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Terminar misión' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Asignar vehículo' })).toHaveCount(0)
  })

  test('CA-5: enviar al taller exige decir qué avería tiene', async ({ page }) => {
    await mockConsole(page, 'IN_MISSION', { mission: MISSION })
    let body: Record<string, unknown> | null = null
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/release`, (route) => {
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill(json({}))
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)

    await page.getByLabel('Enviar al taller').check()
    const submit = page.getByRole('button', { name: 'Terminar misión' })
    await expect(submit).toBeDisabled()
    await page.getByLabel('Qué avería tiene *').fill('Llanta pinchada')
    await page.getByLabel('Odómetro de regreso (km)').fill('12150')
    await submit.click()

    await expect.poll(() => body).not.toBeNull()
    expect(body).toMatchObject({ sendToMaintenance: true, workshopReason: 'Llanta pinchada', returnOdometerKm: 12150 })
  })

  test('CA-3: en el taller, cerrar la orden exige decir qué se le hizo', async ({ page }) => {
    await mockConsole(page, 'MAINTENANCE', { openOrders: [OPEN_ORDER] })
    let body: Record<string, unknown> | null = null
    await page.route('**/api/v1/maintenance-orders/m1/close', (route) => {
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill(json({}))
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=mantenimiento`)

    await expect(page.getByRole('list', { name: 'Órdenes abiertas' }).getByText('Frenos')).toBeVisible()
    const close = page.getByRole('button', { name: 'Cerrar orden' })
    await expect(close).toBeDisabled()
    await page.getByLabel('Qué se le hizo *').fill('Cambio de pastillas')
    await close.click()

    await expect.poll(() => body).not.toBeNull()
    expect(body).toMatchObject({ closingNote: 'Cambio de pastillas' })
  })

  test('CA-11: en el taller, la pestaña de misiones no ofrece asignar', async ({ page }) => {
    await mockConsole(page, 'MAINTENANCE', { openOrders: [OPEN_ORDER] })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)

    await expect(page.getByText(/no sale a misión hasta que se cierre/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Asignar vehículo' })).toHaveCount(0)
  })

  test('CA-7: disponible, no se asigna sin tipo de misión', async ({ page }) => {
    await mockConsole(page, 'AVAILABLE')
    let body: Record<string, unknown> | null = null
    await page.route(`**/api/v1/vehicles/${VEHICLE_ID}/assign`, (route) => {
      body = JSON.parse(route.request().postData() ?? '{}')
      return route.fulfill({ status: 201, contentType: 'application/json', body: '{}' })
    })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)

    await page.getByLabel('Conductor *').selectOption(DRIVER_ID)
    const assign = page.getByRole('button', { name: 'Asignar vehículo' })
    await expect(assign).toBeDisabled()
    await page.getByLabel('Tipo de misión *').selectOption({ label: 'Patrullaje' })
    await page.getByLabel('Fin estimado').fill('2026-12-01T18:30')
    await assign.click()

    await expect.poll(() => body).not.toBeNull()
    expect(body!.missionTypeId).toBe('00000000-0000-0000-0000-0000000005a2')
    // Viaja un instante con zona, no la hora local sin zona del control.
    expect(String(body!.expectedEndAt)).toMatch(/Z$/)
    // Sin caso elegido, no viaja caso.
    expect(body).not.toHaveProperty('caseFileId')
  })

  test('fuera de servicio: el resumen dice el motivo y misiones no ofrece asignar', async ({ page }) => {
    await mockConsole(page, 'OUT_OF_SERVICE', { decommissionReason: 'Pérdida total' })
    await page.goto(`/recursos/flota/${VEHICLE_ID}`)

    await expect(page.getByRole('region', { name: 'Ahora' }).getByText(/Pérdida total/)).toBeVisible()

    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)
    await expect(page.getByRole('button', { name: 'Asignar vehículo' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Terminar misión' })).toHaveCount(0)
  })

  test('CA-10: la misión vencida se marca también en el inventario', async ({ page }) => {
    await mockConsole(page, 'IN_MISSION', { mission: MISSION }, 'MISSION_OVERDUE')
    await page.goto('/recursos/flota')

    await expect(page.getByText('Misión vencida')).toBeVisible()
  })

  test('CA-8: el catálogo de tipos de misión se crea, edita y elimina desde un modal', async ({ page }) => {
    const mock = await mockConsole(page, 'AVAILABLE')
    const calls: { method: string; url: string; body: unknown }[] = []
    await page.route('**/api/v1/mission-types', (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      const body = JSON.parse(route.request().postData() ?? '{}')
      calls.push({ method: 'POST', url: route.request().url(), body })
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'new', ...body, active: true }) })
    })
    await page.route('**/api/v1/mission-types/*', (route) => {
      const method = route.request().method()
      calls.push({ method, url: route.request().url(), body: route.request().postData() })
      if (method === 'DELETE') {
        // Usado por misiones anteriores → se archiva, no se borra.
        mock.setTypes([
          { id: TYPE_ID, name: 'Operativo de caso', description: null, active: false },
          { id: '00000000-0000-0000-0000-0000000005a2', name: 'Patrullaje', description: null, active: true },
        ])
        return route.fulfill(json({ outcome: 'ARCHIVED' }))
      }
      return route.fulfill(json({ id: TYPE_ID, name: 'Operativo', active: true }))
    })

    await page.goto('/recursos/flota')
    await page.getByRole('button', { name: 'Tipos de misión' }).click()
    const dialog = page.getByRole('dialog', { name: 'Tipos de misión' })

    await dialog.getByLabel('Nombre *').fill('Escolta')
    await dialog.getByRole('button', { name: 'Agregar' }).click()
    await expect.poll(() => calls.filter((c) => c.method === 'POST').length).toBe(1)
    expect(calls[0]!.body).toMatchObject({ name: 'Escolta' })

    const row = dialog.getByRole('listitem').filter({ hasText: 'Operativo de caso' })
    await row.getByRole('button', { name: 'Editar' }).click()
    const editing = dialog.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Guardar' }) })
    await editing.getByLabel('Nombre *').fill('Operativo')
    await editing.getByRole('button', { name: 'Guardar' }).click()
    await expect.poll(() => calls.some((c) => c.method === 'PUT' && c.url.endsWith(TYPE_ID))).toBe(true)

    await row.getByRole('button', { name: 'Eliminar' }).click()
    await row.getByRole('button', { name: 'Sí, eliminar' }).click()
    await expect(dialog.getByText('Se archivó: lo usan misiones anteriores.', { exact: false })).toBeVisible()
    await expect(dialog.getByText('Archivado')).toBeVisible()
  })

  test('accesibilidad: sin violaciones serias en la pestaña de una misión en curso', async ({ page }) => {
    await mockConsole(page, 'IN_MISSION', { mission: MISSION })
    await page.goto(`/recursos/flota/${VEHICLE_ID}?tab=misiones`)
    await expect(page.getByRole('button', { name: 'Terminar misión' })).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    const serious = results.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical')
    expect(serious.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.html}`)))
      .toEqual([])
  })
})
