import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps'
import { getVizSurface } from '@/design-system/charts/palette'

/**
 * El mapa base local: teselas Protomaps servidas por el propio backend.
 *
 * <p>Es lo que hace posible que el proveedor cartográfico sea intercambiable de
 * verdad y no sólo en el papel: el adaptador de MapLibre no necesita internet,
 * ni clave, ni contrato con nadie. Un despliegue aislado (docs/08 §5) puede
 * usarlo tal cual.
 *
 * <p>NOTA: `IncidentMap` del observatorio tiene su propia copia de estas
 * funciones, anterior a este archivo. Unificarlas es un cambio aparte — ese
 * mapa está validado y funcionando, y no se toca de paso.
 */

/** El archivo del mapa base (ver infra/basemap). */
export const BASEMAP_URL = '/basemap/colombia-z10.pmtiles'

/**
 * El protocolo `pmtiles://` se registra UNA vez por página: MapLibre lo guarda
 * en un registro global, y volver a registrarlo en cada montaje deja
 * manejadores colgando.
 */
let protocoloRegistrado = false
export function ensurePmtilesProtocol(): void {
  if (protocoloRegistrado) return
  maplibregl.addProtocol('pmtiles', new Protocol().tile)
  protocoloRegistrado = true
}

/**
 * ¿Está desplegado el mapa base? Se pregunta UNA vez y se recuerda: es un
 * artefacto de despliegue, no aparece a mitad de sesión.
 */
let basemapDisponible: Promise<boolean> | null = null
export function checkBasemap(): Promise<boolean> {
  basemapDisponible ??= fetch(BASEMAP_URL, { method: 'HEAD', credentials: 'include' })
    .then((response) => response.ok)
    .catch(() => false)
  return basemapDisponible
}

/**
 * El CSS de MapLibre se carga en tiempo de ejecución y no como import estático:
 * `@tailwindcss/vite` consolida el CSS de terceros en el bundle INICIAL, y eso
 * añadía ~10 KB gzip a todas las pantallas por culpa de dos que usan mapa.
 */
let cssInyectado = false
export function ensureMaplibreCss(): void {
  if (cssInyectado || document.querySelector('link[data-maplibre-css]')) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = '/vendor/maplibre-gl.css'
  link.dataset.maplibreCss = 'true'
  document.head.appendChild(link)
  cssInyectado = true
}

/**
 * El estilo del mapa.
 *
 * <p>Sin el artefacto de teselas se dibuja un fondo plano: se ve menos, no se
 * rompe nada. Degradación honesta, el mismo criterio que en todo el módulo.
 */
export function basemapStyle(theme: 'light' | 'dark', conBasemap: boolean): maplibregl.StyleSpecification {
  if (!conBasemap) {
    return {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': getVizSurface(theme) } }],
    }
  }
  return {
    version: 8,
    // Las fuentes de las etiquetas también son locales: sin glyphs el mapa se
    // dibuja mudo, sin un solo nombre.
    glyphs: '/basemap/glyphs/{fontstack}/{range}.pbf',
    sources: { protomaps: { type: 'vector', url: `pmtiles://${window.location.origin}${BASEMAP_URL}` } },
    layers: basemapLayers('protomaps', namedFlavor(theme === 'dark' ? 'dark' : 'light'), { lang: 'es' }),
  }
}

/** La atribución es OBLIGATORIA: las teselas derivan de OpenStreetMap (ODbL). */
export function attributionFor(conBasemap: boolean) {
  return conBasemap ? { compact: true, customAttribution: '© OpenStreetMap · Protomaps' } : false
}
