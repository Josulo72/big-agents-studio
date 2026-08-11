import { useCallback, useEffect, useState } from 'react'
import { CONFIGURED_ROOM_ID, supabase } from '../lib/supabase'
import { langLabel, t } from '../lib/i18n'
import type { Lang } from '../lib/types'

interface Slot {
  room_id: string
  lang: Lang
  display_name: string
  claimed_by: string | null
}

/**
 * Única pantalla antes del chat, y solo la primera vez en cada dispositivo.
 * No pide credenciales: se toca un nombre y ya. RLS solo deja ver las plazas
 * libres, así que en cuanto las dos están cogidas aquí no queda nada que tocar.
 *
 * Es bilingüe a la vez porque todavía no se sabe el idioma de quien mira.
 */
export function ClaimSlot({ onClaimed }: { onClaimed: () => void }) {
  const es = t('es')
  const bg = t('bg')

  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [claiming, setClaiming] = useState<Lang | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    let query = supabase
      .from('room_slots')
      .select('room_id, lang, display_name, claimed_by')
      .is('claimed_by', null)
    if (CONFIGURED_ROOM_ID) query = query.eq('room_id', CONFIGURED_ROOM_ID)

    const { data, error: loadError } = await query.returns<Slot[]>()
    if (loadError) {
      setError(loadError.message)
      setSlots([])
      return
    }
    setSlots(data ?? [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const claim = async (slot: Slot) => {
    setClaiming(slot.lang)
    setError(null)

    const { error: rpcError } = await supabase.rpc('claim_slot', {
      p_room: slot.room_id,
      p_lang: slot.lang,
    })

    setClaiming(null)
    if (rpcError) {
      // La plaza pudo caer entre que se pintó la lista y se pulsó.
      setError(rpcError.message)
      void load()
      return
    }
    onClaimed()
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-sm flex-col justify-center px-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        ¿Quién eres?
        <span className="block text-muted">Кой си ти?</span>
      </h1>

      {slots === null ? (
        <p className="meta mt-6">{es.loading}</p>
      ) : slots.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          {es.noFreeSlots}
          <span className="mt-1 block">{bg.noFreeSlots}</span>
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {slots.map((slot) => (
            <button
              key={`${slot.room_id}:${slot.lang}`}
              type="button"
              onClick={() => void claim(slot)}
              disabled={claiming !== null}
              className="btn flex items-center gap-3 px-4 py-3 text-left"
              style={{ borderColor: `var(--lang-${slot.lang})` }}
            >
              <span className="meta" style={{ color: `var(--lang-${slot.lang})` }}>
                {langLabel[slot.lang]}
              </span>
              <span className="flex-1 text-base">{slot.display_name}</span>
              {claiming === slot.lang && <span className="meta">···</span>}
            </button>
          ))}
        </div>
      )}

      <p className="meta mt-6 leading-relaxed">
        {es.claimHint}
        <span className="mt-1 block">{bg.claimHint}</span>
      </p>

      {error && (
        <p className="mt-4 text-sm" style={{ color: 'var(--lang-es)' }}>
          {error}
        </p>
      )}
    </main>
  )
}
