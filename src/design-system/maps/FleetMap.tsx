import { MapPinOff } from 'lucide-react'
import { GoogleFleetMap } from './GoogleFleetMap'
import { MapLibreFleetMap } from './MapLibreFleetMap'
import type { FleetMapProps } from './FleetMapPort'
import { useMapConfig } from '@/lib/telemetry/useMapConfig'
import { Spinner } from '@/design-system/primitives/Spinner'

/**
 * El conmutador de proveedor cartográfico.
 *
 * <p>La pantalla usa ESTO y nunca un adaptador concreto, así que cambiar de
 * proveedor es cambiar una propiedad del despliegue — `gaula.map.provider` — y
 * no tocar una línea de la consola ni del dominio de flota.
 *
 * <p>Añadir Mapbox, HERE o Azure Maps es escribir un componente hermano que
 * reciba {@link FleetMapProps} y añadir una entrada a esta tabla. Lo que cruza
 * la frontera son `FleetPosition` y `TripPath` — vocabulario nuestro — nunca un
 * `google.maps.LatLng` ni un `maplibregl.Map`.
 *
 * <p>Un proveedor desconocido NO cae en silencio a otro: lo dice. Caer a un
 * default haría que un error de configuración se viera como si funcionara.
 */
const ADAPTADORES: Record<string, (props: FleetMapProps) => React.ReactElement> = {
  GOOGLE: GoogleFleetMap,
  MAPLIBRE: MapLibreFleetMap,
}

export function FleetMap(props: FleetMapProps) {
  const config = useMapConfig()

  if (config.isLoading) {
    return (
      <Marco>
        <Spinner size={20} label="Cargando la configuración del mapa" />
        <p className="text-sm text-text-secondary">Cargando la configuración del mapa…</p>
      </Marco>
    )
  }

  const proveedor = config.data?.provider ?? 'GOOGLE'
  const Adaptador = ADAPTADORES[proveedor]

  if (!Adaptador) {
    return (
      <Marco>
        <p className="text-sm font-medium text-text-primary">
          Proveedor de mapa no reconocido: <code className="font-mono">{proveedor}</code>
        </p>
        <p className="max-w-md text-xs text-text-secondary">
          Revise <code className="font-mono">gaula.map.provider</code>. Los valores admitidos son{' '}
          {Object.keys(ADAPTADORES).join(' y ')}. La flota se puede consultar igual en la lista.
        </p>
      </Marco>
    )
  }

  return <Adaptador {...props} />
}

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-sunken p-6 text-center">
      <MapPinOff size={28} className="text-text-muted" aria-hidden="true" />
      {children}
    </div>
  )
}
