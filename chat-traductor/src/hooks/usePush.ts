import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { b64urlToBytes } from '../lib/base64'
import type { Profile } from '../lib/types'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY?.trim() || ''

export type PushState =
  | 'unsupported' // el navegador no puede, o iOS sin instalar en pantalla de inicio
  | 'unconfigured' // falta la clave VAPID
  | 'denied' // el usuario dijo que no
  | 'off'
  | 'on'
  | 'working'

/**
 * Notificaciones push del navegador.
 *
 * En iOS solo existen si la app está instalada en la pantalla de inicio: el
 * `PushManager` ni aparece en Safari normal. Por eso el estado `unsupported`
 * no es un error, es lo normal hasta que se instala.
 */
export function usePush(profile: Profile | null) {
  const [state, setState] = useState<PushState>('working')

  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window

  useEffect(() => {
    if (!supported) {
      setState('unsupported')
      return
    }
    if (!VAPID_PUBLIC_KEY) {
      setState('unconfigured')
      return
    }
    if (Notification.permission === 'denied') {
      setState('denied')
      return
    }

    let active = true
    void (async () => {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (!active) return
      setState(subscription ? 'on' : 'off')
    })()

    return () => {
      active = false
    }
  }, [supported])

  const enable = useCallback(async () => {
    if (!profile || !VAPID_PUBLIC_KEY) return
    setState('working')

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      setState(permission === 'denied' ? 'denied' : 'off')
      return
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: b64urlToBytes(VAPID_PUBLIC_KEY),
        }))

      const raw = subscription.toJSON()
      if (!raw.endpoint || !raw.keys?.p256dh || !raw.keys?.auth) {
        throw new Error('Suscripción incompleta')
      }

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          endpoint: raw.endpoint,
          profile_id: profile.id,
          p256dh: raw.keys.p256dh,
          auth: raw.keys.auth,
          user_agent: navigator.userAgent.slice(0, 300),
        },
        { onConflict: 'endpoint' },
      )
      if (error) throw error

      setState('on')
    } catch (err) {
      console.error('No se pudo activar el push', err)
      setState('off')
    }
  }, [profile])

  const disable = useCallback(async () => {
    setState('working')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint)
        await subscription.unsubscribe()
      }
    } catch (err) {
      console.error('No se pudo desactivar el push', err)
    }
    setState('off')
  }, [])

  return { state, enable, disable }
}
