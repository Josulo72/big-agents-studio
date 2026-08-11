export type Lang = 'es' | 'bg'

export type MessageStatus = 'pending' | 'translated' | 'failed'

export interface Profile {
  id: string
  display_name: string
  lang: Lang
  created_at: string
}

export interface Room {
  id: string
  name: string
  created_at: string
}

export interface Message {
  id: string
  room_id: string
  sender_id: string
  kind: 'text' | 'voice'
  source_lang: Lang
  source_text: string
  translations: Partial<Record<Lang, string>>
  status: MessageStatus
  error_detail: string | null
  media_url: string | null
  client_id: string
  created_at: string
}

/**
 * Mensaje tal y como lo maneja el cliente.
 *
 * `unsent` solo vive en memoria: marca una burbuja optimista cuyo INSERT en
 * Supabase todavía no ha ido bien. Nunca se persiste.
 */
export interface ChatMessage extends Message {
  unsent?: boolean
}

/**
 * Lo que se muestra en la burbuja.
 *
 * Regla del brief: quien escribió el mensaje lo ve siempre tal cual lo escribió.
 * El receptor ve `translations[suIdioma]` y, si esa clave no existe todavía,
 * el texto original.
 */
export function displayText(message: Message, viewerLang: Lang, isOwn: boolean) {
  if (isOwn || message.source_lang === viewerLang) {
    return { text: message.source_text, isTranslation: false }
  }
  const translated = message.translations?.[viewerLang]
  if (typeof translated === 'string' && translated.length > 0) {
    return { text: translated, isTranslation: true }
  }
  return { text: message.source_text, isTranslation: false }
}

/** ¿Debe verse el eco (texto original bajo la traducción)? */
export function hasEcho(message: Message, viewerLang: Lang, isOwn: boolean) {
  return displayText(message, viewerLang, isOwn).isTranslation
}
