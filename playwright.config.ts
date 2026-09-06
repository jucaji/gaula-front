import { defineConfig, devices } from '@playwright/test'

// S0.FE.09: Playwright + axe-core en el pipeline. Corre contra el build de
// producción (vite preview), no contra `dev`, para no mezclar el HMR con
// las métricas de rendimiento que Lighthouse audita por separado.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5184',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 5184 --strictPort',
    url: 'http://localhost:5184',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
})
