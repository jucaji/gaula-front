#!/usr/bin/env node
// S0.FE.09 / docs/07 §7: presupuesto de bundle. Corre después de `vite build`.
// Dos reglas, ambas sobre el tamaño COMPRIMIDO (gzip) del bundle INICIAL:
//   1. Techo absoluto: 180 KB (docs/07 §7 "Bundle inicial < 180 KB comprimido").
//   2. Trinquete: no crecer más de 10% respecto al último build que pasó
//      ("si el bundle inicial crece más de un 10 %, el build falla").
// El estado del trinquete vive en .bundle-budget.json, versionado en git --
// así el "10% respecto a qué" es reproducible y no depende de quién corrió
// el build antes.
//
// HALLAZGO real (Sprint 1, al agregar DataTable a /casos): sumar TODO
// dist/assets/*.{js,css} sin distinción estaba MAL desde que
// `autoCodeSplitting` empezó a generar chunks de verdad por ruta -- un
// chunk cargado sólo al entrar a /casos (TanStack Table + Virtual) no es
// "bundle inicial", y sumarlo igual disparaba un FALLO falso. La única
// fuente confiable de qué SÍ es inicial es lo que `dist/index.html`
// referencia directamente (`<script type="module">` y
// `<link rel="stylesheet">`) -- cualquier otro chunk es, por definición,
// código dividido por ruta que carga después, bajo demanda.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DIST_DIR = join(ROOT, 'dist')
const INDEX_HTML = join(DIST_DIR, 'index.html')
const BUDGET_FILE = join(ROOT, '.bundle-budget.json')
const HARD_CEILING_BYTES = 180 * 1024
const GROWTH_TOLERANCE = 0.10

function initialLoadAssetPaths() {
  if (!existsSync(INDEX_HTML)) {
    console.error(`No existe ${INDEX_HTML} -- corre "pnpm build" antes de este script.`)
    process.exit(1)
  }
  const html = readFileSync(INDEX_HTML, 'utf8')
  const matches = html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)
  return [...matches].map((m) => m[1])
}

function currentGzipSize() {
  const paths = initialLoadAssetPaths()
  let total = 0
  for (const assetPath of paths) {
    total += gzipSync(readFileSync(join(DIST_DIR, assetPath.replace(/^\//, '')))).length
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
