import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** SPEC-0810: explorador de datos — capa semántica, «Otros», bajada de nivel y vistas guardadas. */
const ANALYST = { userId: '00000000-0000-0000-0000-000000000202', displayName: 'Analista', roles: ['INTELLIGENCE_ANALYST'], territorialUnitId: '00000000-0000-0000-0000-000000000001' }
const COMMANDER = { ...ANALYST, userId: '00000000-0000-0000-0000-000000000204', displayName: 'Comandante', roles: ['UNIT_COMMANDER'] }
const VIEW_ID = '55555555-5555-4555-8555-555555555555'

const CATALOG = [
  {
    code: 'OFFICIAL', label: 'Cifras oficiales de Mindefensa',
    measure: { code: 'VICTIMS', label: 'Víctimas', singular: 'víctima', plural: 'víctimas' },
    dimensions: [
      { code: 'year', label: 'Año', kind: 'YEAR', child: null },
      { code: 'month', label: 'Mes', kind: 'MONTH', child: null },
      { code: 'series', label: 'Delito', kind: 'CATEGORY', child: 'conduct' },
      { code: 'conduct', label: 'Conducta', kind: 'CATEGORY', child: null },
      { code: 'department', label: 'Departamento', kind: 'CATEGORY', child: 'municipality' },
      { code: 'municipality', label: 'Municipio', kind: 'CATEGORY', child: null },
    ],
  },
  {
    code: 'INCIDENTS', label: 'Hechos del registro nacional (corte vigente)',
    measure: { code: 'INCIDENTS', label: 'Hechos', singular: 'hecho', plural: 'hechos' },
    dimensions: [{ code: 'profile', label: 'Perfil', kind: 'CATEGORY', child: null }],
  },
]

function result(request: { dimension: string; filters?: Record<string, string[]> }) {
  const dimension = CATALOG[0]!.dimensions.find((item) => item.code === request.dimension)!
  if (request.dimension === 'municipality') {
    return {
      source: 'OFFICIAL', dimension, measure: CATALOG[0]!.measure, total: 120, firstDate: '2003-01-01', cutoffDate: '2026-07-30', colorOrder: ['05001', '05088'],
      rows: [{ key: '05001', label: 'MEDELLIN', value: 90, partial: false }, { key: '05088', label: 'BELLO', value: 30, partial: false }],
      others: null, description: 'Víctimas por municipio, cifras oficiales de mindefensa; delito: Secuestro; departamento: Antioquia; corte 2026-07-30.',
    }
  }
  return {
    source: 'OFFICIAL', dimension, measure: CATALOG[0]!.measure, total: 701, firstDate: '2003-01-01', cutoffDate: '2026-07-30', colorOrder: ['05', '11', '76', '19', '52'],
    rows: [
      { key: '05', label: 'Antioquia', value: 120, partial: false },
      { key: '11', label: 'Bogotá D.C.', value: 100, partial: false },
      { key: '76', label: 'Valle del Cauca', value: 90, partial: false },
      { key: '19', label: 'Cauca', value: 80, partial: false },
      { key: '52', label: 'Nariño', value: 70, partial: false },
      { key: '54', label: 'Norte de Santander', value: 60, partial: false },
      { key: '81', label: 'Arauca', value: 50, partial: false },
    ],
    others: { key: '__OTHERS__', label: 'Otros (21)', value: 131, partial: false },
    description: 'Víctimas por departamento, cifras oficiales de mindefensa; delito: Secuestro; corte 2026-07-30.',
  }
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mockExplorer(page: Page, { session = ANALYST, visualizations = [] as unknown[] } = {}) {
  const explored: { dimension: string; filters: Record<string, string[]> }[] = []
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = []
  let saved: Record<string, unknown> | null = null
  await page.route('**/api/v1/me', (route) => route.fulfill(json(session)))
  await page.route('**/api/v1/observatory/explore/catalog', (route) => route.fulfill(json(CATALOG)))
  await page.route('**/api/v1/observatory/explore', (route) => {
    const body = route.request().postDataJSON()
    explored.push(body)
    return route.fulfill(json(result(body)))
  })
  await page.route('**/api/v1/observatory/visualizations**', (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET') {
      if (path.endsWith('/visualizations')) return route.fulfill(json(saved ? [saved, ...visualizations] : visualizations))
      const found = [saved, ...visualizations].find((item) => item && (item as { id: string }).id === path.split('/').at(-1))
      return found ? route.fulfill(json(found)) : route.fulfill(json({ code: 'VISUALIZATION_NOT_FOUND' }, 404))
    }
    const body = request.postDataJSON()
    writes.push({ method: request.method(), path, body })
    const status = path.endsWith('/publish') ? 'PUBLISHED' : path.endsWith('/archive') ? 'ARCHIVED' : 'DRAFT'
    saved = {
      id: VIEW_ID, mine: true, status, version: (saved?.version as number | undefined ?? -1) + 1,
      query: body.query ?? (saved?.query as object), presentation: body.presentation ?? (saved?.presentation as object),
      createdAt: '2026-09-16T18:00:00Z', updatedAt: '2026-09-16T18:00:00Z', publishedAt: status === 'PUBLISHED' ? '2026-09-16T18:01:00Z' : null,
    }
    return route.fulfill(json(saved, request.method() === 'POST' && path.endsWith('/visualizations') ? 201 : 200))
  })
  return { explored, writes }
}

