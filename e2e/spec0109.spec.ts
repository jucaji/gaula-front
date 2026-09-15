import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** SPEC-0109: administrar el catálogo territorial. Retirar no es borrar. */
const MOCK_SESSION = {
  userId: '00000000-0000-0000-0000-000000000203',
  displayName: 'Administrador del Sistema',
  roles: ['SYSTEM_ADMIN'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const BOGOTA = {
  code: '11001', name: 'Bogotá D.C.', departmentCode: '11', departmentName: 'Bogotá D.C.', population: 7900000,
  latitude: 4.6, longitude: -74.08, territorialUnitId: '00000000-0000-0000-0000-000000000001',
  territorialUnitName: 'GAULA Militar Bogotá D.C.', routingValidFrom: '2026-01-01', retiredAt: null,
  retiredNote: null, version: 3,
}
const FUSA = {
  code: '25290', name: 'Fusagasugá', departmentCode: '25', departmentName: 'Cundinamarca', population: 143000,
  latitude: 4.34, longitude: -74.36, territorialUnitId: null, territorialUnitName: null, routingValidFrom: null,
  retiredAt: null, retiredNote: null, version: 0,
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mockCatalog(page: Page) {
  const calls: { method: string; url: string; body: unknown; ifMatch: string | null }[] = []
  await page.route('**/api/v1/me', (route) => route.fulfill(json(MOCK_SESSION)))
  await page.route('**/api/v1/territorial-units', (route) =>
    route.fulfill(json([{ id: '00000000-0000-0000-0000-000000000002', code: 'MED', name: 'GAULA Militar Antioquia' }])),
  )
  await page.route('**/api/v1/admin/catalog/departments**', (route) =>
    route.fulfill(json([
      { code: '11', name: 'Bogotá D.C.', municipalityCount: 1, retiredAt: null, version: 0 },
      { code: '25', name: 'Cundinamarca', municipalityCount: 116, retiredAt: null, version: 0 },
    ])),
  )
  await page.route('**/api/v1/admin/catalog/municipalities**', (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (request.method() !== 'GET') {
      calls.push({
        method: request.method(),
        url: url.pathname,
        body: request.postData() ? request.postDataJSON() : null,
        ifMatch: request.headers()['if-match'] ?? null,
      })
      if (request.method() === 'DELETE') {
        // Bogotá tiene casos: se retira. Fusagasugá no: se borra.
        const retired = url.pathname.endsWith('11001')
        return route.fulfill(json({ outcome: retired ? 'RETIRED' : 'DELETED' }))
      }
      return route.fulfill(json(BOGOTA))
    }
    const sinGaula = url.searchParams.get('onlyWithoutRouting') === 'true'
    const content = sinGaula ? [FUSA] : [BOGOTA, FUSA]
    return route.fulfill(json({ content, totalElements: content.length, page: 0, size: 50 }))
  })
  return { calls }
}

test('la pantalla lista los municipios con su GAULA y su estado', async ({ page }) => {   // CA-7
  await mockCatalog(page)
  await page.goto('/admin/territorio')

  await expect(page.getByRole('cell', { name: 'GAULA Militar Bogotá D.C.' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Sin asignar' })).toBeVisible()
  await expect(page.getByRole('row', { name: /Fusagasugá/ }).getByText('Vigente')).toBeVisible()
})

test('el filtro «sin GAULA asignado» deja sólo los municipios sin enrutamiento', async ({ page }) => {   // CA-7
  await mockCatalog(page)
  await page.goto('/admin/territorio')

  await page.getByLabel('Sin GAULA asignado').check()

  await expect(page).toHaveURL(/sinGaula=true/)
  await expect(page.getByRole('cell', { name: 'Fusagasugá' })).toBeVisible()
  await expect(page.getByRole('cell', { name: 'Bogotá D.C.', exact: true })).toHaveCount(0)
})

test('crear un municipio envía código, departamento y nombre', async ({ page }) => {   // CA-1
  const { calls } = await mockCatalog(page)
  await page.goto('/admin/territorio')

  await page.getByRole('button', { name: 'Nuevo municipio' }).click()
  await page.getByLabel('Código DIVIPOLA *').fill('94343')
  await page.getByLabel('Departamento *').selectOption('25')
  await page.getByLabel('Nombre *').fill('Barrancominas')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect.poll(() => calls.filter((call) => call.method === 'POST').length).toBe(1)
  expect(calls[0]?.body).toMatchObject({ code: '94343', departmentCode: '25', name: 'Barrancominas' })
  await expect(page.getByRole('status')).toContainText('Barrancominas quedó registrado')
})

test('corregir viaja con If-Match y no toca el código', async ({ page }) => {   // CA-3
  const { calls } = await mockCatalog(page)
  await page.goto('/admin/territorio')

  await page.getByRole('row', { name: /Fusagasugá/ }).getByRole('button', { name: 'Corregir' }).click()
  await expect(page.getByLabel('Código DIVIPOLA *')).toHaveCount(0)
  await page.getByLabel('Nombre *').fill('Fusagasugá (corregido)')
  await page.getByRole('button', { name: 'Guardar' }).click()

  await expect.poll(() => calls.filter((call) => call.method === 'PUT').length).toBe(1)
  const put = calls.find((call) => call.method === 'PUT')
  expect(put?.ifMatch).toBe('0')
  expect(put?.body).toMatchObject({ name: 'Fusagasugá (corregido)' })
})

test('eliminar dice si borró o retiró, según lo que el municipio tenga detrás', async ({ page }) => {   // CA-4
  await mockCatalog(page)
  await page.goto('/admin/territorio')

  await page.getByRole('row', { name: /Fusagasugá/ }).getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByRole('status')).toContainText('se eliminó: no lo usaba nadie')

  await page.getByRole('row', { name: /Bogotá D\.C\./ }).getByRole('button', { name: 'Eliminar' }).click()
  await expect(page.getByRole('status')).toContainText('quedó retirado')
  await expect(page.getByRole('status')).toContainText('su historia se conserva')
})

test('asignar GAULA abre una vigencia nueva con su fecha', async ({ page }) => {   // CA-6
  const { calls } = await mockCatalog(page)
  await page.goto('/admin/territorio')

  await page.getByRole('row', { name: /Fusagasugá/ }).getByRole('button', { name: 'Asignar GAULA' }).click()
  await expect(page.getByText('Hoy no tiene ninguno asignado')).toBeVisible()
  await page.getByLabel('GAULA territorial *').selectOption('00000000-0000-0000-0000-000000000002')
  await page.getByLabel('Rige desde *').fill('2026-10-01')
  // `exact`: «Asignar» también está dentro de «Asignar GAULA» de cada fila.
  await page.getByRole('button', { name: 'Asignar', exact: true }).click()

  await expect.poll(() => calls.filter((call) => call.url.endsWith('/routing')).length).toBe(1)
  expect(calls.find((call) => call.url.endsWith('/routing'))?.body).toMatchObject({
    territorialUnitId: '00000000-0000-0000-0000-000000000002',
    effectiveDate: '2026-10-01',
  })
})

test('retirar y reactivar están en la misma fila', async ({ page }) => {   // CA-5
  const { calls } = await mockCatalog(page)
  await page.goto('/admin/territorio')

  await page.getByRole('row', { name: /Fusagasugá/ }).getByRole('button', { name: 'Retirar' }).click()

  await expect.poll(() => calls.filter((call) => call.url.endsWith('/retire')).length).toBe(1)
  await expect(page.getByRole('status')).toContainText('quedó retirado')
})

test('accesibilidad: sin violaciones serias en el catálogo territorial', async ({ page }) => {
  await mockCatalog(page)
  await page.goto('/admin/territorio')
  await expect(page.getByRole('cell', { name: 'Fusagasugá' })).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serias = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serias.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})
