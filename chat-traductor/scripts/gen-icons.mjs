#!/usr/bin/env node
/**
 * Genera los iconos de la PWA sin dependencias: dos flechas opuestas, ámbar
 * (español) y jade (búlgaro), sobre el fondo `--ink`.
 *
 *   npm run icons
 *
 * Los PNG resultantes se versionan, así que esto solo hace falta si se cambia
 * la marca o la paleta.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const INK = [0x0f, 0x16, 0x20]
const AMBER = [0xe0, 0xa0, 0x40]
const JADE = [0x48, 0xad, 0xa4]

const SS = 3 // supermuestreo por eje, para bordes suaves

/** Marca en coordenadas normalizadas 0..1. `scale` encoge hacia el centro. */
function coverage(u, v, scale) {
  const x = (u - 0.5) / scale + 0.5
  const y = (v - 0.5) / scale + 0.5
  if (x < 0 || x > 1 || y < 0 || y > 1) return null

  const th = 0.075

  // Flecha superior: hacia la derecha, ámbar.
  if (inBar(x, y, 0.2, 0.68, 0.38, th) || inArrow(x, y, 0.82, 0.38, 0.64, 0.12, +1)) {
    return AMBER
  }
  // Flecha inferior: hacia la izquierda, jade.
  if (inBar(x, y, 0.32, 0.8, 0.62, th) || inArrow(x, y, 0.18, 0.62, 0.36, 0.12, -1)) {
    return JADE
  }
  return null
}

function inBar(x, y, x0, x1, yc, th) {
  return x >= x0 && x <= x1 && Math.abs(y - yc) <= th / 2
}

/** Triángulo con vértice en (ax, ay) y base en x = bx, semialtura h. */
function inArrow(x, y, ax, ay, bx, h, dir) {
  const span = (ax - bx) * dir
  const along = (ax - x) * dir
  if (along < 0 || along > span) return false
  return Math.abs(y - ay) <= (h * along) / span
}

function render(size, scale) {
  const pixels = Buffer.alloc(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (px + (sx + 0.5) / SS) / size
          const v = (py + (sy + 0.5) / SS) / size
          const color = coverage(u, v, scale) ?? INK
          r += color[0]
          g += color[1]
          b += color[2]
        }
      }
      const samples = SS * SS
      const offset = (py * size + px) * 4
      pixels[offset] = Math.round(r / samples)
      pixels[offset + 1] = Math.round(g / samples)
      pixels[offset + 2] = Math.round(b / samples)
      pixels[offset + 3] = 255
    }
  }
  return pixels
}

// --- codificador PNG mínimo (RGBA, sin filtros) ----------------------------

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0)
  return Buffer.concat([length, body, crc])
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ -1
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[12] = 0

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0 // filtro "none"
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true })

const outputs = [
  ['icon-192.png', 192, 0.78],
  ['icon-512.png', 512, 0.78],
  ['apple-touch-icon.png', 180, 0.72],
  // Maskable: la marca cabe en la zona segura del 60 %.
  ['maskable-512.png', 512, 0.56],
]

for (const [name, size, scale] of outputs) {
  writeFileSync(join(OUT_DIR, name), encodePng(size, render(size, scale)))
  console.log(`✓ ${name} (${size}×${size})`)
}
