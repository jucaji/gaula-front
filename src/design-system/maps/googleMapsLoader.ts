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

/** Cómo se reconoce un <script> del SDK que ya esté en el documento. */
const SCRIPT_SELECTOR = 'script[src*="maps.googleapis.com/maps/api/js"]'

/** Cuánto se espera a que el bootstrap se termine de definir tras descargarse. */
const BOOTSTRAP_TIMEOUT_MS = 10_000

/**
 * La forma mínima del cargador dinámico del SDK.
 *
 * Con `loading=async`, el script que se descarga NO es el SDK: es un
 * bootstrap que expone `importLibrary`. `google.maps.Map` no existe hasta que
 * se importa la librería `maps` -- que es exactamente el fallo que se vio en
 * vivo: «google.maps.Map is not a constructor».
 */
interface MapsBootstrap {
  maps?: {
    importLibrary?: (name: string) => Promise<unknown>
    Map?: unknown
  }
}

function bootstrap(): MapsBootstrap['maps'] {
  return (window as unknown as { google?: MapsBootstrap }).google?.maps
}

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
    // Ya cargado antes en esta misma SPA: se reaprovecha, pero igual hay que
    // asegurar que la librería `maps` esté importada.
    if (bootstrap()) {
      importMapsLibrary().then(resolve, reject)
      return
    }

    // Un <script> del SDK que YA está en el DOM sin que este módulo lo sepa.
    // Ocurre cuando el módulo se reinstancia y pierde su memoria -- el hot
    // reload de Vite lo hace en cada edición. La promesa memoizada cubre las
    // llamadas concurrentes dentro de una misma instancia del módulo; esto
    // cubre el caso de que haya varias. Se espera al script que ya está en vez
    // de añadir otro que redefina `window.google` a mitad de vuelo.
    const existente = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR)
    if (existente) {
      existente.addEventListener('load', () => importMapsLibrary().then(resolve, reject), { once: true })
      existente.addEventListener('error', () => {
        loading = null
        reject(new MapSdkError('No se pudo cargar el mapa de Google.'))
      }, { once: true })
      // Puede que ya hubiera terminado de cargar antes de que llegáramos.
      if (bootstrap()) {
        importMapsLibrary().then(resolve, reject)
      }
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
    // `onload` sólo garantiza que el BOOTSTRAP está listo. El SDK de verdad
    // llega con `importLibrary`, y resolver antes deja al llamador con un
    // `google.maps.Map` que todavía no existe.
    script.onload = () => importMapsLibrary().then(resolve, (error: unknown) => {
      // Igual que con un fallo de red: se olvida la carga memoizada para que un
      // reintento posterior pueda volver a intentarlo. Sin esto, un fallo
      // pasajero -- una carrera entre dos cargas, una importación que llegó
      // tarde -- dejaría la consola SIN MAPA el resto de la sesión, y sólo una
      // recarga completa lo arreglaría.
      loading = null
      reject(error)
    })
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

/**
 * Importa lo que el mapa de flota usa: `maps` para el lienzo y `marker` para
 * los marcadores.
 *
 * <p>Si el bootstrap no expone `importLibrary` estamos ante la carga heredada
 * (sin `loading=async`), donde `google.maps.Map` ya existe: entonces no hay
 * nada que importar y basta con comprobarlo.
 */
/**
 * Espera a que el bootstrap termine de definirse.
 *
 * <p>`script.onload` NO basta, y ése era el fallo: con `loading=async` el
 * bootstrap puebla `google.maps` de forma progresiva, y en el instante de
 * `onload` el espacio de nombres ya existe pero `importLibrary` todavía no
 * está. Se vio en vivo -- `Object.keys(google.maps)` devolvía cosas como
 * `DirectionsTravelMode` y `ColorScheme`, sin `Map` ni `importLibrary` -- y
 * fallaba en cada carga limpia, mientras que llamar al cargador un segundo
 * después funcionaba siempre.
 */
async function esperarBootstrap(): Promise<NonNullable<MapsBootstrap['maps']>> {
  const limite = Date.now() + BOOTSTRAP_TIMEOUT_MS
  for (;;) {
    const maps = bootstrap()
    if (maps && (typeof maps.importLibrary === 'function' || typeof maps.Map === 'function')) {
      return maps
    }
    if (Date.now() > limite) {
      throw new MapSdkError(
        'El SDK de Google Maps se descargó pero no terminó de inicializarse. ' +
        'Suele significar que la clave no habilita Maps JavaScript API, o que el ' +
        'referente HTTP de esta página no está autorizado en Google Cloud.',
      )
    }
    await new Promise((r) => setTimeout(r, 50))
  }
}

async function importMapsLibrary(): Promise<void> {
  const maps = await esperarBootstrap()

  // Carga heredada (sin `loading=async`): el SDK completo ya está.
  if (typeof maps.importLibrary !== 'function') {
    if (typeof maps.Map === 'function') return
    throw sdkIncompleto()
  }

  // `importLibrary` DEVUELVE la librería. Comprobarlo sobre lo devuelto y no
  // sólo sobre `google.maps` es lo que arregla el fallo que se vio en vivo: el
  // SDK puebla el espacio de nombres DURANTE la importación, y una referencia
  // capturada antes de esperar puede no ver el resultado -- daba
  // «google.maps.Map no está disponible» con un `Map` que sí existía un
  // instante después.
  const libreria = (await maps.importLibrary('maps')) as { Map?: unknown } | undefined
  await maps.importLibrary('marker')

  if (typeof libreria?.Map === 'function' || typeof bootstrap()?.Map === 'function') {
    return
  }
  throw sdkIncompleto()
}

function sdkIncompleto(): MapSdkError {
  return new MapSdkError(
    'El SDK de Google Maps se cargó pero `google.maps.Map` no está disponible. ' +
    'Suele significar que la clave no es válida para Maps JavaScript API, o que ' +
    'el referente HTTP de esta página no está autorizado en Google Cloud.',
  )
}

/** Sólo para pruebas: olvida la carga memoizada. */
export function resetGoogleMapsLoaderForTests(): void {
  loading = null
}
