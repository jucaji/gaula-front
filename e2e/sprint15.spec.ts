import { test, expect, type Page } from '@playwright/test'

/**
 * S15.FE.01 / S15.QA.01 (SPEC-0805): la superficie del análisis estadístico.
 *
 * La prueba que más importa NO es que se pinte la banda de tendencia: es que el
 * servicio de análisis se caiga y el tablero siga en pie DICIÉNDOLO.
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
  cutoffDate: '2026-06-30',
  label: 'Mesa de Seguimiento No.53',
  status: 'ACTIVE',
  loadedBy: ANALYST_SESSION.userId,
  loadedByName: 'Sargento Cárdenas Marín',
  loadedAt: '2026-09-07T14:05:00Z',
  incidentCount: 11,
}

const DASHBOARD = {
  snapshotId: SNAPSHOT.id,
  total: 3,
  byAuthorGroup: [{ key: 'ELN', count: 2 }],
  byDepartment: [{ key: 'ANTIOQUIA', count: 2 }],
  byMunicipality: [{ key: 'MEDELLIN', count: 2 }],
  byModality: [],
  byVictimStatus: [{ key: 'RESCATADO', count: 2 }],
  byKidnappingType: [{ key: 'SIMPLE', count: 3 }],
  monthly: [{ month: '2026-07-01', count: 3 }],
  yearly: [{ year: 2026, count: 3 }],
}

const ANALYSIS = {
  available: true,
  unavailableReason: null,
  snapshotId: SNAPSHOT.id,
  trend: [
    { month: '2026-05-01', observed: 2, trend: 2.1, seasonal: -0.1 },
    { month: '2026-06-01', observed: 4, trend: 2.4, seasonal: 0.2 },
  ],
  variations: [
    {
      label: 'Último mes contra el anterior',
      current: 4,
      previous: 2,
      changePct: 100,
      lowerPct: -30.2,
      upperPct: 512.4,
      significant: false,
      explanation: 'La variación NO es distinguible del ruido.',
    },
  ],
  anomalies: [
    {
      municipalityCode: '05002',
      municipalityText: 'ABEJORRAL',
      month: '2026-06-01',
      observed: 8,
      expected: 0.4,
      zScore: 7.6,
      explanation: '8 hechos frente a un promedio propio de 0.4.',
    },
  ],
  hotspots: [{ clusterId: 0, municipalities: ['MEDELLIN', 'BELLO'], totalCount: 16 }],
  forecast: [{ month: '2026-07-01', projected: 5, lower: 1.6, upper: 8.4 }],
  notes: ['No se proyectó más allá de 3 meses.'],
}

async function mockBase(page: Page) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYST_SESSION) }),
  )
  await page.route('**/api/v1/observatory/snapshots/active', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SNAPSHOT) }),
  )
  await page.route('**/api/v1/observatory/dashboard?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DASHBOARD) }),
  )
}

test('S15.FE.01: la proyección se muestra ETIQUETADA como proyección y con su banda, nunca mezclada con lo observado', async ({ page }) => {
  await mockBase(page)
  await page.route('**/api/v1/observatory/dashboard/analysis?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYSIS) }),
  )

  await page.goto('/tableros/secuestro')

  const trend = page.getByRole('region', { name: 'Tendencia y proyección' })
  await trend.getByRole('button', { name: 'Ver tabla' }).click()

  await expect(trend.getByRole('cell', { name: 'Proyección' })).toBeVisible()
  await expect(trend.getByRole('cell', { name: 'Observado' }).first()).toBeVisible()
  // CA-3: la proyección trae banda; el dato observado no la necesita.
  await expect(trend.getByRole('cell', { name: '1.6 – 8.4' })).toBeVisible()
})

test('S15.FE.01: una variación que es ruido se dice con todas sus letras, no sólo con un porcentaje', async ({ page }) => {
  await mockBase(page)
  await page.route('**/api/v1/observatory/dashboard/analysis?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYSIS) }),
  )

  await page.goto('/tableros/secuestro')

  const variations = page.getByRole('region', { name: 'Variaciones' })
  await expect(variations.getByText('+100.0 %')).toBeVisible()
  await expect(variations.getByText('dentro del ruido')).toBeVisible()
  await expect(variations.getByText(/intervalo -30.2 % a \+512.4 %/)).toBeVisible()
})

test('S15.FE.01: la anomalía municipal se muestra con su comparación contra la propia historia', async ({ page }) => {
  await mockBase(page)
  await page.route('**/api/v1/observatory/dashboard/analysis?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYSIS) }),
  )

  await page.goto('/tableros/secuestro')

  const anomalies = page.getByRole('region', { name: 'Anomalías municipales' })
  await expect(anomalies.getByText('ABEJORRAL · 2026-06-01 · 8 hechos')).toBeVisible()
  await expect(anomalies.getByText(/promedio propio de 0.4/)).toBeVisible()
})

test('S15.QA.01: el servicio de análisis caído NO rompe el tablero, y la pantalla dice por qué falta', async ({ page }) => {
  await mockBase(page)
  await page.route('**/api/v1/observatory/dashboard/analysis?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: false,
        unavailableReason: 'El servicio de análisis no está disponible.',
        snapshotId: null,
        trend: [],
        variations: [],
        anomalies: [],
        hotspots: [],
        forecast: [],
        notes: [],
      }),
    }),
  )

  await page.goto('/tableros/secuestro')

  // Las cifras del tablero siguen ahí...
  await expect(page.getByRole('region', { name: 'Grupo autor' })).toBeVisible()
  await expect(page.getByText('3 hechos de secuestro en el corte vigente con estos filtros.')).toBeVisible()
  // ...y la ausencia del análisis se DICE, con motivo.
  await expect(page.getByText('Análisis estadístico no disponible')).toBeVisible()
  await expect(page.getByText(/lo que falta es la explicación/)).toBeVisible()
})

test('S15.QA.01: un error de red en el análisis tampoco tumba el tablero', async ({ page }) => {
  await mockBase(page)
  await page.route('**/api/v1/observatory/dashboard/analysis?**', (route) => route.abort('failed'))

  await page.goto('/tableros/secuestro')

  await expect(page.getByRole('region', { name: 'Grupo autor' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Víctimas de secuestro' })).toBeVisible()
})
