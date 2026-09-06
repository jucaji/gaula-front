import type { RoleCode } from './auth/roles'

export type PermissionAction = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT'

/**
 * docs/07 §2: "espejo del backend" -- guarda de UX, nunca la autoridad
 * real (eso ya lo hace `@PreAuthorize` en cada controlador del backend,
 * SPEC-0502). Ocultar un botón que el backend igual rechazaría es cosmético
 * si esta tabla queda desactualizada; el peor caso es un `403` real, nunca
 * una fuga.
 *
 * INSUMO PENDIENTE: la matriz real vive en `iam.access_policy`, editable en
 * `/admin/roles` (SPEC-0502) -- no hay todavía un endpoint que la sirva
 * completa para el frontend (`IamController` sólo expone el HISTORIAL de
 * una política puntual). Mientras tanto, placeholder permisivo por rol.
 */
const RESOURCE_ROLES: Record<string, RoleCode[]> = {
  CASE_FILE: ['HOTLINE_OPERATOR', 'INTELLIGENCE_ANALYST', 'FIELD_OFFICER', 'UNIT_COMMANDER', 'SYSTEM_ADMIN'],
  CALL: ['HOTLINE_OPERATOR', 'SYSTEM_ADMIN'],
  OPERATIONAL_REPORT: ['HOTLINE_OPERATOR', 'INTELLIGENCE_ANALYST', 'UNIT_COMMANDER', 'SYSTEM_ADMIN'],
  ANALYTICS: ['INTELLIGENCE_ANALYST', 'UNIT_COMMANDER', 'PREVENTION_STAFF', 'SYSTEM_ADMIN'],
  FLEET: ['ADMIN_STAFF', 'SYSTEM_ADMIN'],
  ADMIN: ['SYSTEM_ADMIN'],
}

export function can(_action: PermissionAction, resource: string, roles: RoleCode[]): boolean {
  const allowed = RESOURCE_ROLES[resource]
  if (!allowed) return false
  return roles.some((role) => allowed.includes(role))
}
