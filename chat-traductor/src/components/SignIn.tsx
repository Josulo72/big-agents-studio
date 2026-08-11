import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { t } from '../lib/i18n'

/**
 * Acceso por magic link. No hay registro: los dos usuarios se crean a mano en
 * el panel de Supabase y el signup público queda desactivado.
 *
 * Antes de entrar no se sabe el idioma del usuario, así que esta pantalla es
 * la única bilingüe a la vez.
 */
export function SignIn() {
  const es = t('es')
  const bg = t('bg')

  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!email.trim()) return
    setState('sending')
    setError(null)

    const { error: signInError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    })

    if (signInError) {
      setError(signInError.message)
      setState('idle')
      return
    }
    setState('sent')
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-sm flex-col justify-center px-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {es.signInTitle}
        <span className="text-muted"> · </span>
        <span style={{ color: 'var(--lang-bg)' }}>{bg.signInTitle}</span>
      </h1>
      <p className="mt-2 text-sm text-muted">
        {es.signInHint} <span className="text-muted">{bg.signInHint}</span>
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        <label className="meta" htmlFor="email">
          {es.emailLabel} · {bg.emailLabel}
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="field"
          placeholder="tu@correo.com"
        />
        <button type="submit" className="btn" disabled={state === 'sending'}>
          {state === 'sending' ? es.sending : es.sendLink}
        </button>
      </form>

      {state === 'sent' && (
        <p className="mt-4 text-sm animate-fade-in" style={{ color: 'var(--lang-bg)' }}>
          {es.linkSent} · {bg.linkSent}
        </p>
      )}
      {error && (
        <p className="mt-4 text-sm animate-fade-in" style={{ color: 'var(--lang-es)' }}>
          {error}
        </p>
      )}
    </main>
  )
}
