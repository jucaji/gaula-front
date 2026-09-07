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
 * una política puntual). Placeholder permisivo por rol para los recursos
 * que aún no se verificaron acción por acción.
 */
type ResourcePolicy = RoleCode[] | Partial<Record<PermissionAction, RoleCode[]>>

/**
 * CASE_FILE sí se verificó contra las filas reales sembradas en
 * `iam.access_policy` (Sprint 2, hallazgo en vivo): HOTLINE_OPERATOR abre y
 * lee sus propios casos pero NO tiene fila UPDATE -- cambiar estado o
 * asignar responsable es hoy exclusivo de INTELLIGENCE_ANALYST. SYSTEM_ADMIN
 * queda fuera a propósito (docs/04 §3: "gestiona la matriz pero no ve
 * contenido de casos" -- no tiene ninguna fila CASE_FILE).
 */
const RESOURCE_ROLES: Record<string, ResourcePolicy> = {
  CASE_FILE: {
    CREATE: ['HOTLINE_OPERATOR'],
    READ: ['HOTLINE_OPERATOR', 'INTELLIGENCE_ANALYST', 'FIELD_OFFICER', 'UNIT_COMMANDER'],
    UPDATE: ['INTELLIGENCE_ANALYST'],
    // S3.APP.05, V20: mismos alcances que cada rol ya tiene para las demás
    // acciones -- FIELD_OFFICER queda fuera, sólo tiene READ:ASSIGNED.
    EXPORT: ['HOTLINE_OPERATOR', 'INTELLIGENCE_ANALYST', 'UNIT_COMMANDER'],
  },
  CALL: ['HOTLINE_OPERATOR', 'SYSTEM_ADMIN'],
  // S6.FE.*: verificado contra el `ReportController` real -- `create`/`update`
  // (borrador) sólo exigen `isAuthenticated()`, cualquiera de estos 4 roles
  // puede capturar y editar su propio borrador. `validate`/`reject` sí
  // llevan `@PreAuthorize("hasRole('UNIT_COMMANDER')")` explícito en el
  // backend -- de ahí el recurso aparte OPERATIONAL_REPORT_REVIEW en vez de
  // forzarlo dentro de UPDATE.
  OPERATIONAL_REPORT: ['HOTLINE_OPERATOR', 'INTELLIGENCE_ANALYST', 'UNIT_COMMANDER', 'SYSTEM_ADMIN'],
  OPERATIONAL_REPORT_REVIEW: ['UNIT_COMMANDER'],
  ANALYTICS: ['INTELLIGENCE_ANALYST', 'UNIT_COMMANDER', 'PREVENTION_STAFF', 'SYSTEM_ADMIN'],
  FLEET: ['ADMIN_STAFF', 'SYSTEM_ADMIN'],
  ADMIN: ['SYSTEM_ADMIN'],
}

export function can(action: PermissionAction, resource: string, roles: RoleCode[]): boolean {
  const policy = RESOURCE_ROLES[resource]
  if (!policy) return false
  const allowed = Array.isArray(policy) ? policy : policy[action]
  if (!allowed) return false
  return roles.some((role) => allowed.includes(role))
}
