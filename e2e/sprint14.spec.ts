import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * S14.FE.01-05 (SPEC-0803/0804): los tableros que sustituyen a Power BI y el
 * boletín del corte.
 *
 * Las tres pruebas que más importan son las que verifican lo que el tablero
 * actual NO da: que un filtro sea una URL, que toda gráfica tenga tabla, y que
 * sin corte se diga "no hay dato" en vez de pintar ceros.
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

const KIDNAPPING_DASHBOARD = {
  snapshotId: SNAPSHOT.id,
  total: 3,
  byAuthorGroup: [
    { key: 'ELN', count: 2 },
    { key: 'GDCO', count: 1 },
  ],
  byDepartment: [
    { key: 'ANTIOQUIA', count: 2 },
    { key: 'VALLE DEL CAUCA', count: 1 },
  ],
  byMunicipality: [{ key: 'MEDELLIN', count: 2 }],
  byModality: [],
  byVictimStatus: [{ key: 'RESCATADO', count: 2 }],
  byKidnappingType: [{ key: 'SIMPLE', count: 3 }],
  monthly: [{ month: '2026-07-01', count: 3 }],
  yearly: [{ year: 2026, count: 3 }],
}

async function mockSession(page: Page) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYST_SESSION) }),
  )
}

async function mockSnapshot(page: Page, snapshot: Record<string, unknown> | null) {
  await page.route('**/api/v1/observatory/snapshots/active', (route) =>
    snapshot
      ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot) })
      : route.fulfill({ status: 204, body: '' }),
  )
}

test('S14.FE.01: el índice de tableros dice de qué corte vienen las cifras y separa observatorio de analítica', async ({ page }) => {
  await mockSession(page)
  await mockSnapshot(page, SNAPSHOT)

  await page.goto('/tableros')

  await expect(page.getByRole('heading', { name: 'Tableros del observatorio' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Corte de datos vigente' })).toContainText('Corte al 30 de junio de 2026')
  // docs/00 §8.3: los dos universos NO se suman, y la pantalla lo dice.
  await expect(page.getByText(/No se suman/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Denuncias por extorsión/ })).toBeVisible()
})

test('S14.FE.03: cada gráfica tiene su tabla equivalente con el conteo exacto', async ({ page }) => {
  await mockSession(page)
  await mockSnapshot(page, SNAPSHOT)
  await page.route('**/api/v1/observatory/dashboard?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KIDNAPPING_DASHBOARD) }),
  )

  await page.goto('/tableros/secuestro')

  const authorCard = page.getByRole('region', { name: 'Grupo autor' })
  await authorCard.getByRole('button', { name: 'Ver tabla' }).click()

  // El tablero actual sólo muestra porcentajes en una dona: de ahí nadie puede
  // sacar el conteo exacto para citarlo.
  await expect(authorCard.getByRole('cell', { name: 'ELN' })).toBeVisible()
  await expect(authorCard.getByRole('cell', { name: '2', exact: true })).toBeVisible()
  await expect(authorCard.getByRole('cell', { name: '66.7 %' })).toBeVisible()
})

test('S14.FE.04: el drill-down por departamento es una RUTA, no un estado interno', async ({ page }) => {
  await mockSession(page)
  await mockSnapshot(page, SNAPSHOT)
  const requestedFilters: string[] = []
  await page.route('**/api/v1/observatory/dashboard?**', (route) => {
    requestedFilters.push(new URL(route.request().url()).search)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KIDNAPPING_DASHBOARD) })
  })

  await page.goto('/tableros/secuestro')
  const departmentCard = page.getByRole('region', { name: 'Departamentos con más hechos' })
  await departmentCard.getByRole('button', { name: 'Ver tabla' }).click()
  await departmentCard.getByRole('link', { name: 'ANTIOQUIA' }).click()

  // Un enlace es un estado: se comparte una URL, no una captura de pantalla.
  await expect(page).toHaveURL(/\/tableros\/secuestro\/ANTIOQUIA/)
  await expect(page.getByText('Departamento: ANTIOQUIA')).toBeVisible()
  expect(requestedFilters.at(-1)).toContain('departmentText=ANTIOQUIA')
})

