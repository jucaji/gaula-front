import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** SPEC-0808: cifras oficiales de Mindefensa. Se mira antes de publicar, y la medida es víctimas. */
const ANALYST = {
  userId: '00000000-0000-0000-0000-000000000202',
  displayName: 'Analista de Inteligencia',
  roles: ['INTELLIGENCE_ANALYST'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const LOAD_ID = '22222222-2222-2222-2222-222222222222'

const ACTIVE_KIDNAPPING: Record<string, unknown> & { id: string } = {
  id: '33333333-3333-3333-3333-333333333333',
  series: 'KIDNAPPING',
  seriesLabel: 'Secuestro',
  source: 'Mindefensa',
  fileName: 'SECUESTRO.xlsx',
  fileHash: 'b'.repeat(64),
  status: 'ACTIVE',
  firstDate: '2003-01-01',
  cutoffDate: '2026-06-30',
  rows: 10200,
  victims: 10600,
  victimsByYear: [],
  victimsByConduct: [],
  buckets: [],
  errorCount: 0,
  errors: [],
  unknownMunicipalityCount: 0,
  unknownMunicipalities: [],
  warnings: [],
  comparedWithLoadId: null,
  comparison: [],
  createdAt: '2026-08-10T12:00:00Z',
  expiresAt: '2026-08-10T12:30:00Z',
  appliedAt: '2026-08-10T12:05:00Z',
  supersededAt: null,
}

const PREVIEW = {
  ...ACTIVE_KIDNAPPING,
  id: LOAD_ID,
  status: 'PREVIEWED',
  fileHash: 'a'.repeat(64),
  cutoffDate: '2026-07-30',
  rows: 10334,
  victims: 10766,
  appliedAt: null,
  victimsByYear: [{ year: 2025, victims: 701 }, { year: 2026, victims: 217 }],
  victimsByConduct: [
    { conduct: 'KIDNAPPING_SIMPLE_168', article: '168', label: 'Secuestro simple', hiddenByDefault: false, victims: 4643 },
    { conduct: 'KIDNAPPING_EXTORTIVE_169', article: '169', label: 'Secuestro extorsivo', hiddenByDefault: false, victims: 6123 },
  ],
  unknownMunicipalityCount: 1,
  unknownMunicipalities: [{ code: '99773', name: 'CUMARIBO', departmentName: 'VICHADA', rows: 2, victims: 3 }],
  warnings: ['PARTIAL_LAST_MONTH'],
  comparedWithLoadId: ACTIVE_KIDNAPPING.id,
  comparison: [
    { year: 2025, previous: 698, current: 701, difference: 3 },
    { year: 2026, previous: 180, current: 217, difference: 37 },
  ],
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mockOfficial(
  page: Page,
  { session = ANALYST, preview = PREVIEW as Record<string, unknown> }: { session?: typeof ANALYST; preview?: Record<string, unknown> } = {},
) {
  const applied: string[] = []
  await page.route('**/api/v1/me', (route) => route.fulfill(json(session)))
  await page.route('**/api/v1/observatory/snapshots/active', (route) => route.fulfill(json(null)))
  await page.route('**/api/v1/observatory/official-statistics/summary?**', (route) => {
    const series = new URL(route.request().url()).searchParams.get('series')
    if (series === 'KIDNAPPING') {
      return route.fulfill(json({
        series, seriesLabel: 'Secuestro', includeHidden: false,
        load: { ...ACTIVE_KIDNAPPING, warnings: ['PARTIAL_LAST_MONTH'] },
        victimsByYear: [{ year: 2024, victims: 313 }, { year: 2025, victims: 701 }, { year: 2026, victims: 217 }],
        buckets: [],
      }))
    }
    return route.fulfill(json({ series, seriesLabel: series, includeHidden: false, load: null, victimsByYear: [], buckets: [] }))
  })
  await page.route('**/api/v1/observatory/official-statistics/loads**', (route) => route.fulfill(json([ACTIVE_KIDNAPPING])))
  await page.route('**/api/v1/observatory/official-statistics/preview?**', (route) => route.fulfill(json(preview)))
  await page.route('**/api/v1/observatory/official-statistics/*/apply', (route) => {
    applied.push(new URL(route.request().url()).pathname)
    return route.fulfill(json({ ...PREVIEW, status: 'ACTIVE', appliedAt: '2026-09-16T15:05:00Z' }))
  })
  return { applied }
}

const ARCHIVO = { name: 'SECUESTRO.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from('PK') }

test('lo vigente por delito: corte, año corrido marcado y delitos sin carga dicho en claro', async ({ page }) => {
  await mockOfficial(page)
  await page.goto('/observatorio/cifras-oficiales')

  const secuestro = page.getByRole('region', { name: 'Cifras de Secuestro' })
  await expect(secuestro.getByText('30 de jun de 2026')).toBeVisible()
  // La banda del registro de la Fiscalía no va encima: afirmaría otro corte.
  await expect(page.getByText(/Fuente: Fiscalía/)).toHaveCount(0)
  await expect(secuestro.getByRole('row', { name: /2026 \(corrido\) 217/ })).toBeVisible()
  await expect(secuestro.getByText('último mes incompleto')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Cifras de Extorsión' })
    .getByText('Todavía no se ha cargado ningún archivo de este delito.')).toBeVisible()
})

test('vista previa: víctimas contra lo vigente, advertencias y municipios desconocidos; publicar reenvía el archivo', async ({ page }) => {
  const { applied } = await mockOfficial(page)
  await page.goto('/observatorio/cifras-oficiales')

  const panel = page.getByRole('region', { name: 'Cargar cifras oficiales' })
  await panel.getByLabel('Delito del archivo').selectOption('KIDNAPPING')
  await panel.getByLabel('Archivo (.xlsx o .csv)').setInputFiles(ARCHIVO)
  await panel.getByRole('button', { name: 'Ver qué cambiaría' }).click()

  await expect(panel.getByText('10.766 víctimas')).toBeVisible()
  await expect(panel.getByRole('row', { name: '2026 180 217 +37' })).toBeVisible()
  await expect(panel.getByText(/termina a mitad de mes/)).toBeVisible()
  await expect(panel.getByText('1 municipios que el catálogo no conoce')).toBeVisible()

  await panel.getByRole('button', { name: 'Publicar estas cifras' }).click()
  await expect(panel.getByRole('status')).toContainText('10.766 víctimas')
  expect(applied).toEqual([`/api/v1/observatory/official-statistics/${LOAD_ID}/apply`])
})

test('CA-4: con filas en error no se puede publicar, y cada error dice su fila', async ({ page }) => {
  await mockOfficial(page, {
    preview: {
      ...PREVIEW,
      errorCount: 1,
      errors: [{ rowNumber: 9, problem: 'INVALID_DATE', value: '31/02/2026' }],
    },
  })
  await page.goto('/observatorio/cifras-oficiales')

  const panel = page.getByRole('region', { name: 'Cargar cifras oficiales' })
  await panel.getByLabel('Archivo (.xlsx o .csv)').setInputFiles(ARCHIVO)
  await panel.getByRole('button', { name: 'Ver qué cambiaría' }).click()

  await expect(panel.getByText('Fila 9: Fecha inválida')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Publicar estas cifras' })).toBeDisabled()
})

test('prevención ve las cifras pero no puede cargar', async ({ page }) => {
  await mockOfficial(page, { session: { ...ANALYST, roles: ['PREVENTION_STAFF'] } })
  await page.goto('/observatorio/cifras-oficiales')

  await expect(page.getByRole('region', { name: 'Cifras de Secuestro' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Cargar cifras oficiales' })).toHaveCount(0)
})

test('accesibilidad: sin violaciones serias con la vista previa abierta', async ({ page }) => {
  await mockOfficial(page)
  await page.goto('/observatorio/cifras-oficiales')
  const panel = page.getByRole('region', { name: 'Cargar cifras oficiales' })
  await panel.getByLabel('Archivo (.xlsx o .csv)').setInputFiles(ARCHIVO)
  await panel.getByRole('button', { name: 'Ver qué cambiaría' }).click()
  await expect(panel.getByText('10.766 víctimas')).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serias = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serias.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})
