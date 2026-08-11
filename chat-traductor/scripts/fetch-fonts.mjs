#!/usr/bin/env node
/**
 * Descarga las tres familias desde Google Fonts y las deja auto-alojadas en
 * `public/fonts`, con sus bloques `unicode-range` intactos.
 *
 *   npm run fonts
 *
 * Por qué auto-alojarlas en vez de enlazar a Google: el brief avisa del fallo
 * silencioso más típico de este proyecto — la fuente carga, el cirílico no, y
 * la app se descuadra solo para el participante búlgaro. Sirviendo los woff2
 * desde el propio origen el subset cirílico o está en el repositorio o el
 * build falla, y además no hay peticiones a terceros ni FOUT.
 *
 * Los ficheros generados se versionan; esto solo hay que relanzarlo si se
 * cambia alguna familia o peso.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'fonts')

// UA de un Chrome moderno: sin esto Google Fonts devuelve ttf en vez de woff2.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

// Solo los subsets que la app necesita de verdad.
const SUBSETS = new Set(['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext'])

const FAMILIES = [
  { family: 'Unbounded', weights: [600], slug: 'unbounded' },
  { family: 'Golos Text', weights: [400, 500], slug: 'golos-text' },
  { family: 'JetBrains Mono', weights: [400], slug: 'jetbrains-mono' },
]

async function cssFor({ family, weights }) {
  const url =
    `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@` +
    `${weights.join(';')}&display=swap`
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${family}: Google Fonts respondió ${res.status}`)
  return res.text()
}

/** Extrae los @font-face junto al comentario de subset que los precede. */
function parseFaces(css) {
  const faces = []
  const regex = /\/\*\s*([a-z-]+)\s*\*\/\s*@font-face\s*\{([^}]+)\}/g
  for (const [, subset, block] of css.matchAll(regex)) {
    const weight = block.match(/font-weight:\s*(\d+)/)?.[1]
    const src = block.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1]
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]
    if (!weight || !src || !range) continue
    faces.push({ subset, weight, src, range: range.trim() })
  }
  return faces
}

mkdirSync(OUT_DIR, { recursive: true })

const blocks = []
const seenSubsets = new Map()

for (const spec of FAMILIES) {
  const faces = parseFaces(await cssFor(spec))
  const kept = faces.filter((face) => SUBSETS.has(face.subset))

  if (kept.length === 0) {
    throw new Error(`${spec.family}: Google Fonts no devolvió ningún subset usable`)
  }

  for (const face of kept) {
    const name = `${spec.slug}-${face.weight}-${face.subset}.woff2`
    const res = await fetch(face.src, { headers: { 'User-Agent': UA } })
    if (!res.ok) throw new Error(`${name}: descarga fallida (${res.status})`)
    const bytes = Buffer.from(await res.arrayBuffer())
    writeFileSync(join(OUT_DIR, name), bytes)
    console.log(`✓ ${name} (${(bytes.length / 1024).toFixed(1)} kB)`)

    blocks.push(
      [
        `/* ${spec.family} ${face.weight} · ${face.subset} */`,
        `@font-face {`,
        `  font-family: '${spec.family}';`,
        `  font-style: normal;`,
        `  font-weight: ${face.weight};`,
        `  font-display: swap;`,
        // Relativa al propio fonts.css: así vale igual servida en la raíz de
        // un dominio que en un subdirectorio (GitHub Pages).
        `  src: url('./${name}') format('woff2');`,
        `  unicode-range: ${face.range};`,
        `}`,
      ].join('\n'),
    )
  }

  const subsets = new Set(kept.map((face) => face.subset))
  seenSubsets.set(spec.family, subsets)
}

// La comprobación que el brief pide explícitamente: las tres familias tienen
// que traer cirílico, no solo latino.
const sinCirilico = [...seenSubsets.entries()]
  .filter(([, subsets]) => !subsets.has('cyrillic'))
  .map(([family]) => family)

if (sinCirilico.length > 0) {
  throw new Error(`Sin subset cirílico: ${sinCirilico.join(', ')}`)
}

writeFileSync(
  join(OUT_DIR, 'fonts.css'),
  `/* Generado por scripts/fetch-fonts.mjs — no editar a mano. */\n\n${blocks.join('\n\n')}\n`,
)
console.log(`\n✓ fonts.css con ${blocks.length} @font-face`)
console.log('✓ las tres familias incluyen cirílico')
