import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

/**
 * S0.FE.09: smoke E2E + escaneo de accesibilidad, self-contained (sin
 * backend real). `useSessionQuery` (src/lib/auth/useSession.ts) exige una
 * sesión real de `GET /api/v1/me` -- sin backend, mockeamos esa ÚNICA
 * frontera de red con `page.route`, y dejamos que corra el código real de
 * la app (App.tsx, AppShell, permissions.ts) contra esa respuesta. No
 * sustituye a los E2E de negocio de cada sprint (esos sí necesitan el
 * backend real levantado).
 */
const MOCK_SESSION = {
  userId: '00000000-0000-0000-0000-000000000201',
  displayName: 'Soldado Ramírez Gómez',
  roles: ['HOTLINE_OPERATOR'],
  territorialUnitId: '00000000-0000-0000-0000-000000000001',
}

async function mockSession(page: Page) {
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_SESSION) }),
  )
}

test('la página de inicio carga sin violaciones de accesibilidad', async ({ page }) => {
  await mockSession(page)
  await page.goto('/')
  await expect(page.getByRole('navigation')).toBeVisible()
  await expect(page.getByText(MOCK_SESSION.displayName)).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('/casos respeta el permiso de lectura y muestra un estado -- nunca pantalla en blanco', async ({ page }) => {
  await mockSession(page)
  await page.route('**/api/v1/case-files**', (route) => route.abort('failed'))

  await page.goto('/casos')
  await expect(page.getByRole('heading', { name: 'Casos' })).toBeVisible()

  // El fetch de casos falla a propósito (ruta abortada) -- lo que importa
  // es que SIEMPRE se pinte un estado (nunca el "fetchStatus: paused" que
  // motivó el hallazgo de retry:false en useCaseFileSearch).
  await expect(page.getByText(/No se pudo cargar|Failed to fetch/)).toBeVisible()
})

test('sin sesión válida, la SPA nunca renderiza contenido protegido -- redirige a login', async ({ page }) => {
  await page.route('**/api/v1/me', (route) => route.abort('failed'))

  // Corta la navegación justo al salir de la SPA -- este entorno puede
  // tener un backend/Keycloak real corriendo detrás (vite preview también
  // respeta `server.proxy`, hallazgo real), y sin este intercept la cadena
  // de redirects real seguiría hasta Keycloak antes de que `waitForURL`
  // alcance a ver la URL intermedia.
  await page.route('**/oauth2/authorization/keycloak**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/plain', body: 'login stub' }),
  )

  await page.goto('/')

  await expect(page).toHaveURL(/\/oauth2\/authorization\/keycloak/, { timeout: 5000 })
  await expect(page.getByRole('navigation')).not.toBeVisible()
})

test('el tema oscuro se aplica y persiste tras recargar', async ({ page }) => {
  await mockSession(page)
  await page.goto('/')
  const toggle = page.getByRole('radio', { name: 'Oscuro' })
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

/**
 * Sprint 2, hallazgo en vivo contra el backend real: HOTLINE_OPERATOR abre
 * y lee sus propios casos pero `iam.access_policy` no tiene fila UPDATE
 * para ese rol -- cambiar estado o asignar es exclusivo de
 * INTELLIGENCE_ANALYST. Antes del fix, la vista de detalle mostraba ambos
 * formularios a cualquiera y el backend los rechazaba con 403 al enviar.
 */
test('detalle de caso: HOTLINE_OPERATOR no ve formularios de cambio de estado ni asignación', async ({ page }) => {
  await mockSession(page)
  await page.route('**/api/v1/case-files/GAULA-BOG-2026-000001', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        trackingNumber: 'GAULA-BOG-2026-000001',
        status: 'RECEIVED',
        priority: 'NORMAL',
        classificationLevel: 'PUBLIC',
        crimeTypeCode: 'EXTORTION',
        municipalityCode: '11001',
        summary: 'Caso de prueba.',
        involvesMinor: false,
      }),
    }),
  )

  await page.goto('/casos/GAULA-BOG-2026-000001')
  await expect(page.getByText('Caso de prueba.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Cambiar estado' })).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Asignar responsable' })).not.toBeVisible()
})

/**
 * S2.ADI.02/S2.FE.07, hallazgo en vivo: otro actor cambió el caso entre la
 * lectura y el PATCH -- el backend responde 409 OPTIMISTIC_LOCK_CONFLICT
 * con un mensaje que ya dice "recargue e intente de nuevo"
 * (messages_es.properties); el botón "Recargar caso" reemplaza al de
 * aplicar el cambio en vez de dejar que el usuario reintente ciegamente
 * con la misma versión, que volvería a fallar.
 */
test('detalle de caso: un 409 de versión concurrente muestra "Recargar caso" en vez de dejar reintentar a ciegas', async ({
  page,
}) => {
  const mockAnalystSession = {
    userId: '00000000-0000-0000-0000-000000000202',
    displayName: 'Sargento Cárdenas Marín',
    roles: ['INTELLIGENCE_ANALYST'],
    territorialUnitId: '00000000-0000-0000-0000-000000000001',
  }
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAnalystSession) }),
  )
  await page.route('**/api/v1/case-files/GAULA-BOG-2026-000001/status', (route) =>
    route.fulfill({
      status: 409,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        title: 'Modificacion concurrente',
        detail: 'Otro usuario modifico este registro mientras usted lo editaba. Recargue e intente de nuevo.',
        status: 409,
        code: 'OPTIMISTIC_LOCK_CONFLICT',
      }),
    }),
  )
  await page.route('**/api/v1/case-files/GAULA-BOG-2026-000001', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        trackingNumber: 'GAULA-BOG-2026-000001',
        status: 'RECEIVED',
        priority: 'NORMAL',
        classificationLevel: 'PUBLIC',
        crimeTypeCode: 'EXTORTION',
        municipalityCode: '11001',
        summary: 'Caso de prueba.',
        involvesMinor: false,
        version: 0,
      }),
    }),
  )

  await page.goto('/casos/GAULA-BOG-2026-000001')
  await page.getByRole('combobox').selectOption('UNDER_VERIFICATION')
  await page.getByPlaceholder('Motivo').fill('Verificación inicial')
  await page.getByRole('button', { name: 'Aplicar cambio' }).click()

  await expect(page.getByText(/recargue e intente de nuevo/i)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Recargar caso' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aplicar cambio' })).not.toBeVisible()
})
