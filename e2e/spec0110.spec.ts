import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** SPEC-0110: cargar el archivo del DANE. Primero se mira; sólo se retira lo que se marca. */
const MOCK_SESSION = {
  userId: '00000000-0000-0000-0000-000000000203',
  displayName: 'Administrador del Sistema',
  roles: ['SYSTEM_ADMIN'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const PLAN = {
  newDepartments: [{ code: '94', name: 'Guainía' }],
  newMunicipalities: [{ code: '94343', departmentCode: '94', name: 'Barrancominas', latitude: 2.4, longitude: -69.8 }],
  changed: [{ code: '25290', currentName: 'Fusagasugá', newName: 'Fusagasugá (DANE)', reactivates: false, fields: ['nombre'] }],
  missing: [
    { code: '11001', name: 'Bogotá D.C.', alreadyRetired: false },
    { code: '05001', name: 'Medellín', alreadyRetired: false },
  ],
  errors: [{ rowNumber: 7, raw: '25,Cundinamarca,2529', message: 'el código del municipio debe tener 5 dígitos' }],
}

const PREVIEW = {
  id: '11111111-1111-1111-1111-111111111111',
  fileName: 'divipola.csv',
  fileHash: 'a'.repeat(64),
  cutoffDate: null,
  source: 'DANE',
  status: 'PREVIEWED',
  newCount: 1,
  changedCount: 1,
  missingCount: 2,
  errorCount: 1,
  appliedNew: null,
  appliedChanged: null,
  appliedRetired: null,
  createdAt: '2026-09-16T12:00:00Z',
  expiresAt: '2026-09-16T12:30:00Z',
  appliedAt: null,
  plan: PLAN,
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mockAdmin(page: Page) {
  const applied: { body: Record<string, unknown>; url: string }[] = []
  await page.route('**/api/v1/me', (route) => route.fulfill(json(MOCK_SESSION)))
  await page.route('**/api/v1/admin/catalog/departments**', (route) => route.fulfill(json([])))
  await page.route('**/api/v1/admin/catalog/municipalities**', (route) =>
    route.fulfill(json({ content: [], totalElements: 0, page: 0, size: 50 })),
  )
  await page.route('**/api/v1/admin/catalog/divipola/imports**', (route) => route.fulfill(json([])))
  await page.route('**/api/v1/admin/catalog/divipola/preview**', (route) => route.fulfill(json(PREVIEW)))
  await page.route('**/api/v1/admin/catalog/divipola/*/apply', (route) => {
    applied.push({ url: new URL(route.request().url()).pathname, body: route.request().postDataJSON() })
    return route.fulfill(json({ ...PREVIEW, status: 'APPLIED', appliedNew: 1, appliedChanged: 1, appliedRetired: 1 }))
  })
  return { applied }
}

async function cargarArchivo(page: Page) {
  await page.getByRole('button', { name: 'Cargar archivo del DANE' }).click()
  await page.getByLabel('Archivo (.xlsx o .csv)').setInputFiles({
    name: 'divipola.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Código Municipio,Nombre Municipio\n25290,Fusagasugá\n'),
  })
  await page.getByRole('button', { name: 'Ver qué cambiaría' }).click()
}

test('la vista previa muestra qué cambiaría sin aplicar nada', async ({ page }) => {   // CA-2
  const { applied } = await mockAdmin(page)
  await page.goto('/admin/territorio')

  await cargarArchivo(page)

  await expect(page.getByText('1 nuevos')).toBeVisible()
  await expect(page.getByText('1 con cambios')).toBeVisible()
  await expect(page.getByText('2 ausentes del archivo')).toBeVisible()
  await expect(page.getByText('1 con error')).toBeVisible()
  await expect(page.getByText('Barrancominas')).toBeVisible()
  await expect(page.getByText('Fusagasugá → Fusagasugá (DANE)')).toBeVisible()
  expect(applied).toHaveLength(0)
})

test('CA-3: los ausentes salen sin marcar y sólo se retira lo marcado', async ({ page }) => {
  const { applied } = await mockAdmin(page)
  await page.goto('/admin/territorio')
  await cargarArchivo(page)

  const bogota = page.getByRole('checkbox', { name: /Bogotá D\.C\./ })
  const medellin = page.getByRole('checkbox', { name: /Medellín/ })
  await expect(bogota).not.toBeChecked()
  await expect(medellin).not.toBeChecked()

  await bogota.check()
  await page.getByRole('button', { name: 'Aplicar al catálogo' }).click()

  await expect.poll(() => applied.length).toBe(1)
  expect(applied[0]?.body).toMatchObject({
    fileHash: 'a'.repeat(64),
    retireCodes: ['11001'],
    applyNew: true,
    applyChanged: true,
  })
  await expect(page.getByRole('status')).toContainText('1 retirados')
})

test('sin marcar nada, aplicar no retira ningún municipio', async ({ page }) => {   // CA-3
  const { applied } = await mockAdmin(page)
  await page.goto('/admin/territorio')
  await cargarArchivo(page)

  await page.getByRole('button', { name: 'Aplicar al catálogo' }).click()

  await expect.poll(() => applied.length).toBe(1)
  expect(applied[0]?.body).toMatchObject({ retireCodes: [] })
})

test('un archivo que el servidor rechaza muestra el motivo y no deja aplicar', async ({ page }) => {
  await mockAdmin(page)
  await page.route('**/api/v1/admin/catalog/divipola/preview**', (route) =>
    route.fulfill(json({ title: 'Formato de archivo no admitido', detail: 'Cargue el archivo en .xlsx o .csv.' }, 422)),
  )
  await page.goto('/admin/territorio')

  await cargarArchivo(page)

  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aplicar al catálogo' })).toHaveCount(0)
})

test('accesibilidad: sin violaciones serias con la vista previa abierta', async ({ page }) => {
  await mockAdmin(page)
  await page.goto('/admin/territorio')
  await cargarArchivo(page)
  await expect(page.getByText('1 nuevos')).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serias = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serias.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})
