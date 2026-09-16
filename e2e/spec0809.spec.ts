import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/** SPEC-0809: la ficha por delito — el boletín de Mindefensa sin sus tres errores. */
const COMMANDER = {
  userId: '00000000-0000-0000-0000-000000000204',
  displayName: 'Comandante de Unidad',
  roles: ['UNIT_COMMANDER'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const MONTHLY_2025 = [892, 892, 949, 907, 1121, 1140, 1236, 1299, 1262, 1337, 1243, 1139]
const MONTHLY_2026 = [1125, 1116, 1251, 1256, 1249, 1168, 496]

function sheet(department: { code: string; name: string } | null, period = 'YEAR_TO_DATE') {
  return {
    indicator: 'EXTORTION',
    indicatorLabel: 'Extorsión',
    available: true,
    department,
    loadId: '44444444-4444-4444-4444-444444444444',
    source: 'Observatorio de Derechos Humanos y Defensa Nacional, Ministerio de Defensa Nacional',
    publishedAt: '2026-09-16T16:14:00Z',
    firstDate: '2003-01-01',
    cutoffDate: '2026-07-30',
    partialCutoffMonth: true,
    history: [5480, 4902, 5532, 7048, 8362, 8188, 8342, 9791, 11078, 13802, 13417].map((victims, index) => ({ year: 2015 + index, victims })),
    yearToDate: [4100, 3350, 3650, 4300, 5000, 3650, 4200, 4580, 5450, 7240, 7097, 7661].map((victims, index) => ({ year: 2015 + index, victims })),
    previousYear: 2025,
    currentYear: 2026,
    monthly: MONTHLY_2025.map((previous, index) => ({
      month: index + 1,
      previous,
      current: MONTHLY_2026[index] ?? null,
      partial: index === 6,
    })),
    sameWindow: { previousFrom: '2025-01-01', previousTo: '2025-07-30', currentFrom: '2026-01-01', currentTo: '2026-07-30', previous: 7097, current: 7661, absolute: 564, percent: 7.9 },
    fullMonths: { previousFrom: '2025-01-01', previousTo: '2025-07-31', currentFrom: '2026-01-01', currentTo: '2026-07-30', previous: 7137, current: 7661, absolute: 524, percent: 7.3 },
    notes: [{ effectiveOn: '2017-07-26', label: 'Desde el 26 de julio de 2017 la denuncia se puede presentar en línea (¡A Denunciar!).' }],
    territoryPeriod: period,
    territoryFrom: period === 'YEAR_TO_DATE' ? '2026-01-01' : '2025-01-01',
    territoryTo: period === 'YEAR_TO_DATE' ? '2026-07-30' : '2025-12-31',
    territoryLevel: department ? 'MUNICIPALITY' : 'DEPARTMENT',
    territories: department
      ? [{ code: '05001', name: 'MEDELLIN', victims: 900, latitude: 6.25, longitude: -75.56 }, { code: '05088', name: 'BELLO', victims: 120, latitude: 6.33, longitude: -75.56 }]
      : [{ code: '05', name: 'Antioquia', victims: 1200, latitude: null, longitude: null }, { code: '11', name: 'Bogotá, D.C.', victims: 1100, latitude: null, longitude: null }],
  }
}

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const ANALYSIS = {
  available: true, unavailableReason: null, snapshotId: '44444444-4444-4444-4444-444444444444',
  trend: [{ month: '2026-05-01', observed: 1249, trend: 1200, seasonal: 20 }, { month: '2026-06-01', observed: 1168, trend: 1210, seasonal: -30 }],
  variations: [{ label: 'Año 2026 contra 2025 (enero–junio)', current: 7165, previous: 5901, changePct: 21.4, lowerPct: 17.1, upperPct: 25.9, significant: true, explanation: 'La variación es distinguible del ruido esperable en conteos de este tamaño.' }],
  anomalies: [{ municipalityCode: '19001', municipalityText: 'POPAYAN', month: '2026-06-01', observed: 30, expected: 8.2, zScore: 4.1, explanation: '30 víctimas frente a un promedio propio de 8.2.' }],
  hotspots: [], forecast: [{ month: '2026-07-01', projected: 1180, lower: 1000, upper: 1360 }],
  notes: ['Julio de 2026 no entra en el análisis: los datos llegan al 30 y el mes está incompleto.'],
}

async function mockSheet(page: Page, { available = true, analysis = ANALYSIS as Record<string, unknown> } = {}) {
  const requests: URLSearchParams[] = []
  await page.route('**/api/v1/observatory/official-statistics/sheet/analysis?**', (route) => route.fulfill(json(analysis)))
  await page.route('**/api/v1/me', (route) => route.fulfill(json(COMMANDER)))
  await page.route('**/api/v1/catalog/departments/geometry', (route) => route.fulfill(json([])))
  await page.route('**/basemap/**', (route) => route.fulfill({ status: 404 }))
  await page.route('**/api/v1/observatory/official-statistics/sheet?**', (route) => {
    const params = new URL(route.request().url()).searchParams
    requests.push(params)
    if (!available) {
      return route.fulfill(json({ indicator: params.get('indicator'), indicatorLabel: 'Trata de personas', available: false, history: [], yearToDate: [], monthly: [], notes: [], territories: [] }))
    }
    const department = params.get('departmentCode') === '05' ? { code: '05', name: 'Antioquia' } : null
    return route.fulfill(json(sheet(department, params.get('period') ?? 'YEAR_TO_DATE')))
  })
  await page.route('**/api/v1/observatory/official-statistics/sheet.pdf?**', (route) => {
    requests.push(new URL(route.request().url()).searchParams)
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.4' })
  })
  return { requests }
}

test('los cuatro paneles, con la nota metodológica y la procedencia arriba', async ({ page }) => {
  await mockSheet(page)
  await page.goto('/tableros/cifras-oficiales/extorsion')

  await expect(page.getByRole('heading', { level: 1, name: 'Extorsión' })).toBeVisible()
  await expect(page.getByRole('main').getByText(/Corte al 30 de jul de 2026/)).toBeVisible()
  await expect(page.getByText('jul incompleto')).toBeVisible()
  await expect(page.getByText(/Nota metodológica/)).toBeVisible()
  for (const panel of ['Histórico — años completos', 'Corrido del año — 1 ene al 30 jul de cada año', 'Comparativo mensual 2025 – 2026', 'Variación del corrido del año']) {
    await expect(page.getByRole('region', { name: panel })).toBeVisible()
  }
})

test('CA-3: la misma ventana primero, y la cifra del boletín rotulada aparte', async ({ page }) => {
  await mockSheet(page)
  await page.goto('/tableros/cifras-oficiales/extorsion')

  const variation = page.getByRole('region', { name: 'Variación del corrido del año' })
  await expect(variation.getByRole('row', { name: /Misma ventana \(1 ene – 30 jul\) 7\.097 7\.661 \+564 \+7,9 %/ })).toBeVisible()
  await expect(variation.getByRole('row', { name: /Como el boletín \(ene – jul completos\) 7\.137 7\.661 \+524 \+7,3 %/ })).toBeVisible()
})

test('CA-1 y CA-2: meses futuros sin dato y el mes de corte parcial', async ({ page }) => {
  await mockSheet(page)
  await page.goto('/tableros/cifras-oficiales/extorsion')

  const monthly = page.getByRole('region', { name: 'Comparativo mensual 2025 – 2026' })
  await monthly.getByRole('button', { name: 'Ver tabla' }).click()
  await expect(monthly.getByRole('row', { name: 'jul 1.236 496 (parcial al 30 jul)' })).toBeVisible()
  await expect(monthly.getByRole('row', { name: 'ago 1.299 todavía no hay dato' })).toBeVisible()
  await expect(monthly.getByText(/^0$/)).toHaveCount(0)
})

test('CA-5: de un departamento a sus municipios, conservando delito y periodo', async ({ page }) => {
  const { requests } = await mockSheet(page)
  await page.goto('/tableros/cifras-oficiales/extorsion')

  await page.getByRole('button', { name: 'Año 2025' }).click()
  await expect(page).toHaveURL(/periodo=anio/)
  await expect.poll(() => requests.at(-1)?.get('period')).toBe('LAST_FULL_YEAR')

  const territory = page.getByRole('region', { name: 'Departamentos con más víctimas' })
  await territory.getByRole('button', { name: 'Ver tabla' }).click()
  await territory.getByRole('button', { name: 'Antioquia' }).click()

  await expect(page).toHaveURL(/departamento=05/)
  await expect(page).toHaveURL(/periodo=anio/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Extorsión · Antioquia')
  await expect(page.getByRole('region', { name: 'Municipios con más víctimas' })).toBeVisible()
  expect(requests.at(-1)?.get('departmentCode')).toBe('05')

  await page.getByRole('button', { name: '← Volver al país' }).click()
  await expect(page).not.toHaveURL(/departamento=/)
})

test('el PDF se pide con el mismo delito, departamento y periodo', async ({ page }) => {
  const { requests } = await mockSheet(page)
  await page.goto('/tableros/cifras-oficiales/extorsion?departamento=05')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Extorsión · Antioquia')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar ficha (PDF)' }).click()
  expect((await download).suggestedFilename()).toBe('ficha-extorsion-05.pdf')
  const pdfRequest = requests.at(-1)
  expect(pdfRequest?.get('indicator')).toBe('EXTORTION')
  expect(pdfRequest?.get('departmentCode')).toBe('05')
})

test('un delito sin cifras cargadas lo dice', async ({ page }) => {
  await mockSheet(page, { available: false })
  await page.goto('/tableros/cifras-oficiales/trata')

  await expect(page.getByText('Todavía no hay cifras oficiales de trata de personas')).toBeVisible()
})

test('accesibilidad: sin violaciones serias en la ficha', async ({ page }) => {
  await mockSheet(page)
  await page.goto('/tableros/cifras-oficiales/extorsion')
  await expect(page.getByRole('region', { name: 'Variación del corrido del año' })).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  const serias = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serias.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
})

test('SPEC-0811: el análisis dice víctimas, termina en el último mes completo y lo explica', async ({ page }) => {
  await mockSheet(page)
  await page.goto('/tableros/cifras-oficiales/extorsion')

  const section = page.getByRole('region', { name: 'Análisis de la serie' })
  await expect(section.getByText('Julio de 2026 no entra en el análisis: los datos llegan al 30 y el mes está incompleto.')).toBeVisible()
  await expect(section.getByText('Año 2026 contra 2025 (enero–junio)')).toBeVisible()
  await expect(section.getByText(/POPAYAN · 2026-06-01 · 30 víctimas/)).toBeVisible()
})

test('SPEC-0811 CA-6: sin servicio de análisis la ficha está completa y lo dice', async ({ page }) => {
  await mockSheet(page, { analysis: { available: false, unavailableReason: 'El servicio de análisis no está disponible.', trend: [], variations: [], anomalies: [], hotspots: [], forecast: [], notes: [] } })
  await page.goto('/tableros/cifras-oficiales/extorsion')

  await expect(page.getByText('Análisis estadístico no disponible')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Variación del corrido del año' })).toBeVisible()
})

