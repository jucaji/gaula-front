/// <reference lib="dom" />
import { test, expect, type Page } from '@playwright/test'

/**
 * docs/06: la consola tiene que servir en cualquier pantalla, incluido un
 * teléfono. Esta prueba MIDE, no mira: compara el ancho del contenido contra el
 * de su caja, en cinco anchos reales.
 *
 * Nace de un defecto encontrado el 2026-09-08: a 375 px la barra lateral tenía
 * ancho FIJO, así que se comía la pantalla -- las tarjetas de cifras quedaban en
 * columnas de 12 px y el documento entero desbordaba en horizontal. Una revisión
 * visual en un portátil no lo veía; una medición sí.
 */
const SESSION = {
  userId: '00000000-0000-0000-0000-000000000202',
  displayName: 'Sargento Cárdenas Marín',
  roles: ['INTELLIGENCE_ANALYST'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000102',
}

// Cifras grandes A PROPÓSITO: "$ 1.873.450.000" son quince caracteres, y es el
// caso que rompía la tarjeta. Un dato de juguete no habría encontrado nada.
const KPI = {
  currentTotal: { reportCount: 128, arrests: 412, rescues: 37, preventedPaymentAmount: 1873450000, weaponsSeized: 96, vehiclesSeized: 54 },
  previousTotal: { reportCount: 64, arrests: 200, rescues: 30, preventedPaymentAmount: 900000000, weaponsSeized: 40, vehiclesSeized: 25 },
  byModality: [],
}

async function mockAnalytics(page: Page) {
  await page.route('**/api/v1/me', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SESSION) }))
  await page.route('**/api/v1/catalog/crime-types', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/api/v1/analytics/kpi/compare**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KPI) }))
  await page.route('**/api/v1/analytics/series**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
}

const PANTALLAS = [
  { nombre: 'móvil', width: 375, height: 812 },
  { nombre: 'móvil grande', width: 430, height: 932 },
  { nombre: 'tableta', width: 768, height: 1024 },
  { nombre: 'portátil', width: 1280, height: 800 },
  { nombre: 'escritorio', width: 1920, height: 1080 },
] as const

for (const { nombre, width, height } of PANTALLAS) {
  test(`/analitica no desborda ni corta cifras en ${nombre} (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await mockAnalytics(page)

    await page.goto('/analitica')
    await expect(page.getByRole('region', { name: 'Cifras del período' })).toBeVisible()

    // 1. El documento no puede desplazarse en horizontal: si lo hace, hay algo
    //    que impone un ancho mínimo mayor que la pantalla.
    const desbordaDocumento = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    )
    expect(desbordaDocumento, `el documento se desplaza en horizontal en ${nombre}`).toBe(false)

    // 2. Ninguna cifra puede quedar recortada dentro de su tarjeta. Una cifra de
    //    dinero cortada no es un detalle estético: se lee como OTRA cifra.
    const recortadas = await page.evaluate(() => {
      const region = document.querySelector('section[aria-label="Cifras del período"]')!
      return Array.from(region.querySelectorAll('p'))
        .filter((p) => /\d/.test(p.textContent ?? '') && !(p.textContent ?? '').includes('vs.'))
        .filter((p) => p.scrollWidth > p.clientWidth + 1)
        .map((p) => p.textContent ?? '')
    })
    expect(recortadas, `cifras recortadas en ${nombre}`).toEqual([])
  })
}

test('en móvil la navegación se desplaza en horizontal en vez de comerse la pantalla', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockAnalytics(page)

  await page.goto('/analitica')

  const navegacion = page.getByRole('navigation', { name: 'Navegación principal' })
  await expect(navegacion).toBeVisible()

  // La barra ocupa el ancho de la pantalla y desplaza su contenido dentro; no
  // reserva una columna fija como en escritorio.
  const { anchoNav, anchoPantalla, seDesplaza } = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Navegación principal"]') as HTMLElement
    return {
      anchoNav: Math.round(nav.getBoundingClientRect().width),
      anchoPantalla: document.documentElement.clientWidth,
      seDesplaza: nav.scrollWidth > nav.clientWidth,
    }
  })
  expect(anchoNav).toBeGreaterThan(anchoPantalla * 0.9)
  expect(seDesplaza).toBe(true)
})
