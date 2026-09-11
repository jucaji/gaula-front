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

/**
 * Un Badge pinta su tono como TEXTO sobre `surface-sunken`. Cuando sunken se
 * oscureció a slate-200 para que las tarjetas tuvieran relieve (ecb4764), alert
 * y stable bajaron a 4,0:1 y nadie lo vio hasta que axe corrió sobre un
 * vehículo «En misión» (SPEC-0509). Esta prueba mide cada tono sobre cada
 * superficie, en los dos temas, con la fórmula de WCAG.
 */
describe('contraste de los tonos de estado', () => {
  const primitives = readFileSync(join(process.cwd(), 'src/design-system/tokens/primitives.css'), 'utf8')
  const semantic = readFileSync(join(process.cwd(), 'src/design-system/tokens/semantic.css'), 'utf8')

  function declarations(css: string): Map<string, string> {
    const map = new Map<string, string>()
    for (const [, name, value] of css.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)) {
      if (name && value && !map.has(name)) map.set(name, value.trim())
    }
    return map
  }

  const prims = declarations(primitives)
  const light = declarations(semantic.slice(0, semantic.indexOf(":root[data-theme='dark']")))
  const dark = declarations(semantic.slice(semantic.indexOf(":root[data-theme='dark']")))

  function resolve(token: string, theme: Map<string, string>): string {
    let value = theme.get(token) ?? prims.get(token)
    for (let depth = 0; value?.startsWith('var(') && depth < 5; depth += 1) {
      const ref = value.slice(4, -1).trim()
      value = theme.get(ref) ?? prims.get(ref)
    }
    if (!value) throw new Error(`token sin valor: ${token}`)
    return value
  }

  /** Luminancia relativa desde `#rrggbb` u `oklch(L C h)`. */
  function luminance(color: string): number {
    let linear: number[]
    if (color.startsWith('#')) {
      linear = [1, 3, 5].map((i) => {
        const c = parseInt(color.slice(i, i + 2), 16) / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      })
    } else {
      const [L, C, h] = color.replace(/oklch\(|\)/g, '').trim().split(/\s+/).map(Number) as [number, number, number]
      const a = C * Math.cos((h * Math.PI) / 180)
      const b = C * Math.sin((h * Math.PI) / 180)
      const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
      const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
      const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
      linear = [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
      ].map((x) => Math.min(1, Math.max(0, x)))
    }
    return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
  }

  function contrast(a: string, b: string): number {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
    return (hi + 0.05) / (lo + 0.05)
  }

  const tones = ['--color-critical', '--color-alert', '--color-active', '--color-stable', '--color-text-secondary']
  const surfaces = ['--color-surface', '--color-surface-raised', '--color-surface-sunken']

  for (const [name, theme] of [['claro', light], ['oscuro', dark]] as const) {
    it(`en tema ${name}, cada tono llega a 4,5:1 sobre cada superficie`, () => {
      const failures: string[] = []
      for (const tone of tones) {
        for (const surface of surfaces) {
          const ratio = contrast(resolve(tone, theme), resolve(surface, theme))
          if (ratio < 4.5) failures.push(`${tone} sobre ${surface}: ${ratio.toFixed(2)}:1`)
        }
      }
      expect(failures).toEqual([])
    })
  }
})
