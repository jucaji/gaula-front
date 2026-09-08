/// <reference lib="dom" />
import { test, expect, type Page } from '@playwright/test'

/**
 * BARRIDO DE RESPONSIVIDAD sobre TODAS las pantallas de la consola.
 *
 * <p>Mide, no mira: en cada ancho comprueba que el documento no se desplace en
 * horizontal y que ningún texto quede recortado dentro de su caja. Nace de dos
 * defectos reales del 2026-09-08 -- la barra lateral de ancho fijo que en un
 * teléfono dejaba el contenido en columnas de 12 px, y la cifra de dinero que se
 * salía de su tarjeta.
 *
 * <p><strong>El canario del final no es decoración.</strong> La primera versión
 * de este detector daba 0 problemas en las 22 rutas... porque estaba ciego: el
 * `<main>` de la consola tiene `overflow-auto`, así que su comprobación de
 * ancestros consideraba desplazable a TODO elemento de la página y no reportaba
 * nada. Un detector roto y una pantalla perfecta se ven exactamente igual desde
 * fuera. El canario inyecta un texto que NO cabe y exige que se detecte: si
 * alguien vuelve a romper la detección, falla esa prueba y no las 22 falsas.
 */
const SESSION = {
  userId: '00000000-0000-0000-0000-000000000203',
  displayName: 'Administrador del Sistema',
  roles: ['INTELLIGENCE_ANALYST', 'UNIT_COMMANDER', 'HOTLINE_OPERATOR', 'FIELD_OFFICER', 'ADMIN_STAFF', 'PREVENTION_STAFF', 'SYSTEM_ADMIN'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000102',
}

async function mockTodo(page: Page) {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url()
    const json = (body: unknown) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    // La sesión va DENTRO del comodín: en Playwright la última ruta registrada
    // gana, así que un `page.route('**/api/v1/me')` aparte quedaba tapado por
    // este comodín y la consola se quedaba sin sesión -- todas las pantallas
    // vacías y un barrido en verde que no probaba nada.
    if (/\/api\/v1\/me/.test(url)) return json(SESSION)
    if (/kpi\/compare/.test(url)) return json({ currentTotal: { reportCount: 128, arrests: 412, rescues: 37, preventedPaymentAmount: 1873450000, weaponsSeized: 96, vehiclesSeized: 54 }, previousTotal: { reportCount: 64, arrests: 200, rescues: 30, preventedPaymentAmount: 900000000, weaponsSeized: 40, vehiclesSeized: 25 }, byModality: [] })
    if (/observatory\/snapshots\/active/.test(url)) return json({ id: 'a1', source: 'Fiscalía General de la Nación', cutoffDate: '2026-06-30', label: 'Mesa de Seguimiento No.53', status: 'ACTIVE', loadedBy: 'x', loadedByName: 'Sargento Cárdenas Marín', loadedAt: '2026-09-07T14:05:00Z', incidentCount: 1873450 })
    if (/observatory\/dashboard\/analysis/.test(url)) return json({ available: true, unavailableReason: null, snapshotId: 'a1', trend: [{ month: '2026-07-01', observed: 3, trend: 2.4, seasonal: 0.2 }], variations: [{ label: 'Último mes contra el anterior', current: 4, previous: 2, changePct: 100, lowerPct: -30.2, upperPct: 512.4, significant: false, explanation: 'ruido' }], anomalies: [{ municipalityCode: '05002', municipalityText: 'SAN ANDRÉS DE CUERQUÍA', month: '2026-06-01', observed: 8, expected: 0.4, zScore: 7.6, explanation: 'contra su propia historia' }], hotspots: [{ clusterId: 0, municipalities: ['MEDELLIN', 'BELLO'], totalCount: 16 }], forecast: [{ month: '2026-08-01', projected: 5, lower: 1.6, upper: 8.4 }], notes: ['nota'] })
    if (/observatory\/dashboard/.test(url)) return json({ snapshotId: 'a1', total: 1873450, byAuthorGroup: [{ key: 'DELINCUENCIA COMÚN ORGANIZADA', count: 1873450 }], byDepartment: [{ key: 'VALLE DEL CAUCA', count: 900000 }], byMunicipality: [{ key: 'SANTIAGO DE CALI', count: 700000 }], byModality: [{ key: 'LLAMADA_TELEFONICA', count: 500000 }], byVictimStatus: [{ key: 'RESCATADO', count: 3 }], byKidnappingType: [{ key: 'SIMPLE', count: 3 }], monthly: [{ month: '2026-07-01', count: 1873450 }], yearly: [{ year: 2026, count: 1873450 }] })
    if (/observatory\/bulletin/.test(url)) return json({ snapshotId: 'a1', source: 'Fiscalía General de la Nación', cutoffDate: '2026-06-30', label: 'Mesa No.53', loadedByName: 'Sargento Cárdenas Marín', loadedAt: '2026-09-07T14:05:00Z', generatedAt: '2026-09-08T15:00:00Z', extortionTotal: 1873450, kidnappingTotal: 98765, topAuthorGroups: [{ key: 'DELINCUENCIA COMÚN ORGANIZADA', count: 1873450 }], topDepartments: [{ key: 'VALLE DEL CAUCA', count: 900000 }], byModality: [{ key: 'LLAMADA_TELEFONICA', count: 500000 }], byVictimStatus: [{ key: 'RESCATADO', count: 3 }], previousComparison: { previousCutoffDate: '2025-12-31', previousExtortionTotal: 1000000, previousKidnappingTotal: 50000 } })
    if (/observatory\/profiles/.test(url)) return json([{ id: 'p1', code: 'FISCALIA_EXTORSION_SECUESTRO', version: 1, provisional: true, displayName: 'Fiscalía — Extorsión y Secuestro (plantilla observada 19/08/2026)', sheets: ['SECUESTRO', 'EXTORSION'], validFrom: '2026-01-01' }])
    if (/observatory\/incidents/.test(url)) return json({ content: [{ id: 'i1', snapshotId: 'a1', profile: 'KIDNAPPING', occurredOn: '2026-07-21', departmentText: 'VALLE DEL CAUCA', municipalityText: 'SANTIAGO DE CALI', municipalityCode: '76001', municipalityUnresolved: false, authorGroup: 'DELINCUENCIA COMÚN ORGANIZADA', kidnappingType: 'EXTORSIVO', victimStatus: 'RESCATADO', occupation: 'COMERCIANTE', modality: null, notes: null, sourceRowNumber: 4, registeredAt: '2026-09-07T14:05:00Z', updatedAt: null }], totalElements: 1, totalPages: 1, pageNumber: 0, pageSize: 50 })
    if (/case-files\?|case-files$/.test(url)) return json({ content: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 20 })
    if (/operational-reports/.test(url)) return json({ content: [], totalElements: 0 })
    if (/report-templates/.test(url)) return json({ id: 't1', code: 'BASE', version: 1, sections: [] })
    if (/review-queue/.test(url)) return json({ content: [], totalElements: 0 })
    if (/vehicles|maintenance/.test(url)) return json({ content: [], totalElements: 0 })
    if (/admin\/users/.test(url)) return json({ content: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 20 })
    if (/audit/.test(url)) return json({ content: [], totalElements: 0, totalPages: 0, pageNumber: 0, pageSize: 20 })
    if (/access-policies/.test(url)) return json([])
    if (/crime-types|municipalities|modus|authorities|guidelines/.test(url)) return json([])
    return json([])
  })
}

