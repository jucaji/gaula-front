import { useEffect, useMemo, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import { getCategoricalPalette, getVizSurface } from '@/design-system/charts/palette'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import type { MapPoint } from '@/lib/observatory/types'

/**
 * SPEC-0807: el mapa del registro nacional.
 *
 * <p>Un foco es un hecho GEOGRÁFICO. El análisis ya lo detecta y lo devuelve
 * como una lista de nombres (`ABEJORRAL · MEDELLIN · BELLO`); pedirle al comando
 * que lo imagine a partir de esa lista es devolverle el trabajo que la
 * herramienta debía hacer.
 *
 * <p>Es un mapa de PUNTOS sobre el centroide del municipio, no una interpolación
 * de calor: un centroide no es el lugar del hecho, y una mancha suave sugiere
 * una precisión que el dato no tiene. Tampoco es una coropleta por municipio —
 * eso son 1.122 polígonos y es otro trabajo.
 */
export function IncidentMap({
  points,
  total,
  mappedTotal,
  hotspotMunicipalities,
  anomalyMunicipalities,
  selectedMunicipalityCode,
  onSelect,
}: {
  points: MapPoint[]
  total: number
  mappedTotal: number
  /** Nombres tal como los devuelve el análisis; se comparan normalizados. */
  hotspotMunicipalities: string[]
  anomalyMunicipalities: string[]
  selectedMunicipalityCode?: string | undefined
  onSelect: (municipalityCode: string | undefined) => void
}) {
  const theme = useResolvedTheme()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // El manejador y el municipio elegido cambian en cada render (cierran sobre los
  // filtros), pero la capa del mapa se registra UNA sola vez. Estas referencias le
  // dan a ese manejador ya registrado la versión vigente, y se actualizan dentro
  // de un efecto: escribir un ref durante el render no está permitido.
  const onSelectRef = useRef(onSelect)
  const selectedMunicipalityCodeRef = useRef(selectedMunicipalityCode)
  useEffect(() => {
    onSelectRef.current = onSelect
    selectedMunicipalityCodeRef.current = selectedMunicipalityCode
  }, [onSelect, selectedMunicipalityCode])

  // La leyenda tiene que usar EXACTAMENTE los colores del mapa: son de la paleta
  // en JS, no tokens CSS, porque MapLibre no entiende `oklch()` (hallazgo del
  // Sprint 7) y la paleta del proyecto está en ese espacio.
  const categorical = getCategoricalPalette(theme)
  const colorMarca = categorical[0] ?? '#2563eb'
  const colorFoco = categorical[1] ?? '#f59e0b'
  const colorAnomalia = categorical[2] ?? '#dc2626'

  const collection = useMemo(
    () => toFeatureCollection(points, hotspotMunicipalities, anomalyMunicipalities),
    [points, hotspotMunicipalities, anomalyMunicipalities],
  )
  const maxCount = useMemo(() => points.reduce((max, point) => Math.max(max, point.count), 0), [points])

  useEffect(() => {
    if (!containerRef.current) return
    ensureMaplibreCss()
    const marca = colorMarca
    const foco = colorFoco
    const anomalia = colorAnomalia

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': getVizSurface(theme) } }],
      },
      center: [-74.3, 4.6],
      zoom: 4.4,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      map.addSource('hechos', { type: 'geojson', data: emptyCollection() })

      // El halo del foco va DEBAJO del punto: marca la zona sin taparla.
      map.addLayer({
        id: 'focos',
        type: 'circle',
        source: 'hechos',
        filter: ['==', ['get', 'hotspot'], true],
        paint: {
          'circle-radius': ['+', ['get', 'radius'], 9],
          'circle-color': foco,
          'circle-opacity': 0.18,
          'circle-stroke-width': 1,
          'circle-stroke-color': foco,
          'circle-stroke-opacity': 0.5,
        },
      })

      map.addLayer({
        id: 'municipios',
        type: 'circle',
        source: 'hechos',
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['case', ['get', 'anomaly'], anomalia, marca],
          'circle-opacity': 0.75,
          // El anillo blanco despega los círculos que se solapan (el Valle de
          // Aburrá son cuatro municipios pegados).
          'circle-stroke-width': ['case', ['get', 'selected'], 3, 1],
          'circle-stroke-color': theme === 'dark' ? '#0b0f14' : '#ffffff',
        },
      })

      map.addLayer({
        id: 'seleccionado',
        type: 'circle',
        source: 'hechos',
        filter: ['==', ['get', 'selected'], true],
        paint: {
          'circle-radius': ['+', ['get', 'radius'], 5],
          'circle-color': 'transparent',
          'circle-stroke-width': 2,
          'circle-stroke-color': marca,
        },
      })

      const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })

      map.on('mousemove', 'municipios', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        map.getCanvas().style.cursor = 'pointer'
        const props = feature.properties as Record<string, unknown>
        const etiquetas = [
          props.hotspot === true || props.hotspot === 'true' ? 'foco' : null,
          props.anomaly === true || props.anomaly === 'true' ? 'anomalía' : null,
        ].filter(Boolean)
        popup
          .setLngLat(event.lngLat)
          .setHTML(
            `<strong>${escapeHtml(String(props.municipalityText ?? ''))}</strong><br/>${props.count} ${
              Number(props.count) === 1 ? 'hecho' : 'hechos'
            }${etiquetas.length > 0 ? `<br/><em>${etiquetas.join(' · ')}</em>` : ''}`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'municipios', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
      map.on('click', 'municipios', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const code = String((feature.properties as Record<string, unknown>).municipalityCode ?? '')
        // Volver a hacer clic en el municipio ya elegido lo quita: el mapa es un
        // filtro, y todo filtro tiene que poder deshacerse donde se puso.
        onSelectRef.current(code === selectedMunicipalityCodeRef.current ? undefined : code)
      })
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el estilo se recrea sólo al cambiar de tema; los datos se actualizan abajo sin recrear el mapa
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const apply = () => {
      const source = map.getSource('hechos') as maplibregl.GeoJSONSource | undefined
      source?.setData(withRadius(collection, maxCount, selectedMunicipalityCode))
    }
    if (map.isStyleLoaded()) apply()
    else map.once('load', apply)
  }, [collection, maxCount, selectedMunicipalityCode])

  const sinUbicar = total - mappedTotal

  return (
    <section aria-label="Mapa del registro nacional" className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Dónde están los hechos</h2>
        <p className="text-2xs text-text-muted">
          El tamaño del círculo es proporcional al número de hechos. Haga clic en un municipio para filtrar el tablero.
        </p>
      </div>

      <div
        ref={containerRef}
        role="img"
        aria-label={`Mapa con ${points.length} municipios con hechos`}
        className="mt-2 h-[420px] w-full rounded-sm border border-border-strong"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-text-secondary">
        <Leyenda color={colorMarca} texto="Municipio con hechos" />
        <Leyenda color={colorFoco} texto="Zona con foco detectado" />
        <Leyenda color={colorAnomalia} texto="Municipio con anomalía en el último mes" />
      </div>

      {/*
        SPEC-0807 CA-1: lo que no está en el mapa se DICE. Un municipio sin
        resolver o sin centroide desaparece del mapa, pero no del dato — y quien
        mira el mapa tiene que saber cuánto está fuera de lo que ve.
      */}
      <p className="mt-1 text-2xs text-text-muted">
        {mappedTotal.toLocaleString('es-CO')} de {total.toLocaleString('es-CO')} hechos ubicados en el mapa.
        {sinUbicar > 0 && (
          <>
            {' '}
            {sinUbicar.toLocaleString('es-CO')} no se pudieron ubicar porque su municipio no está resuelto contra el
            catálogo; siguen contados en las cifras y en las tablas.
          </>
        )}
      </p>
    </section>
  )
}

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className="inline-block size-2.5 rounded-full" style={{ backgroundColor: color }} />
      {texto}
    </span>
  )
}

