import { test, expect, type Page } from '@playwright/test'

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
  monthly: [{ month: '2026-08-01', count: 5 }],
  yearly: [{ year: 2026, count: 15 }],
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
