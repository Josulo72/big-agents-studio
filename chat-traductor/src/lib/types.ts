export type Lang = 'es' | 'bg'

export type MessageStatus = 'pending' | 'translated' | 'failed'

export type MessageKind = 'text' | 'voice' | 'image' | 'file'

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
  kind: MessageKind
  source_lang: Lang
  source_text: string
  translations: Partial<Record<Lang, string>>
  status: MessageStatus
  error_detail: string | null
  /** Ruta dentro del almacén, no una URL pública: el enlace se firma al verlo. */
  media_url: string | null
  media_name: string | null
  media_mime: string | null
  media_size: number | null
  media_width: number | null
  media_height: number | null
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
  /** Vista previa local mientras el fichero sube. Nunca se persiste. */
  localPreview?: string
  /** 0..1 mientras sube. */
  uploading?: number
}

/** Un mensaje sin texto (una foto suelta) no tiene nada que traducir. */
export function needsTranslation(message: Message) {
  return message.source_text.trim().length > 0
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
