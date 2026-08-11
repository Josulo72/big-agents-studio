#!/usr/bin/env node
/**
 * Comprueba que en `dist/` no ha acabado ninguna clave que deba vivir solo en
 * los secrets de Supabase (criterio de aceptación §9 del brief).
 *
 *   npm run build && npm run check:secrets
 *
 * Falla si encuentra:
 *   - una clave de DeepL (uuid + sufijo `:fx` opcional, o la variable por nombre)
 *   - un JWT de Supabase con rol `service_role`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const PATTERNS = [
  {
    label: 'clave de DeepL',
    regex: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:fx/gi,
  },
  { label: 'nombre de secret DEEPL_API_KEY', regex: /DEEPL_API_KEY/g },
  { label: 'nombre de secret SERVICE_ROLE', regex: /SERVICE_ROLE_KEY/g },
  // Un JWT de Supabase lleva el rol en el payload, codificado en base64url.
  {
    label: 'JWT con rol service_role',
    regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}/g,
  },
]

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else out.push(full)
  }
  return out
}

let files
try {
  files = walk(DIST)
} catch {
  console.error('No existe dist/. Ejecuta `npm run build` antes.')
  process.exit(1)
}

const findings = []

for (const file of files) {
  if (/\.(png|ico|webmanifest|svg|woff2?)$/i.test(file)) continue
  const content = readFileSync(file, 'utf8')

  for (const { label, regex } of PATTERNS) {
    // Todas las coincidencias, no solo la primera: en un mismo fichero puede
    // haber un JWT anónimo legítimo y detrás uno de service_role.
    for (const [match] of content.matchAll(regex)) {
      // El JWT anónimo (`"role":"anon"`) es público por diseño y sí debe estar.
      if (label === 'JWT con rol service_role') {
        const payload = decodePayload(match)
        if (!payload || payload.role !== 'service_role') continue
      }
      findings.push(`${file}: ${label} → ${match.slice(0, 24)}…`)
    }
  }
}

function decodePayload(jwt) {
  try {
    const [, payload] = jwt.split('.')
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

if (findings.length > 0) {
  console.error('Secretos encontrados en el bundle:')
  for (const finding of findings) console.error(`  ✗ ${finding}`)
  process.exit(1)
}

console.log(`✓ ${files.length} ficheros de dist/ revisados: ningún secreto expuesto.`)
