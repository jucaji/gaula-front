import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * SPEC-0807: el tablero territorial — mapa, filtros y lo que queda fuera.
 *
 * Las pruebas que importan aquí no son "el mapa se ve": son que el mapa NO
 * mienta (dice cuántos hechos no pudo ubicar), que filtre de verdad (el clic
 * llega a la URL y a la consulta) y que no dependa del servicio de análisis.
 */
const ANALYST_SESSION = {
  userId: '00000000-0000-0000-0000-000000000202',
  displayName: 'Sargento Cárdenas Marín',
  roles: ['INTELLIGENCE_ANALYST'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
  operationalUnitId: '00000000-0000-0000-0000-000000000101',
}

const SNAPSHOT = {
  id: '2b8f0a3c-5f1e-4c3a-9a11-0f2ce3f1a001',
  source: 'Fiscalía General de la Nación',
  cutoffDate: '2026-09-30',
  label: 'Mesa de Seguimiento No.54',
  status: 'ACTIVE',
  loadedBy: ANALYST_SESSION.userId,
  loadedByName: 'Sargento Cárdenas Marín',
  loadedAt: '2026-09-08T14:05:00Z',
  incidentCount: 34,
}

const DASHBOARD = {
  snapshotId: SNAPSHOT.id,
  // 34 hechos en total, pero sólo 30 se pudieron ubicar: 4 quedaron sin
  // municipio resuelto. Es el caso que el mapa tiene que declarar.
  total: 34,
  mappedTotal: 30,
  byAuthorGroup: [{ key: 'ELN', count: 17 }],
  byDepartment: [{ key: 'ANTIOQUIA', count: 22 }],
  byMunicipality: [{ key: 'MEDELLIN', count: 6 }],
  byModality: [],
  byVictimStatus: [{ key: 'RESCATADO', count: 9 }],
  byKidnappingType: [{ key: 'SIMPLE', count: 16 }],
  byOccupation: [
    { key: 'COMERCIANTE', count: 13 },
    { key: 'GANADERO', count: 7 },
  ],
  // Dos años y un hueco en medio: el calendario tiene que distinguir el mes con
  // cero hechos del mes que el corte no cubre.
  monthly: [
    { month: '2025-01-01', count: 2 },
    { month: '2025-03-01', count: 4 },
    { month: '2026-08-01', count: 5 },
  ],
  yearly: [
    { year: 2025, count: 9 },
    { year: 2026, count: 15 },
  ],
  departmentMonthly: [
    {
      key: 'ANTIOQUIA',
      points: [
        { month: '2025-01-01', count: 2 },
        { month: '2026-08-01', count: 5 },
      ],
    },
  ],
  map: [
    { municipalityCode: '05001', municipalityText: 'MEDELLIN', count: 6, latitude: 6.2466, longitude: -75.5818 },
    { municipalityCode: '05002', municipalityText: 'ABEJORRAL', count: 10, latitude: 5.7893, longitude: -75.4287 },
    { municipalityCode: '68001', municipalityText: 'BUCARAMANGA', count: 3, latitude: 7.1165, longitude: -73.1326 },
  ],
}

const ANALYSIS = {
  available: true,
  unavailableReason: null,
  trend: [],
  variations: [],
  anomalies: [
    {
      municipalityCode: '05002',
      municipalityText: 'ABEJORRAL',
      month: '2026-08-01',
      observed: 4,
      expected: 0.2,
      zScore: 3.8,
      explanation: '4 hechos frente a un promedio propio de 0.2.',
    },
  ],
  hotspots: [{ clusterId: 0, municipalities: ['ABEJORRAL', 'MEDELLIN'], totalCount: 16 }],
  forecast: [],
  notes: [],
}

async function mockDashboard(page: Page, consultas: string[], analysisAvailable = true) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYST_SESSION) }),
  )
  await page.route('**/api/v1/observatory/snapshots/active', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) }),
  )
  await page.route('**/api/v1/observatory/dashboard/analysis?**', (route) =>
    analysisAvailable
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYSIS) })
      : route.fulfill({ status: 503, contentType: 'application/json', body: '{}' }),
  )
  await page.route('**/api/v1/observatory/dashboard?**', (route) => {
    consultas.push(new URL(route.request().url()).search)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DASHBOARD) })
  })
}