const RUTAS = [
  // Rutas con parámetro: se prueban con identificadores concretos, porque una
  // pantalla de detalle es donde más contenido cabe y donde antes se rompía.
  '/casos/GAULA-BOG-2026-000004',
  '/campo/GAULA-BOG-2026-000004',
  '/reportes/44444444-4444-4444-4444-444444444444',
  '/reportes/revision/55555555-5555-5555-5555-555555555555',
  '/recursos/flota/66666666-6666-6666-6666-666666666666',
  '/tableros/extorsion/VALLE DEL CAUCA',
  '/tableros/secuestro/VALLE DEL CAUCA',
  '/', '/casos', '/casos/nuevo', '/campo', '/recepcion', '/recepcion/llamadas',
  '/reportes', '/reportes/nuevo', '/reportes/revision', '/analitica', '/analitica/carga-147',
  '/observatorio/hechos', '/observatorio/cargue', '/tableros', '/tableros/extorsion',
  '/tableros/secuestro', '/tableros/boletin', '/recursos/flota',
  '/admin/usuarios', '/admin/roles', '/admin/catalogos', '/admin/auditoria',
]


/** Recorre hasta `main`, cuyo `overflow-auto` es el scroll de la página y no una franja desplazable. */
const DETECTOR_RECORTADOS = () => {
  const puedeDesplazarse = (el: Element) => {
    let actual: Element | null = el
    while (actual && actual !== document.body && actual.tagName !== 'MAIN') {
      const overflow = getComputedStyle(actual).overflowX
      if (overflow === 'auto' || overflow === 'scroll') return true
      actual = actual.parentElement
    }
    return false
  }
  return Array.from(
    document.querySelectorAll('main p, main span, main h1, main h2, main h3, main td, main th, main button, main a'),
  )
    .filter((el) => (el.textContent ?? '').trim().length > 0)
    .filter((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)
    .filter((el) => !puedeDesplazarse(el))
    .map((el) => `${(el.textContent ?? '').trim().slice(0, 40)} (${el.scrollWidth}>${el.clientWidth})`)
}

for (const ancho of [320, 375, 768, 1280]) {
  test(`ninguna pantalla desborda ni recorta texto a ${ancho}px`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 })
    await mockTodo(page)

    const problemas: string[] = []
    for (const ruta of RUTAS) {
      await page.goto(ruta)
      await page.waitForSelector('main', { timeout: 15_000 })
      await page.waitForTimeout(500)

      // Control del propio barrido: una pantalla que no pinta nada no desborda
      // nunca. Sin esto, un fallo de la sesión simulada daría 22 verdes falsos.
      const largo = await page.evaluate(() => (document.querySelector('main')?.innerText ?? '').trim().length)
      expect(largo, `${ruta} no pintó contenido: el barrido no estaría probando nada`).toBeGreaterThan(20)

      const exceso = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      if (exceso > 1) problemas.push(`${ruta}: el documento se desplaza en horizontal (+${exceso}px)`)

      for (const recortado of await page.evaluate(DETECTOR_RECORTADOS)) {
        problemas.push(`${ruta}: texto recortado — ${recortado}`)
      }
    }

    expect(problemas, `problemas de responsividad a ${ancho}px`).toEqual([])
  })
}

