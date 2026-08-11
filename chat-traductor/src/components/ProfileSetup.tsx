import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { t } from '../lib/i18n'
import type { Lang } from '../lib/types'

/**
 * Solo aparece si el usuario autenticado todavía no tiene fila en `profiles`.
 * Lo normal es crear los perfiles con `supabase/seed.sql`; esto es la red de
 * seguridad para el primer arranque.
 */
export function ProfileSetup({
  userId,
  onDone,
}: {
  userId: string
  onDone: () => void
}) {
  const [name, setName] = useState('')
  const [lang, setLang] = useState<Lang>('es')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const strings = t(lang)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    const { error: insertError } = await supabase
      .from('profiles')
      .upsert({ id: userId, display_name: name.trim(), lang })

    setSaving(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    onDone()
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-sm flex-col justify-center px-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight">
        {strings.profileTitle}
      </h1>
      <p className="mt-2 text-sm text-muted">{strings.profileHint}</p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="meta" htmlFor="display-name">
            {strings.displayName}
          </label>
          <input
            id="display-name"
            className="field"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={40}
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="meta mb-2">{strings.language}</legend>
          <div className="flex gap-2">
            {(['es', 'bg'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setLang(option)}
                aria-pressed={lang === option}
                className="btn flex-1"
                style={
                  lang === option
                    ? {
                        borderColor: `var(--lang-${option})`,
                        color: `var(--lang-${option})`,
                      }
                    : undefined
                }
              >
                {option === 'es' ? strings.spanish : strings.bulgarian}
              </button>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn" disabled={saving}>
          {saving ? strings.saving : strings.save}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm" style={{ color: 'var(--lang-es)' }}>
          {error}
        </p>
      )}
    </main>
  )
}
