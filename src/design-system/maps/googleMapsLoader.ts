/**
 * Carga el SDK de Google Maps una sola vez por documento.
 *
 * Un `<script>` por montaje del componente redefiniría `window.google` a mitad
 * de vuelo y dejaría mapas huérfanos apuntando a un SDK que ya no existe --
 * mismo problema que resolvió `ensurePmtilesProtocol` para MapLibre, y la
 * misma solución: una promesa memoizada a nivel de módulo.
 *
 * La etiqueta se crea con `document.createElement` y no con una cadena de HTML
 * porque la CSP de la consola no admite `unsafe-inline` (docs/04 §8): el script
 * externo está permitido por origen, pero un `<script>` en línea no lo estaría.
 */
let loading: Promise<void> | null = null

export class MapSdkError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MapSdkError'
  }
}

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (loading) return loading

  loading = new Promise<void>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new MapSdkError('No hay navegador donde cargar el mapa'))
      return
    }
    // Ya cargado por otra pestaña de la misma SPA.
    if ((window as unknown as { google?: { maps?: unknown } }).google?.maps) {
      resolve()
      return
    }

    const script = document.createElement('script')
    const params = new URLSearchParams({
      key: apiKey,
      v: 'weekly',
      libraries: 'marker',
      // El SDK habla el idioma de la consola, no el del navegador del operador.
      language: 'es',
      region: 'CO',
      loading: 'async',
    })
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      // Se limpia la promesa para que un reintento posterior pueda volver a
      // intentarlo: en un despliegue con red intermitente, fallar una vez no
      // debería dejar la consola sin mapa hasta que alguien recargue.
      loading = null
      reject(new MapSdkError(
        'No se pudo cargar el mapa de Google. Sin salida a internet la consola sigue funcionando, ' +
        'pero muestra la flota como lista y coordenadas.',
      ))
    }
    document.head.appendChild(script)
  })

  return loading
}

/** Sólo para pruebas: olvida la carga memoizada. */
export function resetGoogleMapsLoaderForTests(): void {
  loading = null
}
