import { createFileRoute, redirect } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { z } from 'zod'
import maplibregl from 'maplibre-gl'
import { customFetch } from '@/api/client'
import type { CrimeTypeResponse } from '@/api/generated/models'
import { getSequentialPalette, getVizSurface } from '@/design-system/charts/palette'
import { useResolvedTheme } from '@/lib/theme/useResolvedTheme'

const mapSearchSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  crimeTypeCode: z.string().optional(),
})

export const Route = createFileRoute('/analitica/mapa')({
  validateSearch: mapSearchSchema,
  beforeLoad: ({ context }) => {
    if (!context.can('READ', 'ANALYTICS')) {
      throw redirect({ to: '/', search: { denied: 'ANALYTICS' } })
    }
  },
  component: HeatmapPage,
})

function useCrimeTypes() {
  return useQuery({
    queryKey: ['catalog', 'crime-types'],
    queryFn: () => customFetch<CrimeTypeResponse[]>('/api/v1/catalog/crime-types'),
    staleTime: Infinity,
    networkMode: 'always',
    retry: false,
  })
}

/**
 * Un `import 'maplibre-gl/dist/maplibre-gl.css'` estático la mete en el
 * ÚNICO CSS del build (`@tailwindcss/vite` consolida todo el CSS
 * alcanzable en un solo archivo, sin importar de qué chunk async venga) --
 * eso infla el bundle inicial en ~10 KB gzip para quien nunca visita esta
 * ruta. Copiada a `public/vendor/` y cargada en tiempo de ejecución, sólo
 * al montar este componente.
 */
function ensureMaplibreCss(): void {
  if (document.getElementById('maplibre-gl-css')) return
  const link = document.createElement('link')
  link.id = 'maplibre-gl-css'
  link.rel = 'stylesheet'
  link.href = '/vendor/maplibre-gl.css'
  document.head.appendChild(link)
}

/**
 * Absoluta, y armada con concatenación simple -- MapLibre carga teselas
 * desde un Web Worker (sin el mismo contexto de URL relativa del
 * documento; "Failed to construct 'Request': Failed to parse URL" con una
 * ruta relativa, hallazgo real) y `new URL(...)` codifica `{`/`}` como
 * `%7B`/`%7D`, rompiendo la sustitución de `{z}/{x}/{y}` que MapLibre
 * busca como subcadena literal (otro hallazgo real, mismo intento).
 */
function tileUrl(search: { from?: string | undefined; to?: string | undefined; crimeTypeCode?: string | undefined }): string {
  const params = new URLSearchParams()
  if (search.from) params.set('from', search.from)
  if (search.to) params.set('to', search.to)
  if (search.crimeTypeCode) params.set('crimeTypeCode', search.crimeTypeCode)
  const query = params.toString()
  return `${window.location.origin}/api/v1/analytics/heatmap/tiles/{z}/{x}/{y}.mvt${query ? `?${query}` : ''}`
}

/**
 * S7.FE.07: coropleta MapLibre sobre las teselas MVT del backend
 * (`ST_AsMVT`, capa `heatmap`, propiedades `municipality_code`/
 * `report_count`). Sin base map propia (PMTiles local pendiente, fuera de
 * alcance de esta pasada) -- fondo plano con el token `--viz-surface`.
 * `catalog.municipality.geom` está sin cargar para NINGÚN municipio en este
 * entorno (insumo real del cliente, ver comentario de
 * `CrimeHeatmapRepositoryAdapter`) -- el mapa queda visualmente vacío hasta
 * que esa geometría exista; no es un error de esta vista.
 */
function HeatmapPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const theme = useResolvedTheme()
  const crimeTypes = useCrimeTypes()
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    ensureMaplibreCss()
    const sequential = getSequentialPalette(theme)
    const c0 = sequential[0] ?? '#f7f8f7'
    const c1 = sequential[2] ?? c0
    const c2 = sequential[4] ?? c1
    const c3 = sequential[sequential.length - 1] ?? c2
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          heatmap: { type: 'vector', tiles: [tileUrl(search)], minzoom: 0, maxzoom: 14 },
        },
        layers: [
          { id: 'background', type: 'background', paint: { 'background-color': getVizSurface(theme) } },
          {
            id: 'municipios',
            type: 'fill',
            source: 'heatmap',
            'source-layer': 'heatmap',
            paint: {
              'fill-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'report_count'], 0],
                0, c0,
                5, c1,
                20, c2,
                50, c3,
              ],
              'fill-opacity': 0.85,
            },
          },
          {
            id: 'municipios-outline',
            type: 'line',
            source: 'heatmap',
            'source-layer': 'heatmap',
            paint: { 'line-color': theme === 'dark' ? '#374151' : '#cbd5e1', 'line-width': 0.5 },
          },
        ],
      },
      center: [-74.3, 4.6],
      zoom: 5,
    })
    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recrear al cambiar de tema (paint estático en el estilo); los filtros se aplican abajo sin recrear
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('heatmap') as maplibregl.VectorTileSource | undefined
    source?.setTiles([tileUrl(search)])
  }, [search])

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Mapa de calor</h1>
        <select
          value={search.crimeTypeCode ?? ''}
          onChange={(event) => {
            const value = event.target.value || undefined
            void navigate({ search: (prev) => ({ ...prev, crimeTypeCode: value }) })
          }}
          className="h-[var(--control-height-sm)] rounded-sm border border-border-strong bg-surface px-2 text-xs text-text-primary"
        >
          <option value="">Todas las tipologías</option>
          {crimeTypes.data?.map((ct) => (
            <option key={ct.code} value={ct.code}>
              {ct.name}
            </option>
          ))}
        </select>
      </div>

      <div ref={containerRef} className="min-h-[500px] flex-1 rounded-sm border border-border-strong" />

      <p className="text-2xs text-text-muted">
        Los municipios sin geometría cargada (insumo pendiente del cliente) no aparecen en el mapa, aunque tengan reportes.
      </p>
    </div>
  )
}
