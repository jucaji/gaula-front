import { useEffect, useRef, useState } from 'react'
import { MapPinOff } from 'lucide-react'
import { MOVEMENT_STYLE, type FleetMapProps } from './FleetMapPort'
import { loadGoogleMaps } from './googleMapsLoader'
import { useMapConfig } from '@/lib/telemetry/useMapConfig'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'

/**
 * El adaptador cartográfico de la consola de flota (SPEC-0506).
 *
 * Lo que entra por props es vocabulario nuestro -- `FleetPosition`, `TripPath`
 * -- y lo que sale son identificadores de vehículo. Ningún tipo del SDK cruza
 * esta frontera, que es lo que permite cambiar de proveedor sin tocar la
 * pantalla.
 *
 * <p>Colores literales y no tokens CSS: ningún SDK de mapas parsea `oklch()`,
 * hallazgo ya pagado con MapLibre en el Sprint 7.
 */
export function GoogleFleetMap({
  positions,
  selectedVehicleId,
  onSelect,
  trip,
  labelFor,
}: FleetMapProps) {
  const config = useMapConfig()
  // El mapa resuelve su propio tema, igual que el del observatorio: pasarlo por
  // prop obligaría a cada pantalla que lo use a acordarse de hacerlo.
  const theme = useResolvedTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map())
  const tripLineRef = useRef<google.maps.Polyline | null>(null)
  const infoRef = useRef<google.maps.InfoWindow | null>(null)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Callbacks en refs: los manejadores del SDK se registran UNA vez y no
  // pueden capturar una versión vieja de `onSelect`. Es el mismo patrón que
  // resolvió las carreras de ciclo de vida en el mapa del observatorio.
  const onSelectRef = useRef(onSelect)
  const labelForRef = useRef(labelFor)
  useEffect(() => {
    onSelectRef.current = onSelect
    labelForRef.current = labelFor
  }, [onSelect, labelFor])

  useEffect(() => {
    if (!config.data?.configured || !config.data.apiKey || !containerRef.current) return

    let cancelled = false
    // Se captura el registro de marcadores AQUÍ, no en la limpieza: para
    // entonces el ref podría apuntar a otro objeto y se quedarían marcadores
    // huérfanos sobre un mapa ya destruido.
    const markers = markersRef.current
    loadGoogleMaps(config.data.apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return
        mapRef.current = new google.maps.Map(containerRef.current, {
          center: { lat: 4.6512, lng: -74.0721 },
          zoom: 11,
          mapId: config.data?.mapId ?? null,
          // Sin controles de más: es una consola de operación, no un mapa de
          // turismo. Street View y el selector de tipo de mapa sólo estorban.
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          clickableIcons: false,
          colorScheme: theme === 'dark' ? 'DARK' : 'LIGHT',
        })
        infoRef.current = new google.maps.InfoWindow()
        // Clic en el mapa vacío = deseleccionar. Sin esto no hay forma de
        // volver a "toda la flota" salvo recargando.
        mapRef.current.addListener('click', () => onSelectRef.current(null))
        setReady(true)
      })
      .catch((error: unknown) => {
        if (!cancelled) setSdkError(error instanceof Error ? error.message : 'No se pudo cargar el mapa')
      })

    return () => {
      cancelled = true
      markers.forEach((marker) => marker.setMap(null))
      markers.clear()
      tripLineRef.current?.setMap(null)
      mapRef.current = null
      setReady(false)
    }
  }, [config.data?.configured, config.data?.apiKey, config.data?.mapId, theme])

  // Marcadores. Se reutilizan por vehículo en vez de recrearlos: con
  // actualizaciones cada diez segundos, tirar y volver a crear mil marcadores
  // haría parpadear el mapa entero y perdería el globo abierto.
  useEffect(() => {
    if (!ready || !mapRef.current) return
    const map = mapRef.current
    const seen = new Set<string>()

    positions.forEach((position) => {
      if (position.latitude === null || position.longitude === null) return
      seen.add(position.vehicleId)
      const style = MOVEMENT_STYLE[position.state]
      const existing = markersRef.current.get(position.vehicleId)
      const position2 = { lat: position.latitude, lng: position.longitude }

      if (existing) {
        existing.setPosition(position2)
        existing.setIcon(iconFor(position.state, position.vehicleId === selectedVehicleId))
        existing.setZIndex(position.vehicleId === selectedVehicleId ? 1000 : undefined)
        return
      }

      const marker = new google.maps.Marker({
        map,
        position: position2,
        icon: iconFor(position.state, position.vehicleId === selectedVehicleId),
        title: `${labelForRef.current?.(position.vehicleId) ?? position.vehicleId} — ${style.label}`,
      })
      marker.addListener('click', () => onSelectRef.current(position.vehicleId))
      markersRef.current.set(position.vehicleId, marker)
    })

    // Un vehículo que sale del filtro tiene que salir del mapa.
    markersRef.current.forEach((marker, vehicleId) => {
      if (!seen.has(vehicleId)) {
        marker.setMap(null)
        markersRef.current.delete(vehicleId)
      }
    })
  }, [positions, selectedVehicleId, ready])

  // Centrar en el vehículo seleccionado, sin cambiar el zoom: quitarle el nivel
  // de acercamiento al operador cada vez que toca una fila es desorientador.
  useEffect(() => {
    if (!ready || !mapRef.current || !selectedVehicleId) return
    const selected = positions.find((position) => position.vehicleId === selectedVehicleId)
    if (selected?.latitude != null && selected.longitude != null) {
      mapRef.current.panTo({ lat: selected.latitude, lng: selected.longitude })
    }
  }, [selectedVehicleId, positions, ready])

  // El recorrido histórico.
  useEffect(() => {
    if (!ready || !mapRef.current) return
    tripLineRef.current?.setMap(null)
    if (!trip || trip.points.length < 2) return

    tripLineRef.current = new google.maps.Polyline({
      map: mapRef.current,
      path: trip.points.map((point) => ({ lat: point.latitude, lng: point.longitude })),
      strokeColor: '#2563eb',
      strokeOpacity: 0.9,
      strokeWeight: 4,
    })

    const bounds = new google.maps.LatLngBounds()
    trip.points.forEach((point) => bounds.extend({ lat: point.latitude, lng: point.longitude }))
    mapRef.current.fitBounds(bounds, 48)
  }, [trip, ready])

  if (config.isLoading) {
    return <MapPlaceholder message="Cargando la configuración del mapa…" />
  }

  if (!config.data?.configured) {
    return (
      <MapPlaceholder
        message="El mapa no está configurado en este despliegue."
        detail="La flota se puede consultar igual en la lista, con sus coordenadas. Un despliegue sin salida a internet no puede cargar el mapa de Google."
      />
    )
  }

  if (sdkError) {
    return <MapPlaceholder message="No se pudo cargar el mapa." detail={sdkError} />
  }

  return <div ref={containerRef} className="h-full w-full" role="application" aria-label="Mapa de la flota" />
}