test('S14.FE.02: los filtros viajan en la URL y llegan a la consulta', async ({ page }) => {
  await mockSession(page)
  await mockSnapshot(page, SNAPSHOT)
  const requestedFilters: string[] = []
  await page.route('**/api/v1/observatory/dashboard?**', (route) => {
    requestedFilters.push(new URL(route.request().url()).search)
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...KIDNAPPING_DASHBOARD, byModality: [{ key: 'PANFLETOS', count: 1 }], byVictimStatus: [], byKidnappingType: [] }),
    })
  })

  await page.goto('/tableros/extorsion?authorGroup=GDCO')
  // Esperar a que la consulta REALMENTE se haya hecho: el filtro se prueba contra
  // la petición, no contra la barra de direcciones.
  await expect(page.getByRole('region', { name: 'Evolutivo mensual' })).toBeVisible()

  await expect(page).toHaveURL(/authorGroup=GDCO/)
  expect(requestedFilters.at(-1)).toContain('authorGroup=GDCO')
})

test('S14.FE.02: sin corte cargado el tablero lo DICE y no pinta ceros', async ({ page }) => {
  await mockSession(page)
  await mockSnapshot(page, null)
  await page.route('**/api/v1/observatory/dashboard?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...KIDNAPPING_DASHBOARD, snapshotId: null, total: 0 }),
    }),
  )

  await page.goto('/tableros/extorsion')

  await expect(page.getByText('No hay ningún corte cargado')).toBeVisible()
  // Un cero afirma "cero hechos": eso es una afirmación sobre la realidad.
  await expect(page.getByText(/No es que no haya hechos/)).toBeVisible()
})

test('S14.FE.05: el boletín se ve en pantalla con su procedencia antes de descargarlo', async ({ page }) => {
  await mockSession(page)
  await mockSnapshot(page, SNAPSHOT)
  await page.route('**/api/v1/observatory/bulletin', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        snapshotId: SNAPSHOT.id,
        source: SNAPSHOT.source,
        cutoffDate: SNAPSHOT.cutoffDate,
        label: SNAPSHOT.label,
        loadedByName: 'Sargento Cárdenas Marín',
        loadedAt: SNAPSHOT.loadedAt,
        generatedAt: '2026-09-07T21:42:00Z',
        extortionTotal: 8,
        kidnappingTotal: 3,
        topAuthorGroups: [{ key: 'ELN', count: 5 }],
        topDepartments: [{ key: 'ANTIOQUIA', count: 4 }],
        byModality: [{ key: 'PANFLETOS', count: 2 }],
        byVictimStatus: [{ key: 'RESCATADO', count: 2 }],
        previousComparison: { previousCutoffDate: '2025-12-31', previousExtortionTotal: 3, previousKidnappingTotal: 6 },
      }),
    }),
  )
  await page.route('**/api/v1/observatory/bulletin/pdf', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: Buffer.from('%PDF-fake') }),
  )

  await page.goto('/tableros/boletin')

  await expect(page.getByText('Fiscalía General de la Nación').first()).toBeVisible()
  await expect(page.getByText('Mesa de Seguimiento No.53').first()).toBeVisible()
  await expect(page.getByText('3 en el corte al 2025-12-31')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar PDF' }).click()
  await downloadPromise
})

test('S14.FE.05: criterio A10 -- axe-core sin violaciones en el tablero, en ambos temas', async ({ page }) => {
  await mockSession(page)
  await mockSnapshot(page, SNAPSHOT)
  await page.route('**/api/v1/observatory/dashboard?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KIDNAPPING_DASHBOARD) }),
  )

  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme })
    await page.goto('/tableros/secuestro')
    await expect(page.getByRole('heading', { name: 'Víctimas de secuestro' })).toBeVisible()

    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations, `violaciones de accesibilidad en tema ${theme}`).toEqual([])
  }
})
