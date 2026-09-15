import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * SPEC-0108: el municipio se busca (por nombre o código) y la persona lee
 * nombres donde el sistema guarda códigos.
 */
const MOCK_SESSION = {
  userId: '00000000-0000-0000-0000-000000000201',
  displayName: 'Soldado Ramírez Gómez',
  roles: ['HOTLINE_OPERATOR'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

const MUNICIPIOS = [
  { code: '11001', name: 'Bogotá D.C.', departmentName: 'Bogotá D.C.', territorialUnitName: 'GAULA Militar Bogotá D.C.' },
  { code: '25290', name: 'Fusagasugá', departmentName: 'Cundinamarca', territorialUnitName: null },
  { code: '25286', name: 'Funza', departmentName: 'Cundinamarca', territorialUnitName: null },
]

const TIPOLOGIAS = [
  { code: 'EXTORTION', name: 'Extorsión', gaulaJurisdiction: true },
  { code: 'KIDNAPPING', name: 'Secuestro extorsivo', gaulaJurisdiction: true },
]

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function mockCatalog(page: Page, { byCodeFails = false } = {}) {
  const byCodeRequests: string[] = []
  await page.route('**/api/v1/me', (route) => route.fulfill(json(MOCK_SESSION)))
  await page.route('**/api/v1/catalog/crime-types', (route) => route.fulfill(json(TIPOLOGIAS)))
  await page.route('**/api/v1/catalog/municipalities**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/by-code')) {
      byCodeRequests.push(url.searchParams.get('codes') ?? '')
      if (byCodeFails) return route.fulfill(json({ title: 'falla' }, 500))
      const codes = (url.searchParams.get('codes') ?? '').split(',')
      return route.fulfill(json(MUNICIPIOS.filter((m) => codes.includes(m.code))))
    }
    const q = (url.searchParams.get('q') ?? '').toLowerCase()
    if (q.startsWith('fu')) return route.fulfill(json(MUNICIPIOS.filter((m) => m.code.startsWith('25'))))
    if (/^\d+$/.test(q)) return route.fulfill(json(MUNICIPIOS.filter((m) => m.code.startsWith(q))))
    if (q.startsWith('bog')) return route.fulfill(json([MUNICIPIOS[0]]))
    return route.fulfill(json([]))
  })
  return { byCodeRequests }
}

test.describe('SPEC-0108: abrir un caso', () => {
  test('el municipio se busca por nombre y uno sin GAULA no deja abrir el caso', async ({ page }) => {   // CA-1, CA-3, CA-4
    await mockCatalog(page)
    let posted: Record<string, unknown> | null = null
    await page.route('**/api/v1/case-files', (route) => {
      if (route.request().method() !== 'POST') return route.fallback()
      posted = route.request().postDataJSON() as Record<string, unknown>
      return route.fulfill(json({ trackingNumber: 'GAULA-BOG-2026-000009' }, 201))
    })
    await page.route('**/api/v1/case-files/GAULA-BOG-2026-000009', (route) =>
      route.fulfill(json({
        trackingNumber: 'GAULA-BOG-2026-000009', status: 'RECEIVED', priority: 'NORMAL', classificationLevel: 'PUBLIC',
        crimeTypeCode: 'EXTORTION', municipalityCode: '11001', summary: 'Llamada de extorsión.', involvesMinor: false,
      })),
    )

    await page.goto('/casos/nuevo')
    await page.getByLabel('Tipología *').selectOption({ label: 'Extorsión' })

    const municipio = page.getByRole('combobox', { name: 'Municipio *' })
    await municipio.fill('fusa')
    const fusa = page.getByRole('option', { name: /Fusagasugá/ })
    await expect(fusa).toContainText('Cundinamarca · 25290')
    await expect(fusa).toContainText('Sin GAULA asignado')
    await fusa.click()

    await expect(municipio).toHaveValue('Fusagasugá, Cundinamarca')
    await expect(page.getByRole('alert')).toContainText('Sin GAULA territorial asignado')
    await expect(page.getByRole('button', { name: 'Abrir caso' })).toBeDisabled()

    await page.getByRole('button', { name: 'Quitar municipio *' }).click()
    await municipio.fill('bogo')
    await page.getByRole('option', { name: /Bogotá D\.C\./ }).click()
    await expect(page.getByText('Se asigna a')).toContainText('GAULA Militar Bogotá D.C.')

    await page.getByLabel('Resumen *').fill('Llamada de extorsión.')
    await page.getByRole('button', { name: 'Abrir caso' }).click()

    await expect(page).toHaveURL(/\/casos\/GAULA-BOG-2026-000009/)
    expect(posted).toMatchObject({ crimeTypeCode: 'EXTORTION', municipalityCode: '11001' })
    await expect(page.getByText('Bogotá D.C., Bogotá D.C.')).toBeVisible()
    await expect(page.getByText('(11001)')).toBeVisible()
    await expect(page.getByText('Extorsión', { exact: true })).toBeVisible()
  })

  test('también se busca por código y se maneja con teclado', async ({ page }) => {   // CA-1, CA-2
    await mockCatalog(page)
    await page.goto('/casos/nuevo')

    const municipio = page.getByRole('combobox', { name: 'Municipio *' })
    await municipio.fill('25')
    await expect(page.getByRole('listbox')).toBeVisible()
    await expect(municipio).toHaveAttribute('aria-expanded', 'true')
    // `getByRole('option')` a secas también cuenta las opciones de la lista de tipologías.
    const opciones = page.getByRole('listbox').getByRole('option')
    await expect(opciones).toHaveCount(2)

    await municipio.press('ArrowDown')
    await expect(page.getByRole('option', { name: /Funza/ })).toHaveAttribute('aria-selected', 'true')
    await municipio.press('Escape')
    await expect(page.getByRole('listbox')).toBeHidden()

    await municipio.fill('25290')
    await expect(opciones).toHaveCount(1)
    await municipio.press('Enter')
    await expect(municipio).toHaveValue('Fusagasugá, Cundinamarca')
    // Enter eligió; no envió el formulario.
    await expect(page).toHaveURL(/\/casos\/nuevo/)
  })

  test('un texto sin coincidencias lo dice', async ({ page }) => {
    await mockCatalog(page)
    await page.goto('/casos/nuevo')
    await page.getByRole('combobox', { name: 'Municipio *' }).fill('zzz')
    await expect(page.getByRole('status')).toContainText('Ningún municipio coincide con «zzz»')
  })
})

