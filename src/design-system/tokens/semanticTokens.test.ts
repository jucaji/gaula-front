import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El tema oscuro está declarado DOS veces, y las dos tienen que decir lo mismo.
 *
 * <p>No es un descuido: son los tres estados de tema de docs/06 §3.6. El bloque
 * `:root[data-theme='dark']` cubre la elección explícita del usuario; el de
 * `@media (prefers-color-scheme: dark)` cubre a quien deja el tema en
 * «sistema». CSS no tiene forma de compartir un bloque de declaraciones entre
 * los dos selectores sin repetirlas.
 *
 * <p>Lo que sí es un problema es que se separen. Pasó el 2026-09-10: se cambió
 * `--shadow-raised` en el primero para dar profundidad a las tarjetas, y quien
 * usa el tema del sistema —la mayoría— siguió viendo la consola plana, porque
 * el segundo bloque seguía diciendo `none`. Se descubrió leyendo el estilo
 * computado en el navegador, no en el código.
 */
describe('los dos bloques del tema oscuro', () => {
  // Desde la raíz del proyecto: `import.meta.url` llega transformado por Vite y
  // no apunta a un archivo del disco.
  const css = readFileSync(join(process.cwd(), 'src/design-system/tokens/semantic.css'), 'utf8')

  function declarationsOf(startMarker: string, endMarker: string): Map<string, string> {
    const start = css.indexOf(startMarker)
    expect(start, `no se encontró el bloque ${startMarker}`).toBeGreaterThan(-1)

    const block = css.slice(start, css.indexOf(endMarker, start))
    const declarations = new Map<string, string>()

    for (const match of block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
      const [, name, value] = match
      if (name === undefined || value === undefined) continue
      // Sin espacios ni saltos: lo que se compara es el valor, no su formato.
      declarations.set(name, value.replace(/\s+/g, ' ').trim())
    }
    return declarations
  }

  it('declaran exactamente los mismos tokens, con los mismos valores', () => {
    const explicito = declarationsOf(":root[data-theme='dark'],", '\n}')
    const delSistema = declarationsOf('@media (prefers-color-scheme: dark)', '\n  }')

    expect(explicito.size, 'el bloque explícito no debería estar vacío').toBeGreaterThan(20)
    expect(Object.fromEntries(delSistema)).toEqual(Object.fromEntries(explicito))
  })
})
