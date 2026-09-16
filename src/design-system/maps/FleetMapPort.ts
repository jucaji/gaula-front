import type { FleetPosition, MovementState } from '@/lib/telemetry/types'

/**
 * El contrato entre la consola de flota y el mapa que la dibuja.
 *
 * SPEC-0506 y requisito explícito del cliente: **debe ser posible cambiar el
 * proveedor cartográfico sin tocar el dominio de flota**. Por eso lo que cruza
 * esta frontera son `FleetPosition` y `TripPath` -- vocabulario nuestro -- y
 * nunca un `google.maps.LatLng` ni un `maplibregl.Map`.
 *
 * Hoy hay un solo adaptador (Google Maps, decisión del cliente registrada en el
 * spec como excepción a R1). El puerto no existe para tener dos: existe para
 * que el día que haya que volver a un mapa local -- porque la sede resulte no
 * tener internet -- eso sea escribir un adaptador y no reescribir la pantalla.
 */
export interface FleetMapProps {
  positions: FleetPosition[]
  selectedVehicleId: string | null
  onSelect: (vehicleId: string | null) => void
  /** Recorrido a dibujar sobre el mapa, si el operador abrió uno. */
  trip?: TripPath | null
  /**
   * SPEC-0513: dónde va la reproducción del recorrido. Es un marcador aparte
   * del de la posición actual: uno dice dónde está el vehículo AHORA y el otro
   * dónde estaba en el instante que se está reproduciendo.
   */
  playhead?: { latitude: number; longitude: number } | null
  /** Etiqueta legible por vehículo, para el globo de información. */
  labelFor?: (vehicleId: string) => string
}

export interface TripPath {
  points: Array<{ latitude: number; longitude: number }>
  startLabel: string
  endLabel: string | null
}

/**
 * SPEC-0513: cada cuánto late el halo de un vehículo, en milisegundos.
 *
 * <p>Sólo late lo que está reportando: en movimiento late rápido, detenido
 * lento, y lo que no reporta NO late. Un halo latiendo sobre un vehículo sin
 * señal diría justo lo contrario de lo que pasa.
 *
 * <p>El latido se SUMA a la forma y al color; nunca los reemplaza (docs/06 §4.4).
 */
export const PULSE_PERIOD_MS: Record<MovementState, number | null> = {
  MOVING: 1200,
  STOPPED: 2400,
  NO_SIGNAL: null,
  NEVER_REPORTED: null,
  UNDETERMINED: null,
}

/** Quien pidió menos movimiento en su sistema recibe el mismo mapa, sin latido. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Los cinco estados que el mapa tiene que poder distinguir A SIMPLE VISTA.
 *
 * No es sólo color: docs/06 §4.4 prohíbe comunicar estado sólo con color, y
 * aquí además el lector puede ser daltónico y estar decidiendo a qué vehículo
 * mandar. Cada estado lleva forma propia además de tono, y `NEVER_REPORTED` se
 * ve distinto de `NO_SIGNAL` porque son cosas distintas (CA-2): ante uno se
 * manda a alguien a revisar, ante el otro se pide instalar el equipo.
 */
export const MOVEMENT_STYLE: Record<MovementState, {
  label: string
  /** Color del relleno. Literal y no token CSS: ningún SDK de mapas parsea `oklch()`. */
  fill: string
  /** Cómo se dibuja: cada estado tiene una forma, no sólo un tono. */
  shape: 'arrow' | 'dot' | 'hollow' | 'cross' | 'question'
  description: string
}> = {
  MOVING: {
    label: 'En movimiento',
    fill: '#16a34a',
    shape: 'arrow',
    description: 'Reportando y por encima del umbral de movimiento.',
  },
  STOPPED: {
    label: 'Detenido',
    fill: '#2563eb',
    shape: 'dot',
    description: 'Reportando, sin desplazamiento significativo.',
  },
  NO_SIGNAL: {
    label: 'Sin señal',
    fill: '#d97706',
    shape: 'hollow',
    description: 'Reportaba y dejó de hacerlo. La última posición conocida está añeja.',
  },
  NEVER_REPORTED: {
    label: 'Nunca reportó',
    fill: '#64748b',
    shape: 'cross',
    description: 'Sin equipo GPS instalado, o instalado y sin una primera posición.',
  },
  UNDETERMINED: {
    label: 'Sin determinar',
    fill: '#7c3aed',
    shape: 'question',
    description: 'Hay posición reciente, pero el proveedor no entrega con qué decidir si se mueve.',
  },
}
