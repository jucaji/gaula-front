import { createRouter } from '@tanstack/react-router'
import { routeTree } from '../routeTree.gen'
import type { RouterContext } from './router-context'

// El contexto real (queryClient, session, can) se inyecta en <RouterProvider context={...}> (App.tsx) --
// aquí sólo se declara la forma, como pide la documentación de TanStack Router para tipar `beforeLoad`.
export const router = createRouter({
  routeTree,
  context: undefined as unknown as RouterContext,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
