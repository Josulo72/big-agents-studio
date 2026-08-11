import type { ChatMessage, Message } from './types'

/** Orden estable: por fecha y, a igualdad, por id. */
export function compareMessages(a: Message, b: Message) {
  if (a.created_at === b.created_at) return a.id < b.id ? -1 : 1
  return a.created_at < b.created_at ? -1 : 1
}

/**
 * Fusiona filas nuevas sobre el estado actual.
 *
 * La clave es `client_id`, no `id`: así una burbuja optimista y la fila real
 * que llega por Realtime son el mismo mensaje y nunca se pinta dos veces.
 *
 * Los eventos de Realtime pueden llegar desordenados (el UPDATE con la
 * traducción antes que el INSERT). Por eso un payload `pending` nunca degrada
 * un mensaje que ya está traducido.
 *
 * Devuelve la referencia anterior si nada cambia, para no repintar de balde.
 */
export function mergeMessages(prev: ChatMessage[], incoming: Message[]): ChatMessage[] {
  if (incoming.length === 0) return prev

  const byClient = new Map<string, ChatMessage>()
  for (const message of prev) byClient.set(message.client_id, message)

  let changed = false
  for (const next of incoming) {
    const current = byClient.get(next.client_id)
    if (current) {
      if (current.status === 'translated' && next.status === 'pending') continue
      if (
        current.id === next.id &&
        current.status === next.status &&
        current.error_detail === next.error_detail &&
        JSON.stringify(current.translations) === JSON.stringify(next.translations)
      ) {
        continue
      }
    }
    byClient.set(next.client_id, { ...next, unsent: false })
    changed = true
  }

  if (!changed) return prev
  return [...byClient.values()].sort(compareMessages)
}
