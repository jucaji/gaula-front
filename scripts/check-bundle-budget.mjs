#!/usr/bin/env node
// S0.FE.09 / docs/07 §7: presupuesto de bundle. Corre después de `vite build`.
// Dos reglas, ambas sobre el tamaño COMPRIMIDO (gzip) de dist/assets/*.{js,css}:
//   1. Techo absoluto: 180 KB (docs/07 §7 "Bundle inicial < 180 KB comprimido").
//   2. Trinquete: no crecer más de 10% respecto al último build que pasó
//      ("si el bundle inicial crece más de un 10 %, el build falla").
// El estado del trinquete vive en .bundle-budget.json, versionado en git --
// así el "10% respecto a qué" es reproducible y no depende de quién corrió
// el build antes.
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DIST_ASSETS = join(ROOT, 'dist', 'assets')
const BUDGET_FILE = join(ROOT, '.bundle-budget.json')
const HARD_CEILING_BYTES = 180 * 1024
const GROWTH_TOLERANCE = 0.10

function currentGzipSize() {
  if (!existsSync(DIST_ASSETS)) {
    console.error(`No existe ${DIST_ASSETS} -- corre "pnpm build" antes de este script.`)
    process.exit(1)
  }
  const files = readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.js') || f.endsWith('.css'))
  let total = 0
  for (const file of files) {
    const path = join(DIST_ASSETS, file)
    if (!statSync(path).isFile()) continue
    total += gzipSync(readFileSync(path)).length
  }
  return total
}

function readBaseline() {
  if (!existsSync(BUDGET_FILE)) return null
  return JSON.parse(readFileSync(BUDGET_FILE, 'utf8')).gzipBytes
}

function writeBaseline(bytes) {
  writeFileSync(BUDGET_FILE, JSON.stringify({ gzipBytes: bytes, updatedAt: new Date().toISOString() }, null, 2) + '\n')
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1)
}

const current = currentGzipSize()
const baseline = readBaseline()

console.log(`Bundle inicial (gzip): ${kb(current)} KB`)

if (current > HARD_CEILING_BYTES) {
  console.error(`FALLO: ${kb(current)} KB supera el techo absoluto de ${kb(HARD_CEILING_BYTES)} KB (docs/07 §7).`)
  process.exit(1)
}

if (baseline !== null) {
  const maxAllowed = baseline * (1 + GROWTH_TOLERANCE)
  if (current > maxAllowed) {
    console.error(
      `FALLO: ${kb(current)} KB crece más de ${GROWTH_TOLERANCE * 100}% sobre el baseline de ${kb(baseline)} KB ` +
        `(máximo permitido: ${kb(maxAllowed)} KB). Si el crecimiento está justificado, actualiza ${BUDGET_FILE} a mano.`,
    )
    process.exit(1)
  }
}

writeBaseline(current)
console.log(baseline === null ? 'Baseline inicial guardado.' : `OK -- dentro del presupuesto (baseline: ${kb(baseline)} KB).`)
