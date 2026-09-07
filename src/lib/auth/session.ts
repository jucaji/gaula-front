import { customFetch } from '@/api/client'
import type { RoleCode } from './roles'

export interface Session {
  userId: string
  displayName: string
  roles: RoleCode[]
  territorialUnitId: string
  operationalUnitId?: string
}

/**
 * `GET /api/v1/me` (backend, iam módulo): la sesión OIDC ya resuelta a
 * `iam.app_user`. Sin sesión válida, Spring Security redirige a Keycloak
 * (origen distinto, puerto 8081) -- ese redirect cross-origin lo bloquea
 * CORS y `fetch` lo ve como `TypeError: Failed to fetch`, nunca como un
 * 401 limpio. `useSessionQuery` en useSession.ts trata cualquier fallo
 * aquí como "no autenticado" y manda a `redirectToLogin`.
 */
export async function fetchSession(): Promise<Session> {
  return customFetch<Session>('/api/v1/me')
}

/** Navegación de página completa -- el flujo OAuth2 necesita salir de la SPA, nunca un fetch. */
export function redirectToLogin(): void {
  window.location.href = '/oauth2/authorization/keycloak'
}
