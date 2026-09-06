import { defineConfig } from 'orval'

/**
 * S0.FE.05: contra `contracts/openapi.json` (artefacto versionado, docs/01
 * §7) -- nunca contra el backend en vivo directamente, para que el
 * contrato quede fijado y revisable en el mismo commit que lo usa.
 */
export default defineConfig({
  gaula: {
    input: '../contracts/openapi.json',
    output: {
      mode: 'tags-split',
      target: 'src/api/generated',
      schemas: 'src/api/generated/models',
      client: 'react-query',
      httpClient: 'fetch',
      mock: false,
      override: {
        mutator: {
          path: 'src/api/client.ts',
          name: 'customFetch',
        },
        query: {
          useQuery: true,
          useMutation: true,
          signal: false,
        },
      },
    },
  },
})