test('SPEC-0807 CA-1: el mapa DICE cuántos hechos no pudo ubicar', async ({ page }) => {
  await mockDashboard(page, [])

  await page.goto('/tableros/secuestro')

  const mapa = page.getByRole('region', { name: 'Mapa del registro nacional' })
  await expect(mapa).toContainText('30 de 34 hechos ubicados en el mapa')
  // Lo que no está en el mapa NO desaparece del dato, y eso se dice.
  await expect(mapa).toContainText('4 no se pudieron ubicar')
  await expect(mapa).toContainText('siguen contados en las cifras y en las tablas')
})

test('SPEC-0807 CA-6: sin el servicio de análisis el mapa sigue mostrando los hechos', async ({ page }) => {
  await mockDashboard(page, [], false)

  await page.goto('/tableros/secuestro')

  // Los focos y las anomalías son una capa ENCIMA de los conteos, no el mapa.
  await expect(page.getByRole('region', { name: 'Mapa del registro nacional' })).toContainText(
    '30 de 34 hechos ubicados',
  )
})

test('SPEC-0807 CA-3: los filtros puestos se ven como fichas y se quitan de a uno', async ({ page }) => {
  const consultas: string[] = []
  await mockDashboard(page, consultas)

  await page.goto('/tableros/secuestro?municipalityCode=05002&authorGroup=ELN')

  const fichas = page.getByRole('group', { name: 'Filtros aplicados' })
  // El municipio se muestra por su NOMBRE aunque en la URL viaje el código.
  await expect(fichas).toContainText('ABEJORRAL')
  await expect(fichas).toContainText('ELN')

  await fichas.getByRole('button', { name: /Quitar filtro Autor/ }).click()
  await expect.poll(() => consultas.at(-1)).not.toContain('authorGroup')
  await expect(page).not.toHaveURL(/authorGroup=ELN/)
  // El otro filtro sobrevive: quitar uno no es limpiar todo.
  await expect(page).toHaveURL(/municipalityCode=05002/)
})

test('SPEC-0807: los filtros nuevos llegan a la consulta y salen de lo que el corte tiene', async ({ page }) => {
  const consultas: string[] = []
  await mockDashboard(page, consultas)

  await page.goto('/tableros/secuestro')

  // La lista se llena con el desglose del propio corte: ofrecer una opción que no
  // existe en el dato lleva a una pantalla vacía y hace creer que no hubo hechos.
  await page.getByLabel('Filtrar por ocupación').selectOption('GANADERO')
  await expect.poll(() => consultas.at(-1)).toContain('occupation=GANADERO')

  await page.getByLabel('Filtrar por situación de la víctima').selectOption('RESCATADO')
  await expect.poll(() => consultas.at(-1)).toContain('victimStatus=RESCATADO')
})

test('SPEC-0807: la ocupación de la víctima se grafica con su tabla equivalente', async ({ page }) => {
  await mockDashboard(page, [])

  await page.goto('/tableros/secuestro')

  const tarjeta = page.getByRole('region', { name: 'Ocupación de la víctima' })
  await tarjeta.getByRole('button', { name: 'Ver tabla' }).click()
  await expect(tarjeta.getByRole('cell', { name: 'COMERCIANTE' })).toBeVisible()
  await expect(tarjeta.getByRole('cell', { name: '13', exact: true })).toBeVisible()
})

