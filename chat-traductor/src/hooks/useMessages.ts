import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { compareMessages, mergeMessages } from '../lib/merge'
import type { ChatMessage, Message, Profile } from '../lib/types'

export const PAGE_SIZE = 30

/** Por debajo de esto, volver a primer plano no justifica resuscribirse. */
const BACKGROUND_GRACE_MS = 3_000

const SYNC_PAGE_SIZE = 200
const SYNC_MAX_PAGES = 10

export type Connection = 'connecting' | 'connected' | 'error'

const COLUMNS =
  'id, room_id, sender_id, kind, source_lang, source_text, translations, status, error_detail, media_url, client_id, created_at'

interface Options {
  roomId: string | null
  profile: Profile | null
}

export function useMessages({ roomId, profile }: Options) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [connection, setConnection] = useState<Connection>('connecting')

  const messagesRef = useRef<ChatMessage[]>([])
  messagesRef.current = messages

  const apply = useCallback((incoming: Message[]) => {
    setMessages((prev) => mergeMessages(prev, incoming))
  }, [])

  // --- Carga inicial ------------------------------------------------------
  useEffect(() => {
    if (!roomId) {
      setMessages([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setMessages([])

    void (async () => {
      const { data, error } = await supabase
        .from('messages')
        .select(COLUMNS)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
        .returns<Message[]>()

      if (!active) return
      if (error) {
        console.error('No se pudieron cargar los mensajes', error)
        setLoading(false)
        return
      }
      const page = (data ?? []).slice().reverse()
      setMessages(page.map((m) => ({ ...m })))
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
      setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [roomId])

  // --- Paginación hacia arriba -------------------------------------------
  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0]
    if (!roomId || !oldest || loadingOlder) return
    setLoadingOlder(true)

    const { data, error } = await supabase
      .from('messages')
      .select(COLUMNS)
      .eq('room_id', roomId)
      .lt('created_at', oldest.created_at)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
      .returns<Message[]>()

    if (error) {
      console.error('No se pudieron cargar mensajes anteriores', error)
      setLoadingOlder(false)
      return
    }
    apply((data ?? []).slice().reverse())
    setHasMore((data?.length ?? 0) === PAGE_SIZE)
    setLoadingOlder(false)
  }, [roomId, loadingOlder, apply])

  // --- Resincronización ---------------------------------------------------
  /**
   * Recupera lo que se haya perdido mientras el WebSocket estaba caído
   * (móvil bloqueado, túnel, cambio de red):
   *   1. todo lo posterior a la última marca temporal conocida,
   *   2. y además el estado actual de los mensajes que aún no están
   *      traducidos, porque su UPDATE pudo perderse.
   */
  const sync = useCallback(async () => {
    if (!roomId) return
    const current = messagesRef.current

    // La marca se toma solo de mensajes confirmados por el servidor: la fecha
    // de una burbuja optimista viene del reloj del móvil y, si va adelantado,
    // dejaría fuera justo lo que hay que recuperar.
    const confirmed = current.filter((m) => !m.unsent && m.id !== m.client_id)
    if (confirmed.length === 0) return
    let since = confirmed[confirmed.length - 1]!.created_at

    const stalePromise = (async () => {
      const ids = confirmed
        .filter((m) => m.status !== 'translated')
        .map((m) => m.id)
        .slice(-50)
      if (ids.length === 0) return [] as Message[]
      const { data } = await supabase
        .from('messages')
        .select(COLUMNS)
        .in('id', ids)
        .returns<Message[]>()
      return data ?? []
    })()

    // Se pagina hasta agotar: con una página corta se perderían los mensajes
    // más recientes, que son precisamente los que interesan.
    for (let page = 0; page < SYNC_MAX_PAGES; page++) {
      const { data, error } = await supabase
        .from('messages')
        .select(COLUMNS)
        .eq('room_id', roomId)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(SYNC_PAGE_SIZE)
        .returns<Message[]>()

      if (error) {
        console.error('Fallo al resincronizar', error)
        break
      }
      if (!data || data.length === 0) break

      apply(data)
      if (data.length < SYNC_PAGE_SIZE) break
      since = data[data.length - 1]!.created_at
    }

    apply(await stalePromise)
  }, [roomId, apply])

  const syncRef = useRef(sync)
  syncRef.current = sync

  // --- Realtime -----------------------------------------------------------
  // `epoch` fuerza una resuscripción limpia al volver del segundo plano.
  const [epoch, setEpoch] = useState(0)

  useEffect(() => {
    if (!roomId) return
    setConnection('connecting')

    const filter = `room_id=eq.${roomId}`
    const channel: RealtimeChannel = supabase
      .channel(`messages:${roomId}:${epoch}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter },
        (payload) => apply([payload.new as Message]),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter },
        (payload) => apply([payload.new as Message]),
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setConnection('connected')
          // Primero el canal, después el refetch: así no hay ventana ciega
          // entre lo que trae el fetch y lo que empieza a emitir Realtime.
          void syncRef.current()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnection('error')
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, epoch, apply])

  // --- Vuelta del segundo plano ------------------------------------------
  useEffect(() => {
    if (!roomId) return

    // Resuscribirse: en móvil el WebSocket muere al bloquear la pantalla y el
    // cliente no siempre se entera. El `sync` va dentro del callback de
    // `subscribe`, ya con el canal vivo.
    const reconnect = () => setEpoch((n) => n + 1)

    let hiddenSince = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenSince = Date.now()
        return
      }
      // Cambiar de pestaña un segundo no tumba el WebSocket: solo se
      // resuscribe si ha estado oculta el tiempo suficiente.
      const away = hiddenSince ? Date.now() - hiddenSince : Infinity
      hiddenSince = 0
      if (away > BACKGROUND_GRACE_MS) reconnect()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', reconnect)
    window.addEventListener('pageshow', reconnect)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', reconnect)
      window.removeEventListener('pageshow', reconnect)
    }
  }, [roomId])

  // --- Traducción ---------------------------------------------------------
  const translate = useCallback(
    async (messageId: string) => {
      const { error } = await supabase.functions.invoke('translate-message', {
        body: { message_id: messageId },
      })
      if (error) {
        console.error('translate-message', error)
        return
      }
      // La fila de la base de datos manda. Se relee por si Realtime no está.
      const { data } = await supabase
        .from('messages')
        .select(COLUMNS)
        .eq('id', messageId)
        .maybeSingle<Message>()
      if (data) apply([data])
    },
    [apply],
  )

  // --- Envío --------------------------------------------------------------
  const persist = useCallback(
    async (draft: ChatMessage) => {
      const { data, error } = await supabase
        .from('messages')
        .insert({
          room_id: draft.room_id,
          sender_id: draft.sender_id,
          source_lang: draft.source_lang,
          source_text: draft.source_text,
          client_id: draft.client_id,
        })
        .select(COLUMNS)
        .maybeSingle<Message>()

      if (error) {
        // 23505: el índice único de `client_id` ya tenía la fila. El envío
        // anterior sí llegó, así que se recupera en vez de duplicarla.
        if (error.code === '23505') {
          const { data: existing } = await supabase
            .from('messages')
            .select(COLUMNS)
            .eq('client_id', draft.client_id)
            .maybeSingle<Message>()
          if (existing) {
            apply([existing])
            void translate(existing.id)
            return
          }
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.client_id === draft.client_id
              ? { ...m, unsent: true, status: 'failed', error_detail: error.message }
              : m,
          ),
        )
        return
      }

      if (data) {
        apply([data])
        void translate(data.id)
      }
    },
    [apply, translate],
  )

  const send = useCallback(
    async (text: string) => {
      const body = text.trim()
      if (!body || !roomId || !profile) return

      const clientId = crypto.randomUUID()
      const draft: ChatMessage = {
        id: clientId, // provisional hasta que el servidor confirme
        room_id: roomId,
        sender_id: profile.id,
        kind: 'text',
        source_lang: profile.lang,
        source_text: body,
        translations: {},
        status: 'pending',
        error_detail: null,
        media_url: null,
        client_id: clientId,
        created_at: new Date().toISOString(),
      }

      setMessages((prev) => [...prev, draft].sort(compareMessages))
      await persist(draft)
    },
    [roomId, profile, persist],
  )

  const retry = useCallback(
    async (message: ChatMessage) => {
      if (message.unsent) {
        setMessages((prev) =>
          prev.map((m) =>
            m.client_id === message.client_id
              ? { ...m, status: 'pending', error_detail: null }
              : m,
          ),
        )
        await persist({ ...message, status: 'pending', error_detail: null })
        return
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.client_id === message.client_id
            ? { ...m, status: 'pending', error_detail: null }
            : m,
        ),
      )
      await translate(message.id)
    },
    [persist, translate],
  )

  return {
    messages,
    loading,
    loadingOlder,
    hasMore,
    connection,
    loadOlder,
    send,
    retry,
    sync,
  }
}
