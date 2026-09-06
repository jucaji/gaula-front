import type { QueryClient } from '@tanstack/react-query'
import type { Session } from '@/lib/auth/session'
import type { PermissionAction } from '@/lib/permissions'

/**
 * docs/07 §2: "Guardas en beforeLoad, no dentro del componente" -- para eso
 * cada ruta necesita, en su contexto, la sesión y la función `can` ya
 * resueltas, no un hook de React (que sólo se puede llamar dentro de un
 * componente).
 */
export interface RouterContext {
  queryClient: QueryClient
  session: Session
  can: (action: PermissionAction, resource: string) => boolean
}
