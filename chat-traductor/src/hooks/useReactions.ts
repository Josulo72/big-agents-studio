import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

export interface Reaction {
  message_id: string
  profile_id: string
  emoji: string
}

/** Reacciones de la sala, indexadas por mensaje. */
export type ReactionMap = Map<string, Reaction[]>

function aplicar(mapa: ReactionMap, fila: Reaction, borrar: boolean): ReactionMap {
  const copia = new Map(mapa)
  const actuales = (copia.get(fila.message_id) ?? []).filter(
    (r) => r.profile_id !== fila.profile_id,
  )
  if (!borrar) actuales.push(fila)
  if (actuales.length) copia.set(fila.message_id, actuales)
  else copia.delete(fila.message_id)
  return copia
}

/**
 * Una reacción por persona y mensaje. Tocar otro emoji sustituye el tuyo;
 * tocar el mismo lo retira.
 *
 * El cambio se pinta antes de que conteste el servidor y se corrige solo si
 * falla: reaccionar tiene que sentirse instantáneo.
 */
export function useReactions(roomId: string | null, profile: Profile | null) {
  const [reactions, setReactions] = useState<ReactionMap>(new Map())
  const reactionsRef = useRef<ReactionMap>(reactions)
  reactionsRef.current = reactions

  const cargar = useCallback(async () => {
    if (!roomId) return
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, profile_id, emoji')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(1000)
      .returns<Reaction[]>()

    if (error) {
      console.error('No se pudieron cargar las reacciones', error)
      return
    }
    const mapa: ReactionMap = new Map()
    for (const fila of data ?? []) {
      mapa.set(fila.message_id, [...(mapa.get(fila.message_id) ?? []), fila])
    }
    setReactions(mapa)
  }, [roomId])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (!roomId) return
    const filtro = `room_id=eq.${roomId}`
    const channel: RealtimeChannel = supabase
      .channel(`reactions:${roomId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_reactions', filter: filtro },
        (payload) => {
          const fila = (payload.eventType === 'DELETE' ? payload.old : payload.new) as
            Reaction | undefined
          if (!fila?.message_id) return
          setReactions((previo) =>
            aplicar(previo, fila, payload.eventType === 'DELETE'),
          )
        },
      )
      .subscribe((status) => {
        // Al reconectar puede haberse perdido algún evento.
        if (status === 'SUBSCRIBED') void cargar()
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [roomId, cargar])

  const toggle = useCallback(
    async (messageId: string, emoji: string) => {
      if (!roomId || !profile) return

      const mias = (reactionsRef.current.get(messageId) ?? []).find(
        (r) => r.profile_id === profile.id,
      )
      const quitar = mias?.emoji === emoji
      const previo = reactionsRef.current

      setReactions((estado) =>
        aplicar(
          estado,
          { message_id: messageId, profile_id: profile.id, emoji },
          quitar,
        ),
      )

      const { error } = quitar
        ? await supabase
            .from('message_reactions')
            .delete()
            .eq('message_id', messageId)
            .eq('profile_id', profile.id)
        : await supabase.from('message_reactions').upsert(
            {
              message_id: messageId,
              profile_id: profile.id,
              room_id: roomId,
              emoji,
            },
            { onConflict: 'message_id,profile_id' },
          )

      if (error) {
        console.error('No se pudo guardar la reacción', error)
        setReactions(previo) // se deshace lo pintado
      }
    },
    [roomId, profile],
  )

  return { reactions, toggle }
}