test.describe('SPEC-0108: nombres en lugar de códigos', () => {
  const CASOS = {
    content: [
      { id: 'c1', trackingNumber: 'GAULA-BOG-2026-000001', status: 'RECEIVED', priority: 'NORMAL', crimeTypeCode: 'KIDNAPPING', municipalityCode: '25290' },
      { id: 'c2', trackingNumber: 'GAULA-BOG-2026-000002', status: 'RECEIVED', priority: 'HIGH', crimeTypeCode: 'EXTORTION', municipalityCode: '11001' },
    ],
    totalElements: 2, totalPages: 1, pageNumber: 0, pageSize: 20,
  }

  test('la bandeja de casos muestra nombres y los pide en una sola petición', async ({ page }) => {   // CA-5
    const { byCodeRequests } = await mockCatalog(page)
    await page.route('**/api/v1/case-files?**', (route) => route.fulfill(json(CASOS)))

    await page.goto('/casos')
    await expect(page.getByRole('cell', { name: 'Fusagasugá, Cundinamarca' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Bogotá D.C., Bogotá D.C.' })).toBeVisible()
    await expect(page.getByRole('cell', { name: 'Secuestro extorsivo' })).toBeVisible()
    expect(byCodeRequests).toHaveLength(1)
    expect(byCodeRequests[0]?.split(',').sort()).toEqual(['11001', '25290'])
  })

  test('el filtro de municipio deja el código en la URL y al recargar muestra el nombre', async ({ page }) => {   // CA-6
    await mockCatalog(page)
    const filtros: string[] = []
    await page.route('**/api/v1/case-files?**', (route) => {
      filtros.push(new URL(route.request().url()).searchParams.get('municipalityCode') ?? '')
      return route.fulfill(json(CASOS))
    })

    await page.goto('/casos')
    const municipio = page.getByRole('combobox', { name: 'Municipio' })
    await municipio.fill('bogo')
    await page.getByRole('option', { name: /Bogotá D\.C\./ }).click()

    // El router guarda el texto entre comillas (`%2211001%22`) para no confundirlo con un número.
    await expect(page).toHaveURL(/municipalityCode=(%22)?11001/)
    await expect.poll(() => filtros.at(-1)).toBe('11001')
    await expect(municipio).toHaveValue('Bogotá D.C., Bogotá D.C.')

    await page.reload()
    await expect(page.getByRole('combobox', { name: 'Municipio' })).toHaveValue('Bogotá D.C., Bogotá D.C.')

    await page.getByRole('button', { name: 'Quitar municipio' }).click()
    await expect(page).not.toHaveURL(/municipalityCode/)
  })

  test('un enlace pegado con el código sin comillas también filtra', async ({ page }) => {   // CA-6
    await mockCatalog(page)
    const filtros: string[] = []
    await page.route('**/api/v1/case-files?**', (route) => {
      filtros.push(new URL(route.request().url()).searchParams.get('municipalityCode') ?? '')
      return route.fulfill(json(CASOS))
    })

    // `05001` sin comillas lo lee el router como el número 5001: el cero inicial
    // es parte del código DIVIPOLA y no se puede perder.
    await page.goto('/casos?municipalityCode=25290')
    await expect.poll(() => filtros.at(-1)).toBe('25290')
    await expect(page.getByRole('combobox', { name: 'Municipio' })).toHaveValue('Fusagasugá, Cundinamarca')
  })

  test('si el catálogo falla, se muestra el código', async ({ page }) => {   // CA-5
    await mockCatalog(page, { byCodeFails: true })
    await page.route('**/api/v1/case-files?**', (route) => route.fulfill(json(CASOS)))

    await page.goto('/casos')
    await expect(page.getByRole('cell', { name: '25290', exact: true })).toBeVisible()
  })
})

for (const [nombre, ruta] of [['nuevo caso', '/casos/nuevo'], ['bandeja de casos', '/casos']] as const) {
  test(`accesibilidad: sin violaciones serias en ${nombre} con la lista abierta`, async ({ page }) => {   // CA-10
    await mockCatalog(page)
    await page.route('**/api/v1/case-files?**', (route) =>
      route.fulfill(json({ content: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 20 })),
    )
    await page.goto(ruta)
    await page.getByRole('combobox', { name: /Municipio/ }).fill('fusa')
    await expect(page.getByRole('listbox')).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    const serias = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serias.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([])
  })
}