/**
 * Un icono por estado, con FORMA propia y no sólo color (docs/06 §4.4).
 *
 * Se dibuja como SVG en línea y no como imagen: son cinco formas simples, y una
 * petición de red por icono en un mapa con mil marcadores sería absurda.
 */
function iconFor(state: keyof typeof MOVEMENT_STYLE, selected: boolean): google.maps.Symbol {
  const style = MOVEMENT_STYLE[state]
  const scale = selected ? 9 : 6

  const paths: Record<typeof style.shape, google.maps.SymbolPath | string> = {
    arrow: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
    dot: google.maps.SymbolPath.CIRCLE,
    hollow: google.maps.SymbolPath.CIRCLE,
    // Una cruz para "nunca reportó": la única forma que no es un círculo ni una
    // flecha, para que se distinga del resto sin mirar el color.
    cross: 'M -1,-1 1,1 M 1,-1 -1,1',
    question: google.maps.SymbolPath.CIRCLE,
  }

  return {
    path: paths[style.shape],
    scale,
    fillColor: style.shape === 'hollow' ? '#ffffff' : style.fill,
    fillOpacity: style.shape === 'cross' ? 0 : 1,
    strokeColor: style.fill,
    strokeWeight: selected ? 3 : 2,
  }
}

function MapPlaceholder({ message, detail }: { message: string; detail?: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-sunken p-6 text-center">
      <MapPinOff size={28} className="text-text-muted" aria-hidden="true" />
      <p className="text-sm font-medium text-text-primary">{message}</p>
      {detail && <p className="max-w-md text-xs text-text-secondary">{detail}</p>}
    </div>
  )
}