test('Problema 2: la medida sobre cifras oficiales es víctimas, y no existe «conteo de filas»', async ({ page }) => {
  await mockExplorer(page)
  await page.goto('/observatorio/explorar')

  await expect(page.getByRole('tabpanel', { name: 'Selección de datos' }).getByText('Víctimas', { exact: true })).toBeVisible()
  await expect(page.getByText(/contar filas daría una cifra falsa/)).toBeVisible()
  await expect(page.getByText(/conteo de filas/i)).toHaveCount(0)
  await expect(page.getByText(/Qué muestra: Víctimas por departamento/)).toBeVisible()
})

test('CA-4 y CA-5: «Otros» con el resto, y bajar de departamento a municipio conservando filtros', async ({ page }) => {
  const { explored } = await mockExplorer(page)
  await page.goto('/observatorio/explorar')

  const chart = page.getByRole('region', { name: 'Visualización' })
  await chart.getByRole('button', { name: 'Ver tabla' }).click()
  await expect(chart.getByRole('row', { name: /Otros \(21\) 131/ })).toBeVisible()

  await chart.getByRole('button', { name: 'Antioquia' }).click()
  await expect.poll(() => explored.at(-1)?.dimension).toBe('municipality')
  expect(explored.at(-1)?.filters).toEqual({ series: ['KIDNAPPING'], department: ['05'] })
  await expect(page.getByRole('navigation', { name: 'Niveles' })).toContainText('Departamento › Municipio')

  await page.getByRole('button', { name: '← Subir un nivel' }).click()
  // La pregunta anterior ya está en caché: se vuelve a ella sin otra consulta.
  await expect(chart.getByRole('button', { name: 'Antioquia' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Niveles' })).toHaveCount(0)
})

test('la torta se ofrece sólo con seis categorías o menos', async ({ page }) => {
  await mockExplorer(page)
  await page.goto('/observatorio/explorar')

  await expect(page.getByRole('radio', { name: /Torta: sólo con 6 categorías o menos/ })).toBeDisabled()
  await page.getByLabel('Límite de categorías mostradas').fill('5')
  await expect(page.getByRole('radio', { name: 'Barras horizontales' })).toBeEnabled()
})

test('CA-6: guardar un borrador con su formato, publicarlo y archivarlo', async ({ page }) => {
  const { writes } = await mockExplorer(page)
  await page.goto('/observatorio/explorar')

  await page.getByRole('tab', { name: 'Formato' }).click()
  await page.getByLabel('Título', { exact: true }).fill('Secuestro por departamento')
  await page.getByRole('button', { name: 'Guardar como borrador' }).click()

  await expect(page).toHaveURL(new RegExp(`vista=${VIEW_ID}`))
  expect(writes[0]?.method).toBe('POST')
  expect((writes[0]?.body.presentation as { title: string }).title).toBe('Secuestro por departamento')
  expect((writes[0]?.body.query as { filters: object }).filters).toEqual({ series: ['KIDNAPPING'] })

  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect.poll(() => writes.at(-1)?.path).toBe(`/api/v1/observatory/visualizations/${VIEW_ID}/publish`)
  expect(writes.at(-1)?.body).toEqual({ version: 0 })
  await expect(page.getByRole('status')).toHaveText('Vista publicada para su unidad.')

  await page.getByRole('button', { name: 'Archivar' }).click()
  await expect.poll(() => writes.at(-1)?.path).toBe(`/api/v1/observatory/visualizations/${VIEW_ID}/archive`)
  await expect(page).not.toHaveURL(/vista=/)
})

test('el comandante explora y abre lo publicado, pero no guarda', async ({ page }) => {
  await mockExplorer(page, {
    session: COMMANDER,
    visualizations: [{
      id: VIEW_ID, mine: false, status: 'PUBLISHED', version: 2,
      query: { source: 'OFFICIAL', dimension: 'municipality', filters: { department: ['05'] } },
      presentation: { title: 'Antioquia por municipio' },
      createdAt: '2026-09-16T18:00:00Z', updatedAt: '2026-09-16T18:00:00Z', publishedAt: '2026-09-16T18:01:00Z',
    }],
  })
  await page.goto('/observatorio/explorar')

  await page.getByRole('button', { name: /Antioquia por municipio/ }).click()
  await expect(page.getByText(/Publicada por otra persona de su unidad/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Antioquia por municipio' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Guardar/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Publicar' })).toHaveCount(0)
})

test('accesibilidad: sin violaciones serias en el explorador', async ({ page }) => {
  await mockExplorer(page)
  await page.goto('/observatorio/explorar')
  await expect(page.getByText(/Qué muestra/)).toBeVisible()
  for (const tab of ['Ejes', 'Formato', 'Ventana emergente']) {
    await page.getByRole('tab', { name: tab }).click()
    const results = await new AxeBuilder({ page }).analyze()
    const serias = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serias.map((v) => `${tab} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  }
})
