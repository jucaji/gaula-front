import { useEffect, useRef, useState } from 'react'
import { MapPinOff } from 'lucide-react'
import maplibregl from 'maplibre-gl'
import type { Feature, FeatureCollection, Point } from 'geojson'
import { MOVEMENT_STYLE, type FleetMapProps } from './FleetMapPort'
import {
  attributionFor,
  basemapStyle,
  checkBasemap,
  ensureMaplibreCss,
  ensurePmtilesProtocol,
} from './maplibreBasemap'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import type { FleetPosition, MovementState } from '@/lib/telemetry/types'

/**
 * El segundo adaptador cartográfico de la consola de flota.
 *
 * <p><strong>Existe para que el puerto sea un hecho y no una hipótesis.</strong>
 * Un `FleetMapPort` con un solo adaptador es una promesa que nadie ha
 * verificado; con dos, cambiar de proveedor es una propiedad de configuración
 * que se puede probar.
 *
 * <p>Y el segundo no se eligió al azar: MapLibre con teselas locales **no
 * necesita internet, ni clave, ni contrato con nadie**. Es el único que cumple
 * R1 sin excepciones, y el que queda disponible si la sede resulta ser un
 * despliegue aislado (docs/08 §5).
 *
 * <p>Recibe y devuelve exactamente lo mismo que el adaptador de Google:
 * `FleetPosition`, `TripPath` e identificadores de vehículo. Ningún tipo de
 * MapLibre cruza esta frontera.
 */
export function MapLibreFleetMap({
  positions,
  selectedVehicleId,
  onSelect,
  trip,
  labelFor,
}: FleetMapProps) {
  const theme = useResolvedTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const [conBasemap, setConBasemap] = useState<boolean | null>(null)
  const [webgl, setWebgl] = useState<boolean | null>(null)
  const [listo, setListo] = useState(false)

  // Los datos que llegaron ANTES de que el mapa terminara de cargar. Sin esto
  // se pierden en silencio: `map.on('load')` no vuelve a dispararse, y el
  // primer lote de posiciones suele llegar mientras el estilo aún se descarga.
  // Es el mismo defecto que ya costó tiempo en el mapa del observatorio.
  const pendientesRef = useRef<FleetPosition[] | null>(null)
  const onSelectRef = useRef(onSelect)
  const labelForRef = useRef(labelFor)
  useEffect(() => {
    onSelectRef.current = onSelect
    labelForRef.current = labelFor
  }, [onSelect, labelFor])

  // El mapa base y el soporte de WebGL se resuelven juntos, ANTES de intentar
  // crear el mapa. Preguntarlo antes en vez de capturar la excepción después no
  // es un detalle de estilo: MapLibre lanza si no hay WebGL, y descubrirlo
  // dentro del efecto obligaba a un `setState` síncrono que dispara renders en
  // cascada -- y que el linter marca con razón.
  useEffect(() => {
    void checkBasemap().then((basemap) => {
      setConBasemap(basemap)
      setWebgl(soportaWebgl())
    })
  }, [])

  useEffect(() => {
    if (!containerRef.current || conBasemap === null || !webgl) return
    ensureMaplibreCss()
    ensurePmtilesProtocol()

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(theme, conBasemap),
      center: [-74.0721, 4.6512],
      zoom: 10,
      attributionControl: attributionFor(conBasemap),
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 })

    map.on('load', () => {
      map.addSource('flota', { type: 'geojson', data: toGeoJson(pendientesRef.current ?? []) })
      map.addSource('recorrido', { type: 'geojson', data: emptyLine() })

      map.addLayer({
        id: 'recorrido',
        type: 'line',
        source: 'recorrido',
        paint: { 'line-color': '#2563eb', 'line-width': 4, 'line-opacity': 0.9 },
      })

      map.addLayer({
        id: 'vehiculos',
        type: 'circle',
        source: 'flota',
        paint: {
          // El color sale de la MISMA tabla que usa el adaptador de Google, así
          // que los dos mapas pintan el mismo estado del mismo color.
          'circle-color': colorPorEstado(),
          'circle-radius': ['case', ['get', 'seleccionado'], 11, 7],
          'circle-stroke-width': ['case', ['get', 'seleccionado'], 3, 2],
          'circle-stroke-color': '#ffffff',
          // «Sin señal» va hueco, como en el otro adaptador: la forma también
          // distingue, no sólo el tono (docs/06 §4.4).
          'circle-opacity': ['case', ['==', ['get', 'estado'], 'NO_SIGNAL'], 0.35, 1],
        },
      })

      map.on('click', 'vehiculos', (event) => {
        const id = event.features?.[0]?.properties?.vehicleId as string | undefined
        if (id) onSelectRef.current(id)
      })
      // Clic en el mapa vacío deselecciona: sin esto no hay forma de volver a
      // «toda la flota» salvo recargando.
      map.on('click', (event) => {
        const encima = map.queryRenderedFeatures(event.point, { layers: ['vehiculos'] })
        if (encima.length === 0) onSelectRef.current(null)
      })
      map.on('mouseenter', 'vehiculos', (event) => {
        map.getCanvas().style.cursor = 'pointer'
        const f = event.features?.[0]
        if (!f) return
        const [lon, lat] = (f.geometry as Point).coordinates
        if (lon === undefined || lat === undefined) return
        popupRef.current
          ?.setLngLat([lon, lat])
          .setHTML(
            `<strong>${escapar(String(f.properties?.etiqueta ?? ''))}</strong><br>` +
            `${escapar(MOVEMENT_STYLE[f.properties?.estado as MovementState]?.label ?? '')}`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'vehiculos', () => {
        map.getCanvas().style.cursor = ''
        popupRef.current?.remove()
      })

      setListo(true)
    })

    return () => {
      popupRef.current?.remove()
      map.remove()
      mapRef.current = null
      setListo(false)
    }
  }, [theme, conBasemap, webgl])

  // Posiciones.
  useEffect(() => {
    const conSeleccion = positions.map((p) => ({ ...p, seleccionado: p.vehicleId === selectedVehicleId }))
    pendientesRef.current = positions
    if (!listo) return
    const source = mapRef.current?.getSource('flota') as maplibregl.GeoJSONSource | undefined
    source?.setData(toGeoJson(conSeleccion, labelForRef.current))
  }, [positions, selectedVehicleId, listo])

  // Centrar en el seleccionado, sin cambiar el zoom.
  useEffect(() => {
    if (!listo || !selectedVehicleId) return
    const elegido = positions.find((p) => p.vehicleId === selectedVehicleId)
    if (elegido?.latitude != null && elegido.longitude != null) {
      mapRef.current?.easeTo({ center: [elegido.longitude, elegido.latitude] })
    }
  }, [selectedVehicleId, positions, listo])

  // El recorrido histórico.
  useEffect(() => {
    if (!listo) return
    const source = mapRef.current?.getSource('recorrido') as maplibregl.GeoJSONSource | undefined
    if (!trip || trip.points.length < 2) {
      source?.setData(emptyLine())
      return
    }
    const coordenadas = trip.points.map((p) => [p.longitude, p.latitude] as [number, number])
    source?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: coordenadas },
    })
    const bounds = coordenadas.reduce(
      (acc, c) => acc.extend(c),
      new maplibregl.LngLatBounds(coordenadas[0], coordenadas[0]),
    )
    mapRef.current?.fitBounds(bounds, { padding: 48 })
  }, [trip, listo])

  if (webgl === false) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-sunken p-6 text-center">
        <MapPinOff size={28} className="text-text-muted" aria-hidden="true" />
        <p className="text-sm font-medium text-text-primary">No se pudo dibujar el mapa.</p>
        <p className="max-w-md text-xs text-text-secondary">
          Este equipo no puede dibujar el mapa: MapLibre necesita WebGL, y aquí no está
          disponible. La flota se puede consultar igual en la lista, con sus coordenadas.
        </p>
      </div>
    )
  }

  return <div ref={containerRef} className="h-full w-full" role="application" aria-label="Mapa de la flota" />
}