test('SPEC-0807 CA-5: el modo lámina proyecta el MISMO tablero, con su corte y sus abstenciones', async ({ page }) => {
  const consultas: string[] = []
  await mockDashboard(page, consultas)

  await page.goto('/tableros/secuestro')
  // Esperar a que la pantalla se asiente: contar consultas a medio vuelo mide el
  // arranque, no lo que hace el modo lámina.
  await expect(page.getByRole('button', { name: 'Modo lámina' })).toBeVisible()
  await page.waitForTimeout(1000)
  const consultasAntes = consultas.length

  await page.getByRole('button', { name: 'Modo lámina' }).click()
  const lamina = page.getByRole('region', { name: 'Modo lámina' })

  // La procedencia va en TODAS las láminas: una cifra proyectada sin corte es la
  // lámina escrita a mano que este módulo vino a reemplazar.
  await expect(lamina).toContainText('Mesa de Seguimiento No.54')
  await expect(lamina).toContainText('34')
  await expect(lamina).toContainText('lámina 1 de')

  // No calcula nada aparte: entrar al modo lámina no dispara una consulta nueva.
  await page.waitForTimeout(1000)
  expect(consultas.length).toBe(consultasAntes)

  // Se avanza con el teclado, como en la sala.
  await page.keyboard.press('ArrowRight')
  await expect(lamina).toContainText('lámina 2 de')
  await page.keyboard.press('ArrowLeft')
  await expect(lamina).toContainText('lámina 1 de')

  await page.keyboard.press('Escape')
  await expect(page.getByRole('region', { name: 'Modo lámina' })).toBeHidden()
})

test('SPEC-0807 CA-5: la lámina lleva la anomalía y NO inventa láminas sin dato', async ({ page }) => {
  await mockDashboard(page, [])

  await page.goto('/tableros/secuestro')
  await page.getByRole('button', { name: 'Modo lámina' }).click()
  const lamina = page.getByRole('region', { name: 'Modo lámina' })

  const titulos: string[] = []
  for (let i = 0; i < 12; i++) {
    titulos.push((await lamina.getByRole('heading', { level: 2 }).innerText()).trim())
    const siguiente = lamina.getByRole('button', { name: 'Lámina siguiente' })
    if (await siguiente.isDisabled()) break
    await siguiente.click()
  }

  expect(titulos).toContain('Anomalías por municipio')
  expect(titulos).toContain('Focos geográficos')
  // El mock de secuestro no trae modalidad: esa lámina no puede existir, porque
  // una gráfica vacía proyectada se lee como "no hubo".
  expect(titulos).not.toContain('Modalidad de la denuncia')
})

test('SPEC-0807: la lámina cumple accesibilidad en los dos temas', async ({ page }) => {
  await mockDashboard(page, [])

  // El tema se fija ANTES de cargar, como en el resto de la suite: cambiarlo con
  // la lámina ya en pantalla mide los colores a medio camino y da un fallo que
  // no existe (visto al escribir esta prueba).
  for (const tema of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: tema })
    await page.goto('/tableros/secuestro')
    await page.getByRole('button', { name: 'Modo lámina' }).click()
    await expect(page.getByRole('region', { name: 'Modo lámina' })).toBeVisible()

    const resultado = await new AxeBuilder({ page }).analyze()
    expect(resultado.violations, `violaciones de accesibilidad en tema ${tema}`).toEqual([])
  }
})

test('SPEC-0807: el calendario distingue un mes SIN hechos de un mes que el corte no cubre', async ({ page }) => {
  await mockDashboard(page, [])

  await page.goto('/tableros/secuestro')

  const calendario = page.getByRole('region', { name: 'Estacionalidad por mes y año' })
  await expect(calendario).toBeVisible()

  // Febrero de 2025 está DENTRO del período y no tuvo hechos: es un cero.
  await expect(calendario.getByLabel('febrero de 2025: 0 hechos')).toBeVisible()
  // Marzo de 2025 sí los tuvo.
  await expect(calendario.getByLabel('marzo de 2025: 4 hechos')).toBeVisible()
  // Diciembre de 2026 es posterior al último mes con dato: no es un cero, es
  // ausencia de cobertura, y la leyenda lo nombra.
  await expect(calendario.getByLabel('diciembre de 2026: fuera del período consultado')).toBeVisible()
  await expect(calendario).toContainText('Fuera del período consultado')
})

test('SPEC-0807: el ranking territorial lleva su micro-serie', async ({ page }) => {
  await mockDashboard(page, [])

  await page.goto('/tableros/secuestro')

  const tarjeta = page.getByRole('region', { name: 'Departamentos con más hechos' })
  await tarjeta.getByRole('button', { name: 'Ver tabla' }).click()
  await expect(tarjeta.getByRole('img', { name: 'Evolución mensual de ANTIOQUIA' })).toBeVisible()
})
