import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'
import { configDefaults } from 'vitest/config'

// docs/01 §4: SPA compilada a estáticos, servidos por nginx en la sede —
// nunca un proceso Node en producción. El proxy de abajo sólo existe para
// `pnpm dev`; en producción nginx enruta /api al backend real (docs/08 §1).
export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // 5173 (el default de Vite, y el que docs/06/08 asumen para CORS local)
    // está ocupado en esta máquina por OTRO proyecto ajeno (VNA-ui) -- se
    // usa 5183 aquí y se ajusta `gaula.cors.allowed-origin` en
    // application-local.yml para que coincida, en vez de tocar ese proceso.
    port: 5183,
    strictPort: true,
    // Hallazgo real: el repo vive en un volumen externo (/Volumes/...) --
    // los eventos nativos de fsevents no siempre llegan desde ahí, así que
    // el HMR se queda sirviendo una versión vieja del archivo en silencio
    // (sin error, sin log) hasta el próximo cambio que sí dispare un evento.
    // `usePolling` cambia a sondeo activo, más lento pero confiable aquí.
    watch: {
      usePolling: true,
      interval: 300,
    },
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/oauth2': { target: 'http://localhost:8080', changeOrigin: true },
      '/login': { target: 'http://localhost:8080', changeOrigin: true },
      '/logout': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
  build: {
    // docs/07 §7: bundle inicial < 180 KB comprimido -- el CI real falla el
    // build si crece > 10 %; aquí sólo se deja el warning visible temprano.
    // El presupuesto real se hace cumplir con `pnpm check:bundle-budget`
    // (scripts/check-bundle-budget.mjs), sobre el tamaño gzip -- este límite
    // de Vite mide bytes crudos, sólo sirve de aviso temprano en consola.
    chunkSizeWarningLimit: 200,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    // e2e/ son specs de Playwright (su propio `test`, ver playwright.config.ts)
    // -- Vitest no debe intentar correrlas como si fueran unitarias.
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
})
