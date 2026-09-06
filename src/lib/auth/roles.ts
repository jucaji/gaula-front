/**
 * docs/03 §3 / docs/04: los siete roles del sistema. Duplica el enum del
 * backend (`iam-controller`'s `roleCode`) porque TypeScript no puede
 * importar un enum Java -- Orval sólo genera el tipo cuando aparece en un
 * schema de respuesta, y éste sólo aparece hoy como parámetro de consulta.
 */
export type RoleCode =
  | 'HOTLINE_OPERATOR'
  | 'INTELLIGENCE_ANALYST'
  | 'FIELD_OFFICER'
  | 'ADMIN_STAFF'
  | 'PREVENTION_STAFF'
  | 'UNIT_COMMANDER'
  | 'SYSTEM_ADMIN'
