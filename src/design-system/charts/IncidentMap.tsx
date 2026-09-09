import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps'
import { getCategoricalPalette, getSequentialPalette, getVizSurface } from '@/design-system/charts/palette'
import { useDepartmentGeometry } from '@/lib/catalog/useDepartmentGeometry'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'
import type { MapPoint } from '@/lib/observatory/types'

/** El archivo del mapa base, servido por el propio backend (ver infra/basemap). */
const BASEMAP_URL = '/basemap/colombia-z10.pmtiles'

/**
 * El protocolo `pmtiles://` se registra UNA vez por página: MapLibre lo guarda
 * en un registro global, y volver a registrarlo en cada montaje del mapa deja
 * manejadores colgando.
 */
let protocoloRegistrado = false
function ensurePmtilesProtocol(): void {
  if (protocoloRegistrado) return
  const protocol = new Protocol()
  maplibregl.addProtocol('pmtiles', protocol.tile)
  protocoloRegistrado = true
}

/**
 * ¿Está el mapa base desplegado? Se pregunta UNA vez y se recuerda: el archivo
 * es un artefacto de despliegue y no aparece a mitad de sesión.
 *
 * <p>Sin él la consola no se rompe: se dibuja el fondo plano con los límites
 * departamentales, que vienen de la base. Es degradación honesta — se ve menos,
 * no se rompe nada.
 */
