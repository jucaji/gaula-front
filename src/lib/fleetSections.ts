import { can } from '@/lib/permissions'
import type { RoleCode } from '@/lib/auth/roles'

/**
 * Las secciones de Flota.
 *
 * <p>Son dos pantallas del mismo módulo y deben leerse así: el inventario
 * —quién tiene qué vehículo, combustible, mantenimiento— y el comando —dónde
 * están—. Tenerlas como dos entradas de primer nivel las hacía parecer módulos
 * distintos.
 *
 * <p><strong>Pero no comparten permiso, y eso no es un detalle.</strong>
 * `ADMIN_STAFF` administra la flota y NO ve la operación (docs/04 §2.4); un
 * analista ve dónde están los vehículos y no gestiona el inventario. Cada
 * pestaña se muestra sólo si el rol la alcanza, así que la mayoría de los
 * usuarios verá una sola. Ofrecer una pestaña que el backend va a denegar sería
 * peor que no ofrecerla.
 */
export const FLEET_SECTIONS = [
  { to: '/recursos/flota', label: 'Inventario', resource: 'FLEET' },
  { to: '/flota', label: 'Comando', resource: 'VEHICLE_TELEMETRY' },
] as const

/** La primera sección que este rol alcanza, o `null` si no alcanza ninguna. */
export function firstFleetSectionFor(roles: RoleCode[]): string | null {
  return FLEET_SECTIONS.find((s) => can('READ', s.resource, roles))?.to ?? null
}

