import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadGoogleMaps, MapSdkError, resetGoogleMapsLoaderForTests } from './googleMapsLoader'

/**
 * SPEC-0506. El cargador del SDK.
 *
 * Existe por un fallo real visto en vivo: «google.maps.Map is not a
 * constructor». Con `loading=async` el script que se descarga NO es el SDK,
 * es un bootstrap que expone `importLibrary`; resolver en `onload` deja al
 * llamador con un `google.maps.Map` que todavía no existe.
 *
 * Nada de esto se veía en las pruebas E2E porque allí el SDK se mockea y el
 * mapa nunca se carga de verdad.
 */
describe('loadGoogleMaps', () => {
  afterEach(() => {
    // Sin esto los espías se ENCADENAN: el `original` que captura un test es
    // el espía del test anterior, así que la carga de uno dispara la del otro
    // y las aserciones miden algo que no es lo que se cree.
    vi.restoreAllMocks()
    resetGoogleMapsLoaderForTests()
    delete (window as unknown as { google?: unknown }).google
    document.head.querySelectorAll('script').forEach((s) => s.remove())
  })

  /** Simula la descarga del bootstrap y qué expone al terminar. */
  function conScriptQueCarga(alCargar: () => void) {
    const original = document.head.appendChild.bind(document.head)
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const resultado = original(node)
      queueMicrotask(() => {
        alCargar()
        ;(node as HTMLScriptElement).onload?.(new Event('load'))
      })
      return resultado
    })
  }

  it('NO resuelve hasta que `importLibrary` terminó: ahí está el fallo que se vio en vivo', async () => {
    const orden: string[] = []
    const importLibrary = vi.fn(async (name: string) => {
      orden.push(`import:${name}`)
      // El SDK sólo aparece DESPUÉS de importar la librería `maps`.
      if (name === 'maps') {
        ;(window as unknown as { google: { maps: Record<string, unknown> } }).google.maps.Map =
          function Map() {} as unknown as never
      }
      return undefined
    })
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = { maps: { importLibrary } }
    })

    await loadGoogleMaps('clave')

    expect(orden).toEqual(['import:maps', 'import:marker'])
    expect(typeof (window as unknown as { google: { maps: { Map: unknown } } }).google.maps.Map)
      .toBe('function')
  })

  it('espera a que el bootstrap defina `importLibrary`, que en `onload` puede no estar', async () => {
    // EL fallo que se vio en vivo, en cada carga limpia: con `loading=async` el
    // bootstrap puebla `google.maps` de forma progresiva, y en el instante de
    // `onload` el espacio de nombres existe pero `importLibrary` todavía no.
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = { maps: { ColorScheme: {} } }
      // Llega tarde, como en la realidad.
      setTimeout(() => {
        ;(window as unknown as { google: { maps: Record<string, unknown> } }).google.maps.importLibrary =
          async () => ({ Map: function Map() {} })
      }, 120)
    })

    await expect(loadGoogleMaps('clave')).resolves.toBeUndefined()
  })

  it('acepta el `Map` que DEVUELVE importLibrary, aunque el espacio de nombres no se puebla', async () => {
    // El fallo real visto en vivo: el SDK puebla `google.maps` durante la
    // importación, y comprobarlo sobre una referencia capturada antes de
    // esperar daba «Map no está disponible» con un `Map` que sí existía.
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = {
        maps: { importLibrary: async (n: string) => (n === 'maps' ? { Map: function Map() {} } : undefined) },
      }
    })

    await expect(loadGoogleMaps('clave')).resolves.toBeUndefined()
  })

  it('si tras importar no hay `Map`, falla con un mensaje que dice qué revisar', async () => {
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = {
        maps: { importLibrary: vi.fn(async () => undefined) },
      }
    })

    // El caso real: una clave que no habilita Maps JavaScript API, o un
    // referente HTTP no autorizado. El SDK carga y no expone nada.
    await expect(loadGoogleMaps('clave')).rejects.toBeInstanceOf(MapSdkError)
    await expect(loadGoogleMaps('clave')).rejects.toThrow(/referente HTTP|Maps JavaScript API/)
  })

  it('tolera la carga heredada, sin `importLibrary`, donde `Map` ya existe', async () => {
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = { maps: { Map: function Map() {} } }
    })

    await expect(loadGoogleMaps('clave')).resolves.toBeUndefined()
  })

  it('un fallo de red deja el cargador listo para reintentar', async () => {
    const original = document.head.appendChild.bind(document.head)
    vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => {
      const resultado = original(node)
      queueMicrotask(() => (node as HTMLScriptElement).onerror?.(new Event('error')))
      return resultado
    })

    await expect(loadGoogleMaps('clave')).rejects.toBeInstanceOf(MapSdkError)

    // Sin esto, una red intermitente dejaría la consola sin mapa hasta que
    // alguien recargara la página entera.
    vi.restoreAllMocks()
    document.head.querySelectorAll('script').forEach((s) => s.remove())
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = { maps: { Map: function Map() {} } }
    })
    await expect(loadGoogleMaps('clave')).resolves.toBeUndefined()
  })

  it('si YA hay un script del SDK en el documento, espera a ése en vez de añadir otro', async () => {
    // Ocurre cuando el módulo se reinstancia y pierde su memoria: el hot
    // reload de Vite lo hace en cada edición.
    const previo = document.createElement('script')
    previo.src = 'https://maps.googleapis.com/maps/api/js?key=x&loading=async'
    document.head.appendChild(previo)

    const promesa = loadGoogleMaps('clave')
    ;(window as unknown as { google: unknown }).google = { maps: { Map: function Map() {} } }
    previo.dispatchEvent(new Event('load'))

    await expect(promesa).resolves.toBeUndefined()
    expect(document.head.querySelectorAll(
      'script[src*="maps.googleapis.com"]')).toHaveLength(1)
  })

  it('un fallo al importar la librería NO deja el mapa muerto el resto de la sesión', async () => {
    let fallaLaPrimera = true
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = fallaLaPrimera
        ? { maps: { importLibrary: async () => undefined } }
        : { maps: { Map: function Map() {} } }
    })

    await expect(loadGoogleMaps('clave')).rejects.toBeInstanceOf(MapSdkError)

    // Sin olvidar la promesa rechazada, la consola se quedaba sin mapa hasta
    // que alguien recargara la página entera.
    fallaLaPrimera = false
    vi.restoreAllMocks()
    document.head.querySelectorAll('script').forEach((s) => s.remove())
    delete (window as unknown as { google?: unknown }).google
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = { maps: { Map: function Map() {} } }
    })
    await expect(loadGoogleMaps('clave')).resolves.toBeUndefined()
  })

  it('sólo inyecta UN script aunque se le pida varias veces', async () => {
    conScriptQueCarga(() => {
      ;(window as unknown as { google: unknown }).google = { maps: { Map: function Map() {} } }
    })

    await Promise.all([loadGoogleMaps('clave'), loadGoogleMaps('clave'), loadGoogleMaps('clave')])

    // Un segundo <script> redefiniría `window.google` a mitad de vuelo y
    // dejaría mapas huérfanos apuntando a un SDK que ya no existe.
    expect(document.head.querySelectorAll('script[src*="maps.googleapis.com"]')).toHaveLength(1)
  })
})
