import { createClient } from '@supabase/supabase-js'
import { readConfig } from './config'

const config = readConfig()

/**
 * Si todavía no hay configuración, la app enseña la pantalla de ajuste y no
 * llega a usar este cliente. Se crea igualmente con valores de relleno para
 * que el módulo pueda importarse sin reventar; al guardar la configuración se
 * recarga la página y aquí ya hay valores buenos.
 */
export const hasConfig = config !== null

export const supabase = createClient(
  config?.url ?? 'https://sin-configurar.supabase.co',
  config?.anonKey ?? 'sin-configurar',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  },
)

/** Sala fijada por configuración; si no, se usa la primera de la que soy miembro. */
export const CONFIGURED_ROOM_ID = import.meta.env.VITE_ROOM_ID?.trim() || null
