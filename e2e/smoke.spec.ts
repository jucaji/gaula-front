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

test('cerrar sesión es un formulario POST hacia /logout, no un fetch', async ({ page }) => {
  await mockSession(page)
  await page.context().addCookies([{ name: 'XSRF-TOKEN', value: 'token-de-prueba', url: 'http://localhost' }])

  await page.goto('/')

  const boton = page.getByRole('button', { name: 'Cerrar sesión' })
  await expect(boton).toBeVisible()

  // Lo que se prueba NO es que exista el botón: es CÓMO envía.
  // `POST /logout` responde con una redirección al `end_session_endpoint` de
  // Keycloak que el navegador tiene que seguir. Hecho con `fetch`, la respuesta
  // llega como `opaqueredirect`, el navegador no la sigue, y queda un logout a
  // medias: sesión local muerta y sesión de Keycloak VIVA -- el siguiente login
  // entraría sin pedir credenciales (docs/04 §2.5).
  const formulario = page.locator('form[action="/logout"]')
  await expect(formulario).toHaveAttribute('method', 'post')

  // El `_csrf` se rellena AL ENVIAR, no al pintar: Spring emite la cookie
  // `XSRF-TOKEN` en su primera respuesta y el encabezado se pinta antes de que
  // llegue. Leerla durante el render dejaba el campo vacío y el logout habría
  // fallado con 403 -- un botón visible que no cierra la sesión es peor que no
  // tener botón. Se comprueba el valor DESPUÉS del envío.
  await expect(formulario.locator('input[name="_csrf"]')).toHaveValue('')
  await formulario.dispatchEvent('submit')
  await expect(formulario.locator('input[name="_csrf"]')).toHaveValue('token-de-prueba')
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

/**
 * DoD del Sprint 3: "ningún camino permite exportar un caso con menor
 * involucrado". El backend rechaza con 403 MINOR_PROTECTED_EXPORT_DENIED
 * (SPEC-0208) -- este test verifica que el frontend traduce ese código a un
 * mensaje explícito, no al genérico "Ocurrió un error inesperado".
 */
test('exportar PDF de un caso con menor involucrado muestra el bloqueo explícito, no un error genérico', async ({
  page,
}) => {
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
        involvesMinor: true,
        version: 0,
      }),
    }),
  )
  await page.route('**/api/v1/case-files/GAULA-BOG-2026-000001/export.pdf', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        title: 'Acceso denegado',
        detail: 'Este caso involucra un menor de edad.',
        status: 403,
        code: 'MINOR_PROTECTED_EXPORT_DENIED',
      }),
    }),
  )

  await page.goto('/casos/GAULA-BOG-2026-000001')
  await page.getByRole('button', { name: 'Exportar PDF' }).click()

  await expect(page.getByText(/involucra un menor de edad/i)).toBeVisible()
  await expect(page.getByText('Ocurrió un error inesperado')).not.toBeVisible()
})

/**
 * S4.FE.02: docs/06 §8.1 exige que el registro de la llamada arranque solo
 * -- ningún botón "iniciar llamada" existe en el wireframe. Este test
 * verifica que `POST /api/v1/calls` se dispare con sólo cargar la página.
 */
test('/recepcion arranca el registro de la llamada sola, sin botón "iniciar"', async ({ page }) => {
  await mockSession(page)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  let openCallCalls = 0
  await page.route('**/api/v1/calls', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    openCallCalls += 1
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '11111111-1111-1111-1111-111111111111',
        sequenceNumber: 42,
        startedAt: new Date().toISOString(),
        status: 'IN_PROGRESS',
      }),
    })
  })

  await page.goto('/recepcion')

  await expect(page.getByText(/GRABANDO/)).toBeVisible()
  await expect(page.getByText('Llamada #42 · Línea 147')).toBeVisible()
  expect(openCallCalls).toBe(1)
  await expect(page.getByRole('button', { name: /iniciar/i })).toHaveCount(0)
})

/**
 * SPEC-0104 (reingreso): un denunciante que ya llamó antes debe verse
 * reflejado apenas el operador termina de escribir el teléfono -- sin que
 * exista (ni haga falta) un botón "buscar" separado.
 */
test('/recepcion muestra "Contacto previo" al perder el foco del teléfono, sin botón de búsqueda', async ({ page }) => {
  await mockSession(page)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/v1/calls', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '11111111-1111-1111-1111-111111111111',
        sequenceNumber: 42,
        startedAt: new Date().toISOString(),
        status: 'IN_PROGRESS',
      }),
    })
  })
  await page.route('**/api/v1/reporters/lookup**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        reporterId: '22222222-2222-2222-2222-222222222222',
        contactCount: 3,
        previousCalls: [{ startedAt: '2026-01-15T10:00:00Z', jurisdiction: 'GAULA' }],
      }),
    }),
  )

  await page.goto('/recepcion')
  await expect(page.getByText(/GRABANDO/)).toBeVisible()

  await expect(page.getByRole('button', { name: /buscar/i })).toHaveCount(0)
  await page.getByPlaceholder('Búsqueda automática').fill('3001234567')
  await page.getByPlaceholder('Búsqueda automática').blur()

  await expect(page.getByText('ⓘ Contacto previo')).toBeVisible()
  await expect(page.getByText('3 contacto(s) registrado(s)')).toBeVisible()
  await expect(page.getByRole('button', { name: /buscar/i })).toHaveCount(0)
})

/**
 * docs/06 §8.1: las dos únicas salidas de la llamada ("Derivar" y "Crear
 * caso") deben estar siempre visibles desde que arranca el registro --
 * nunca detrás de un menú o de un paso previo.
 */
test('/recepcion siempre muestra los dos botones de salida ("Derivar" y "Crear caso")', async ({ page }) => {
  await mockSession(page)
  await page.route('**/api/v1/catalog/crime-types', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) }),
  )
  await page.route('**/api/v1/calls', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: '11111111-1111-1111-1111-111111111111',
        sequenceNumber: 42,
        startedAt: new Date().toISOString(),
        status: 'IN_PROGRESS',
      }),
    })
  })

  await page.goto('/recepcion')

  await expect(page.getByRole('button', { name: 'Derivar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Crear caso' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sin acción' })).toBeVisible()
})