let basemapDisponible: Promise<boolean> | null = null
function checkBasemap(): Promise<boolean> {
  basemapDisponible ??= fetch(BASEMAP_URL, { method: 'HEAD', credentials: 'include' })
    .then((response) => response.ok)
    .catch(() => false)
  return basemapDisponible
}

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
  byDepartment,
  selectedDepartment,
  onSelectDepartment,
}: {
  points: MapPoint[]
  total: number
  mappedTotal: number
  /** Nombres tal como los devuelve el análisis; se comparan normalizados. */
  hotspotMunicipalities: string[]
  anomalyMunicipalities: string[]
  selectedMunicipalityCode?: string | undefined
  onSelect: (municipalityCode: string | undefined) => void
  /** Conteo por departamento, para la coropleta. Viene con el nombre del archivo. */
  byDepartment: { key: string; count: number }[]
  selectedDepartment?: string | undefined
  onSelectDepartment: (department: string | undefined) => void
}) {
  const theme = useResolvedTheme()
  // Puntos por defecto: es la vista que no exagera. La coropleta pinta el
  // departamento ENTERO del color de su conteo, y eso hace ver un hecho en
  // Leticia como si cubriera todo el Amazonas -- útil para comparar territorios,
  // engañoso para localizar. Por eso se elige, no se impone.
  const [view, setView] = useState<'puntos' | 'departamentos'>('puntos')
  // HALLAZGO REAL (reportado por el cliente con una captura): en la vista de
  // municipios los círculos flotaban sobre un rectángulo negro. Sin base map ni
  // contorno, un punto en el vacío no dice DÓNDE queda -- que es lo único que un
  // mapa aporta sobre una tabla. Los límites departamentales son el contexto
  // mínimo, y por eso se cargan SIEMPRE, no sólo para la coropleta.
  const geometry = useDepartmentGeometry(true)
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  // El manejador y el municipio elegido cambian en cada render (cierran sobre los
  // filtros), pero la capa del mapa se registra UNA sola vez. Estas referencias le
  // dan a ese manejador ya registrado la versión vigente, y se actualizan dentro
  // de un efecto: escribir un ref durante el render no está permitido.
  const onSelectRef = useRef(onSelect)
  const onSelectDepartmentRef = useRef(onSelectDepartment)
  const selectedMunicipalityCodeRef = useRef(selectedMunicipalityCode)
  const selectedDepartmentRef = useRef(selectedDepartment)
  // El último GeoJSON conocido de cada capa, para que su fuente nazca ya con él.
  const pendingDataRef = useRef<FeatureCollection>(emptyCollection())
  const pendingDepartmentsRef = useRef<FeatureCollection>(emptyCollection())
  const viewRef = useRef(view)
  useEffect(() => {
    onSelectRef.current = onSelect
    onSelectDepartmentRef.current = onSelectDepartment
    selectedMunicipalityCodeRef.current = selectedMunicipalityCode
    selectedDepartmentRef.current = selectedDepartment
  }, [onSelect, onSelectDepartment, selectedMunicipalityCode, selectedDepartment])

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

  /**
   * La coropleta une la figura con el conteo por NOMBRE porque es lo único que
   * comparten: el archivo de la Fiscalía trae «ANTIOQUIA» y el catálogo
   * «Antioquia». Se comparan normalizados, sin acentos ni mayúsculas — la misma
   * regla que ya usa el importador para resolver municipios.
   */
  const departmentCollection = useMemo<FeatureCollection>(() => {
    const geometrias = geometry.data ?? []
    if (geometrias.length === 0) return emptyCollection()

    const conteos = new Map(byDepartment.map((item) => [normalize(item.key), item]))
    const escala = getSequentialPalette(theme)
    const maximo = byDepartment.reduce((max, item) => Math.max(max, item.count), 0)

    return {
      type: 'FeatureCollection',
      features: geometrias.map((departamento) => {
        const conteo = conteos.get(normalize(departamento.name))
        const count = conteo?.count ?? -1
        const proporcion = maximo > 0 && count > 0 ? count / maximo : 0
        const paso = count <= 0 ? 0 : Math.min(escala.length - 1, 1 + Math.floor(proporcion * (escala.length - 2)))
        return {
          type: 'Feature',
          geometry: departamento.geometry as FeatureCollection['features'][number]['geometry'],
          properties: {
            code: departamento.code,
            name: departamento.name,
            // El nombre TAL COMO viene en los hechos: es lo que hay que poner en
            // el filtro, no el del catálogo.
            departmentText: conteo?.key ?? departamento.name,
            count,
            color: escala[paso] ?? escala[0],
            selected: selectedDepartment != null && normalize(selectedDepartment) === normalize(departamento.name),
          },
        }
      }),
    }
  }, [geometry.data, byDepartment, theme, selectedDepartment])

  /**
   * Mismo patrón que la capa de hechos, y por el mismo hallazgo: la geometría
   * llega en su propia consulta y el mapa se recrea al saber si hay mapa base.
   * Si la actualización cae entre medias, `setData` no encuentra la fuente y se
   * pierde en silencio — el mapa se quedaba SIN coropleta, con la capa visible y
   * cero features (visto en vivo). Guardándola, la fuente nace con el dato.
   */
  useEffect(() => {
    pendingDepartmentsRef.current = departmentCollection
    const map = mapRef.current
    const source = map?.getSource('departamentos') as maplibregl.GeoJSONSource | undefined
    source?.setData(departmentCollection)
  }, [departmentCollection])


  const [conBasemap, setConBasemap] = useState<boolean | null>(null)
  useEffect(() => {
    let vigente = true
    void checkBasemap().then((disponible) => {
      if (vigente) setConBasemap(disponible)
    })
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    // Se espera a saber si hay mapa base antes de construir: recrear el mapa
    // después haría parpadear la pantalla en cada carga.
    if (!containerRef.current || conBasemap === null) return
    ensureMaplibreCss()
    ensurePmtilesProtocol()
    const marca = colorMarca
    const foco = colorFoco
    const anomalia = colorAnomalia

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: conBasemap
        ? {
            version: 8,
            // Las fuentes de las etiquetas también son locales: sin glyphs el
            // mapa se dibuja mudo, sin un solo nombre.
            glyphs: '/basemap/glyphs/{fontstack}/{range}.pbf',
            sources: { protomaps: { type: 'vector', url: `pmtiles://${window.location.origin}${BASEMAP_URL}` } },
            layers: basemapLayers('protomaps', namedFlavor(theme === 'dark' ? 'dark' : 'light'), { lang: 'es' }),
          }
        : {
            version: 8,
            sources: {},
            layers: [{ id: 'background', type: 'background', paint: { 'background-color': getVizSurface(theme) } }],
          },
      center: [-74.3, 4.6],
      zoom: 4.4,
      // La atribución es OBLIGATORIA: las teselas derivan de OpenStreetMap, que
      // se distribuye bajo ODbL. No es un adorno que se pueda quitar.
      attributionControl: conBasemap
        ? { compact: true, customAttribution: '© OpenStreetMap · Protomaps' }
        : false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    mapRef.current = map

    map.on('load', () => {
      // La coropleta va DEBAJO de los puntos: son dos lecturas del mismo dato y
      // la de abajo no puede tapar la de arriba.
      map.addSource('departamentos', { type: 'geojson', data: pendingDepartmentsRef.current })
      map.addLayer({
        id: 'departamentos-relleno',
        type: 'fill',
        source: 'departamentos',
        paint: {
          'fill-color': ['case', ['==', ['get', 'count'], -1], 'transparent', ['get', 'color']],
          // Opaco: con el terreno apagado debajo, media tinta sólo serviría para
          // desteñir la escala.
          'fill-opacity': 0.92,
        },
      })
      map.addLayer({
        id: 'departamentos-borde',
        type: 'line',
        source: 'departamentos',
        paint: {
          'line-color': theme === 'dark' ? '#475569' : '#94a3b8',
          'line-width': ['case', ['get', 'selected'], 2.5, 0.6],
          // En la vista de puntos el contorno es CONTEXTO: se ve, pero no compite
          // con los círculos, que son el dato.
          'line-opacity': 0.85,
        },
      })

      map.addSource('hechos', { type: 'geojson', data: pendingDataRef.current })

      // El halo del foco va DEBAJO del punto: marca la zona sin taparla.
      map.addLayer({
        id: 'focos',
        type: 'circle',
        source: 'hechos',
        filter: ['==', ['get', 'hotspot'], true],
        paint: {
          'circle-radius': [
            '+',
            ['*', ['get', 'radius'], ['interpolate', ['linear'], ['zoom'], 4, 0.7, 6, 1, 9, 1.4]],
            9,
          ],
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
          // El radio del dato, ajustado por zoom. A nivel país los círculos de
          // municipios vecinos se solapan hasta volverse una mancha (el Valle de
          // Aburrá son cuatro pegados); al acercarse hay sitio y pueden crecer.
          // La proporción ENTRE círculos no cambia: el factor multiplica a todos
          // por igual, así que el área sigue diciendo lo mismo.
          'circle-radius': [
            '*',
            ['get', 'radius'],
            ['interpolate', ['linear'], ['zoom'], 4, 0.7, 6, 1, 9, 1.4],
          ],
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
          'circle-radius': [
            '+',
            ['*', ['get', 'radius'], ['interpolate', ['linear'], ['zoom'], 4, 0.7, 6, 1, 9, 1.4]],
            5,
          ],
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
      map.on('mousemove', 'departamentos-relleno', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const props = feature.properties as Record<string, unknown>
        const count = Number(props.count)
        map.getCanvas().style.cursor = 'pointer'
        popup
          .setLngLat(event.lngLat)
          .setHTML(
            `<strong>${escapeHtml(String(props.name ?? ''))}</strong><br/>${
              // -1 marca "el corte no trae hechos de este departamento", que NO es
              // lo mismo que cero: el archivo puede sencillamente no cubrirlo.
              count < 0 ? 'sin hechos en este corte' : `${count} ${count === 1 ? 'hecho' : 'hechos'}`
            }`,
          )
          .addTo(map)
      })
      map.on('mouseleave', 'departamentos-relleno', () => {
        map.getCanvas().style.cursor = ''
        popup.remove()
      })
      map.on('click', 'departamentos-relleno', (event) => {
        const feature = event.features?.[0]
        if (!feature) return
        const nombre = String((feature.properties as Record<string, unknown>).departmentText ?? '')
        onSelectDepartmentRef.current(nombre === selectedDepartmentRef.current ? undefined : nombre)
      })

      // El estilo ya tiene todas sus capas: es el momento seguro para dejar
      // visible sólo lo de la vista actual.
      applyVisibility(map, viewRef.current)

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el estilo se recrea al cambiar de tema o al saber si hay mapa base; los datos se actualizan abajo sin recrear el mapa
  }, [theme, conBasemap])

  /**
   * HALLAZGO REAL (verificado en vivo, 2026-09-08): el mapa marcaba los focos
   * pero NO las anomalías, y el dato llegaba bien del backend.
   *
   * <p>Es una carrera. El análisis llega en su propia consulta, después de los
   * conteos; cuando su actualización caía mientras el estilo aún no estaba
   * listo, el código se colgaba de `map.once('load')` — un evento que YA había
   * ocurrido y que no vuelve a dispararse nunca. Esa actualización se perdía en
   * silencio y el mapa se quedaba con la versión anterior, sin anomalías.
   *
   * <p>Ahora el último dato vive en una referencia y se aplica en cuanto la
   * fuente existe: el momento en que llega deja de importar.
   */
  useEffect(() => {
    pendingDataRef.current = withRadius(collection, maxCount, selectedMunicipalityCode)
    const map = mapRef.current
    const source = map?.getSource('hechos') as maplibregl.GeoJSONSource | undefined
    source?.setData(pendingDataRef.current)
  }, [collection, maxCount, selectedMunicipalityCode])

  /**
   * HALLAZGO REAL (reportado por el cliente): al entrar al modo lámina el mapa se
   * DESMONTA, y al volver se construye uno nuevo. Este efecto llegaba antes de
   * que el estilo tuviera sus capas, salía temprano por el `getLayer` y no volvía
   * a correr —la vista no había cambiado—, así que TODAS las capas quedaban
   * visibles: los polígonos de departamentos y los círculos superpuestos, que al
   * acercar el zoom son ilegibles.
   *
   * <p>Por eso la visibilidad se aplica desde una función y se llama también al
   * terminar de cargar el estilo, que es el único momento en que existen con
   * seguridad todas las capas.
   */
  useEffect(() => {
    viewRef.current = view
    applyVisibility(mapRef.current, view)
  }, [view, geometry.data, conBasemap])

  const sinUbicar = total - mappedTotal

  return (
    <section aria-label="Mapa del registro nacional" className="mt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-text-primary">Dónde están los hechos</h2>
        <div className="flex items-center gap-1" role="group" aria-label="Vista del mapa">
          {(['puntos', 'departamentos'] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={view === opcion}
              onClick={() => setView(opcion)}
              className={`min-h-[var(--tap-min)] rounded-sm border px-2 text-2xs sm:min-h-0 sm:py-1 ${
                view === opcion
                  ? 'border-accent bg-surface-raised text-text-primary'
                  : 'border-border-strong text-text-secondary'
              }`}
            >
              {opcion === 'puntos' ? 'Municipios' : 'Departamentos'}
            </button>
          ))}
        </div>
      </div>

      <p className="mt-1 text-2xs text-text-muted">
        {view === 'puntos'
          ? 'El tamaño del círculo es proporcional al número de hechos. Haga clic en un municipio para filtrar el tablero.'
          : 'El departamento entero se pinta con el color de su conteo: sirve para comparar territorios, no para ubicar un hecho. Haga clic para filtrar.'}
      </p>

      <div
        ref={containerRef}
        role="img"
        aria-label={`Mapa con ${points.length} municipios con hechos`}
        className="mt-2 h-[420px] w-full rounded-sm border border-border-strong"
      />

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-text-secondary">
        {view === 'puntos' ? (
          <>
            <Leyenda color={colorMarca} texto="Municipio con hechos" />
            <Leyenda color={colorFoco} texto="Zona con foco detectado" />
            <Leyenda color={colorAnomalia} texto="Municipio con anomalía en el último mes" />
          </>
        ) : (
          <>
            <span className="flex items-center gap-1">
              menos
              {getSequentialPalette(theme).map((color) => (
                <span key={color} aria-hidden className="inline-block size-2.5 rounded-[2px]" style={{ backgroundColor: color }} />
              ))}
              más
            </span>
            {/* Un departamento sin hechos en el corte NO se pinta como "pocos": se
                deja sin relleno, porque el corte puede sencillamente no cubrirlo. */}
            <span className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-2.5 rounded-[2px] border border-border-strong" />
              Sin hechos en este corte
            </span>
          </>
        )}
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

/**
 * Las dos vistas son excluyentes: superponerlas convierte el mapa en un adorno
 * del que ya no se puede leer ninguna de las dos cosas.
 */
function applyVisibility(map: maplibregl.Map | null, view: 'puntos' | 'departamentos'): void {
  if (!map || !map.getLayer('departamentos-relleno')) return
  const visible = (id: string, mostrar: boolean) =>
    map.setLayoutProperty(id, 'visibility', mostrar ? 'visible' : 'none')

  visible('departamentos-relleno', view === 'departamentos')
  // El contorno queda en las DOS vistas: es lo que le da ubicación a un punto.
  visible('departamentos-borde', true)
  visible('municipios', view === 'puntos')
  visible('focos', view === 'puntos')
  visible('seleccionado', view === 'puntos')

  // En la coropleta el COLOR es el mapa: el terreno del mapa base se mezcla con el
  // relleno y deja de leerse cuál es cuál. Se apaga todo lo que pinta superficie y
  // quedan sólo el agua y los nombres, que dan referencia sin competir. Vuelve
  // entero con los puntos, donde sí sirve para ubicar un círculo.
  const DETALLE = ['roads', 'buildings', 'landuse', 'landcover', 'earth', 'pois', 'address']
  for (const capa of map.getStyle().layers) {
    if (DETALLE.some((prefijo) => capa.id.startsWith(prefijo))) {
      visible(capa.id, view === 'puntos')
    }
  }
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
