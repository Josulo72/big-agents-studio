import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

/**
 * Una única sesión anónima en vuelo por pestaña. Sin este candado, el doble
 * montaje de StrictMode (o dos efectos a la vez) crearía dos usuarios anónimos
 * y el segundo se quedaría sin plaza.
 */
let anonymousSignIn: Promise<unknown> | null = null

function ensureAnonymousSession() {
  anonymousSignIn ??= supabase.auth.signInAnonymously().then((result) => {
    anonymousSignIn = null
    if (result.error) throw result.error
    return result
  })
  return anonymousSignIn
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    void (async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return

      if (data.session) {
        setSession(data.session)
        setReady(true)
        return
      }

      // Sin sesión: se abre una anónima sin pedirle nada al usuario. Es lo que
      // da un `auth.uid()` real y mantiene el RLS en pie sin pantalla de login.
      try {
        await ensureAnonymousSession()
      } catch (err) {
        if (!active) return
        setError(err instanceof Error ? err.message : String(err))
        setReady(true)
      }
    })()

    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setReady(true)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return { session, ready, error }
}
