/**
 * Configuración de conexión a Supabase.
 *
 * Se busca primero en el almacenamiento del navegador y, si no, en las
 * variables de compilación. Poder darla en caliente es lo que permite publicar
 * la app sin tener la clave a mano: se pega una vez en el propio dispositivo.
 *
 * Nada de esto es secreto. La clave anónima está pensada para vivir en el
 * cliente; lo que protege los datos es RLS.
 */

const STORAGE_KEY = 'chat.supabase.config'

export interface SupabaseConfig {
  url: string
  anonKey: string
}

/** Se prerrellena para que solo haya que pegar la clave. */
export const SUGGESTED_URL = 'https://zcxvvjjxfhynduyysqvl.supabase.co'

function fromStorage(): SupabaseConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SupabaseConfig>
    if (!parsed.url || !parsed.anonKey) return null
    return { url: parsed.url, anonKey: parsed.anonKey }
  } catch {
    return null
  }
}

function fromEnv(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) return null
  return { url, anonKey }
}

export function readConfig(): SupabaseConfig | null {
  return fromStorage() ?? fromEnv()
}

export function saveConfig(config: SupabaseConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function clearConfig(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Comprobación barata antes de intentar conectar y fallar con un error feo. */
export function looksValid(config: SupabaseConfig): string | null {
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.url.trim())) {
    return 'La URL debe ser como https://xxxx.supabase.co'
  }
  // Las claves anónimas son un JWT (tres partes) o el formato sb_publishable_.
  const key = config.anonKey.trim()
  const esJwt = key.split('.').length === 3 && key.startsWith('ey')
  const esPublishable = key.startsWith('sb_publishable_')
  if (!esJwt && !esPublishable) {
    return 'Esa no parece la clave anónima (debe empezar por «ey» o «sb_publishable_»)'
  }
  return null
}