test('canario: el detector de texto recortado no está ciego', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await mockTodo(page)
  await page.goto('/')
  await page.waitForSelector('main', { timeout: 15_000 })

  await page.evaluate(() => {
    const caja = document.createElement('div')
    caja.style.cssText = 'width:60px;overflow:hidden'
    const parrafo = document.createElement('p')
    parrafo.style.cssText = 'white-space:nowrap'
    parrafo.textContent = 'ESTE TEXTO NO CABE DE NINGUNA MANERA'
    caja.appendChild(parrafo)
    document.querySelector('main')!.appendChild(caja)
  })

  const encontrados = await page.evaluate(DETECTOR_RECORTADOS)
  expect(encontrados.join(' '), 'el detector no vio un texto deliberadamente recortado').toContain(
    'ESTE TEXTO NO CABE',
  )
})


/**
 * ZONAS TÁCTILES (docs/06 §7: "≥ 44×44 px en densidad `comfortable`",
 * WCAG 2.2 AA 2.5.8).
 *
 * <p>Se emula un dispositivo con DEDO (`hasTouch`), no sólo una pantalla
 * estrecha: lo que exige un objetivo grande es el puntero grueso, no el ancho.
 * Una tableta de 1024 px táctil lo necesita tanto como un teléfono; un portátil
 * pequeño con ratón, no.
 *
 * <p>Al escribirla se encontró que la promesa de docs/06 NO estaba implementada:
 * la densidad `comfortable` sólo cambiaba el alto de fila de las TABLAS, así que
 * los controles seguían en 28 y 34 px por más que el usuario la eligiera.
 */
test.describe('zonas táctiles en un dispositivo con dedo', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } })

  for (const ruta of RUTAS) {
    test(`${ruta} respeta 44x44 px`, async ({ page }) => {
      await mockTodo(page)
      await page.goto(ruta)
      await page.waitForSelector('main', { timeout: 15_000 })
      await page.waitForTimeout(400)

      // Control del propio control: si el puntero no se emula como grueso, la
      // densidad no sube y la prueba mediría otra cosa.
      const punteroGrueso = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)
      expect(punteroGrueso, 'no se está emulando un dispositivo táctil').toBe(true)

      const pequenos = await page.evaluate(() => {
        const selector = 'button, a[href], input, select, textarea, [role="radio"], [role="checkbox"]'
        // EXCEPCIÓN DE WCAG 2.5.8, no un atajo: el criterio excluye expresamente
        // los objetivos "en línea", es decir los que van dentro de una frase y
        // cuyo tamaño lo determina la altura de línea del texto que los rodea.
        // Agrandar un enlace incrustado en un párrafo rompería el párrafo.
        const enLineaDentroDeTexto = (el: Element) => {
          const padre = el.parentElement
          if (!padre) return false
          if (!['P', 'SPAN', 'LI', 'DD', 'DT', 'LABEL'].includes(padre.tagName)) return false
          // Hay texto real alrededor: no es un contenedor que sólo envuelve al control.
          return (padre.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 3
        }
        return Array.from(document.querySelectorAll(selector))
          .filter((el) => !enLineaDentroDeTexto(el))
          .map((el) => ({ el, caja: el.getBoundingClientRect() }))
          .filter(({ caja }) => caja.width > 0 && caja.height > 0)
          .filter(({ caja }) => caja.height < 44 || caja.width < 44)
          .map(({ el, caja }) =>
            `${el.tagName.toLowerCase()} ${Math.round(caja.width)}x${Math.round(caja.height)} "${(el.textContent ?? '').trim().slice(0, 24)}"`,
          )
      })

      expect(pequenos, `objetivos táctiles por debajo de 44x44 px en ${ruta}`).toEqual([])
    })
  }
})
