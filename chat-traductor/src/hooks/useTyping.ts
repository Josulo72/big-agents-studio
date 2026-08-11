import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

const THROTTLE_MS = 1800
const EXPIRE_MS = 3500

interface TypingPayload {
  profile_id: string
  name: string
}

/**
 * "Escribiendo…" por Broadcast, no por tabla: son eventos efímeros y no
 * merecen una escritura en Postgres por cada tecla. `typing_state` queda en el
 * esquema como reserva por si el broadcast diera problemas.
 */
export function useTyping(roomId: string | null, profile: Profile | null) {
  const [typingName, setTypingName] = useState<string | null>(null)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastSentRef = useRef(0)
  const expireRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!roomId || !profile) return

    const channel = supabase.channel(`typing:${roomId}`, {
      config: { broadcast: { self: false } },
    })

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const data = payload as TypingPayload
        if (!data || data.profile_id === profile.id) return
        setTypingName(data.name)
        if (expireRef.current) clearTimeout(expireRef.current)
        expireRef.current = setTimeout(() => setTypingName(null), EXPIRE_MS)
      })
      .on('broadcast', { event: 'stop' }, ({ payload }) => {
        const data = payload as TypingPayload
        if (!data || data.profile_id === profile.id) return
        setTypingName(null)
      })
      .subscribe()

    channelRef.current = channel

    return () => {
      if (expireRef.current) clearTimeout(expireRef.current)
      channelRef.current = null
      setTypingName(null)
      void supabase.removeChannel(channel)
    }
  }, [roomId, profile])

  const notifyTyping = useCallback(() => {
    const channel = channelRef.current
    if (!channel || !profile) return
    const now = Date.now()
    if (now - lastSentRef.current < THROTTLE_MS) return
    lastSentRef.current = now
    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { profile_id: profile.id, name: profile.display_name },
    })
  }, [profile])

  const notifyStopped = useCallback(() => {
    const channel = channelRef.current
    if (!channel || !profile) return
    lastSentRef.current = 0
    void channel.send({
      type: 'broadcast',
      event: 'stop',
      payload: { profile_id: profile.id, name: profile.display_name },
    })
  }, [profile])

  return { typingName, notifyTyping, notifyStopped }
}