interface FeatureCollection {
  type: 'FeatureCollection'
  features: {
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: Record<string, unknown>
  }[]
}

function emptyCollection(): FeatureCollection {
  return { type: 'FeatureCollection', features: [] }
}

/** Sin acentos y en mayúscula: el análisis devuelve el texto del archivo, no el del catálogo. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .trim()
}

function toFeatureCollection(points: MapPoint[], hotspots: string[], anomalies: string[]): FeatureCollection {
  const enFoco = new Set(hotspots.map(normalize))
  const conAnomalia = new Set(anomalies.map(normalize))
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
      properties: {
        municipalityCode: point.municipalityCode,
        municipalityText: point.municipalityText,
        count: point.count,
        hotspot: enFoco.has(normalize(point.municipalityText)),
        anomaly: conAnomalia.has(normalize(point.municipalityText)),
      },
    })),
  }
}

/**
 * El ÁREA del círculo es proporcional al conteo, no el radio: escalar el radio
 * multiplica las diferencias al cuadrado y convierte «el doble de hechos» en un
 * círculo cuatro veces más grande. Es el error clásico del mapa de burbujas.
 */
function withRadius(collection: FeatureCollection, maxCount: number, selectedCode?: string): FeatureCollection {
  const MIN = 5
  const MAX = 26
  return {
    type: 'FeatureCollection',
    features: collection.features.map((feature) => {
      const count = Number(feature.properties.count ?? 0)
      const proporcion = maxCount > 0 ? Math.sqrt(count / maxCount) : 0
      return {
        ...feature,
        properties: {
          ...feature.properties,
          radius: MIN + proporcion * (MAX - MIN),
          selected: selectedCode != null && feature.properties.municipalityCode === selectedCode,
        },
      }
    }),
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) =>
    char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : char === '"' ? '&quot;' : '&#39;',
  )
}

/**
 * La hoja de estilos de MapLibre se carga en tiempo de ejecución, no con un
 * import estático: `@tailwindcss/vite` consolida todo el CSS alcanzable en un
 * solo archivo, así que importarla infla el bundle inicial para quien nunca
 * abre un mapa (hallazgo real del Sprint 7).
 */
function ensureMaplibreCss(): void {
  if (document.getElementById('maplibre-gl-css')) return
  const link = document.createElement('link')
  link.id = 'maplibre-gl-css'
  link.rel = 'stylesheet'
  link.href = '/vendor/maplibre-gl.css'
  document.head.appendChild(link)
}
