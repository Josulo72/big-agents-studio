import { describe, expect, it } from 'vitest'
import { mergeMessages } from './merge'
import { displayText, hasEcho, type ChatMessage, type Message } from './types'

function make(overrides: Partial<Message> = {}): Message {
  return {
    id: 'id-1',
    room_id: 'room-1',
    sender_id: 'ana',
    kind: 'text',
    source_lang: 'es',
    source_text: 'Nos vemos mañana.',
    translations: {},
    status: 'pending',
    error_detail: null,
    media_url: null,
    client_id: 'client-1',
    created_at: '2026-01-01T10:00:00.000Z',
    ...overrides,
  }
}

describe('displayText', () => {
  const translated = make({
    status: 'translated',
    translations: { bg: 'Ще се видим утре.' },
  })

  it('muestra el original a quien lo escribió, nunca la traducción', () => {
    // Aunque exista traducción al búlgaro, el autor español ve su texto.
    expect(displayText(translated, 'es', true)).toEqual({
      text: 'Nos vemos mañana.',
      isTranslation: false,
    })
  })

  it('muestra la traducción al receptor', () => {
    expect(displayText(translated, 'bg', false)).toEqual({
      text: 'Ще се видим утре.',
      isTranslation: true,
    })
  })

  it('cae al original mientras no hay traducción', () => {
    const pending = make()
    expect(displayText(pending, 'bg', false)).toEqual({
      text: 'Nos vemos mañana.',
      isTranslation: false,
    })
  })

  it('si DeepL falla, el mensaje llega igual en su idioma original', () => {
    const failed = make({ status: 'failed', error_detail: 'DeepL 456: quota' })
    expect(displayText(failed, 'bg', false).text).toBe('Nos vemos mañana.')
  })

  it('no traduce cuando emisor y receptor comparten idioma', () => {
    expect(displayText(translated, 'es', false).isTranslation).toBe(false)
  })

  it('el eco solo existe cuando hay traducción que ecoar', () => {
    expect(hasEcho(translated, 'bg', false)).toBe(true)
    expect(hasEcho(translated, 'es', true)).toBe(false)
    expect(hasEcho(make(), 'bg', false)).toBe(false)
  })
})

describe('mergeMessages', () => {
  it('deduplica la burbuja optimista contra el INSERT de Realtime', () => {
    const optimistic: ChatMessage = {
      ...make({ id: 'client-1' }), // id provisional = client_id
    }
    const fromServer = make({ id: 'server-uuid' })

    const merged = mergeMessages([optimistic], [fromServer])

    expect(merged).toHaveLength(1)
    expect(merged[0]!.id).toBe('server-uuid')
  })

  it('aplica el UPDATE con la traducción sobre el mensaje ya pintado', () => {
    const before = make({ id: 'server-uuid' })
    const after = make({
      id: 'server-uuid',
      status: 'translated',
      translations: { bg: 'Ще се видим утре.' },
    })

    const merged = mergeMessages([before], [after])

    expect(merged).toHaveLength(1)
    expect(merged[0]!.status).toBe('translated')
    expect(merged[0]!.translations.bg).toBe('Ще се видим утре.')
  })

  it('un INSERT tardío no borra una traducción ya recibida', () => {
    // Realtime puede entregar el UPDATE antes que el INSERT.
    const translated = make({
      id: 'server-uuid',
      status: 'translated',
      translations: { bg: 'Ще се видим утре.' },
    })
    const lateInsert = make({ id: 'server-uuid', status: 'pending' })

    const merged = mergeMessages([translated], [lateInsert])

    expect(merged[0]!.status).toBe('translated')
    expect(merged[0]!.translations.bg).toBe('Ще се видим утре.')
  })

  it('ordena por fecha e intercala los mensajes antiguos al paginar', () => {
    const nuevo = make({
      id: 'b',
      client_id: 'c-b',
      created_at: '2026-01-01T12:00:00.000Z',
    })
    const viejo = make({
      id: 'a',
      client_id: 'c-a',
      created_at: '2026-01-01T08:00:00.000Z',
    })

    const merged = mergeMessages([nuevo], [viejo])

    expect(merged.map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('devuelve la misma referencia si no hay nada que cambiar', () => {
    const state: ChatMessage[] = [make({ id: 'server-uuid' })]
    expect(mergeMessages(state, [make({ id: 'server-uuid' })])).toBe(state)
    expect(mergeMessages(state, [])).toBe(state)
  })
})
