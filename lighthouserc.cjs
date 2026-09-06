// S0.FE.09 / docs/07 §7: Lighthouse en el pipeline, con presupuesto de
// rendimiento y accesibilidad. Corre contra el build de producción servido
// por `vite preview` (mismo servidor que usa playwright.config.ts).
module.exports = {
  ci: {
    collect: {
      startServerCommand: 'pnpm exec vite preview --port 5184 --strictPort',
      startServerReadyPattern: 'Local:',
      startServerReadyTimeout: 30_000,
      url: ['http://localhost:5184/', 'http://localhost:5184/casos'],
      numberOfRuns: 1,
      settings: {
        // Entorno de desarrollo sin red real ni CPU dedicada -- desactiva la
        // simulación de red/CPU lenta para que el número sea comparable
        // entre corridas locales; el pipeline real de CI usa el perfil por
        // defecto de Lighthouse.
        throttlingMethod: 'provided',
      },
    },
    assert: {
      assertions: {
        'categories:performance': ['warn', { minScore: 0.8 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['warn', { minScore: 0.9 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: '.lighthouseci',
    },
  },
}
