import type { RoleCode } from './roles'

export interface Session {
  userId: string
  displayName: string
  roles: RoleCode[]
  territorialUnitId: string | null
}

/**
 * INSUMO PENDIENTE (2026-09-06): el backend no expone todavía un endpoint
 * `GET /api/v1/me` (ni equivalente) que devuelva la sesión OIDC resuelta a
 * `iam.app_user` -- `IamController` sólo tiene hoy administración de
 * política de acceso, nada de "quién soy". Mientras ese insumo llega, la
 * sesión se simula aquí con un usuario fijo. Cuando el endpoint real
 * exista, esta función es el ÚNICO lugar que cambia: todo lo demás
 * (guardas de ruta, `usePermissions`, la cabecera) consume `useSession()`,
 * nunca este mock directamente.
 */
const MOCK_SESSION: Session = {
  userId: '00000000-0000-0000-0000-000000000001',
  displayName: 'Operador de prueba',
  roles: ['HOTLINE_OPERATOR', 'SYSTEM_ADMIN'],
  territorialUnitId: null,
}

export function getMockSession(): Session {
  return MOCK_SESSION
}