/**
 * La expresión de color, construida desde `MOVEMENT_STYLE`.
 *
 * <p>Se deriva de la tabla en vez de repetir los literales para que los dos
 * adaptadores no puedan divergir: el día que alguien cambie el color de «sin
 * señal», cambia en los dos mapas.
 */
function colorPorEstado(): maplibregl.ExpressionSpecification {
  const casos = Object.entries(MOVEMENT_STYLE).flatMap(([estado, estilo]) => [
    ['==', ['get', 'estado'], estado] as unknown,
    estilo.fill,
  ])
  return ['case', ...casos, '#64748b'] as unknown as maplibregl.ExpressionSpecification
}

function toGeoJson(
  positions: Array<FleetPosition & { seleccionado?: boolean }>,
  labelFor?: (vehicleId: string) => string,
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: positions
      // Un vehículo que nunca reportó no tiene punto: no se inventa uno.
      .filter((p) => p.latitude !== null && p.longitude !== null)
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.longitude as number, p.latitude as number] },
        properties: {
          vehicleId: p.vehicleId,
          estado: p.state,
          seleccionado: Boolean(p.seleccionado),
          etiqueta: labelFor?.(p.vehicleId) ?? p.plate ?? p.vehicleId.slice(0, 8),
        },
      })),
  }
}

function emptyLine(): Feature {
  return { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
}

/**
 * ¿Puede este navegador dibujar con WebGL?
 *
 * <p>Un puesto sin aceleración gráfica, o con la aceleración desactivada por
 * política, es un caso real en una sede — y un navegador sin cabeza también.
 * Se pregunta con un lienzo de usar y tirar en vez de dejar que MapLibre lance.
 */
function soportaWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

function escapar(texto: string): string {
  const div = document.createElement('div')
  div.textContent = texto
  return div.innerHTML
}
