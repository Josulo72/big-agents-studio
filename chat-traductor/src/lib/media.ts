import { supabase } from './supabase'

export const BUCKET = 'media'

/** Enlaces firmados: caducan, así que se cachean con su fecha de caducidad. */
const cache = new Map<string, { url: string; expiresAt: number }>()
const VIDA_SEGUNDOS = 3600

export async function signedUrl(path: string): Promise<string | null> {
  const cached = cache.get(path)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, VIDA_SEGUNDOS)

  if (error || !data?.signedUrl) {
    console.error('No se pudo firmar el adjunto', path, error)
    return null
  }
  cache.set(path, {
    url: data.signedUrl,
    expiresAt: Date.now() + VIDA_SEGUNDOS * 1000,
  })
  return data.signedUrl
}

export function esImagen(mime: string | null | undefined) {
  return !!mime && mime.startsWith('image/')
}

/** Nombre seguro para el almacén, conservando la extensión. */
export function nombreSeguro(nombre: string) {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(-60)
  return limpio || 'archivo'
}

export function tamanoLegible(bytes: number | null | undefined) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Lee el tamaño de una imagen sin subirla, para reservar sitio en la burbuja. */
export function medirImagen(
  file: File,
): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) return resolve(null)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve(null)
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}
