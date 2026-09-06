import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// S0.FE.09: smoke E2E + escaneo de accesibilidad. Corre sin backend real --
// la sesión está mockeada (docs/07, mientras no exista /api/v1/me) -- así
// que sólo valida que la app carga, navega y no introduce violaciones de
// accesibilidad nuevas. No sustituye a los E2E de negocio de cada sprint
// (esos necesitan el backend real levantado).
test('la página de inicio carga sin violaciones de accesibilidad', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('navigation')).toBeVisible()

  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})

test('/casos respeta el permiso de lectura y muestra un estado -- nunca pantalla en blanco', async ({ page }) => {
  await page.goto('/casos')
  await expect(page.getByRole('heading', { name: 'Casos' })).toBeVisible()

  // Sin backend real disponible en este entorno, el fetch falla de forma
  // determinista -- lo que importa es que SIEMPRE se pinte un estado
  // (nunca el "fetchStatus: paused" que motivó el hallazgo de retry:false).
  await expect(page.getByText(/No se pudo cargar|Failed to fetch/)).toBeVisible()
})

test('el tema oscuro se aplica y persiste tras recargar', async ({ page }) => {
  await page.goto('/')
  const toggle = page.getByRole('radio', { name: 'Oscuro' })
  await toggle.click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
