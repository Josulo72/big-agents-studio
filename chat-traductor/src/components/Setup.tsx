import { useState } from 'react'
import { SUGGESTED_URL, looksValid, saveConfig } from '../lib/config'

/**
 * Primera pantalla, y solo una vez por dispositivo: a qué Supabase conectarse.
 *
 * Existe para que la app se pueda publicar sin tener la clave en el momento de
 * compilar. La clave anónima no es un secreto — va en el bundle de cualquier
 * app de Supabase — así que guardarla aquí no expone nada que no estuviera ya.
 */
export function Setup() {
  const [url, setUrl] = useState(SUGGESTED_URL)
  const [anonKey, setAnonKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    const config = { url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() }

    const problema = looksValid(config)
    if (problema) {
      setError(problema)
      return
    }

    saveConfig(config)
    // Recarga para que el cliente de Supabase se cree ya con estos valores.
    window.location.reload()
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-sm flex-col justify-center px-5 py-8">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Conectar</h1>
      <p className="mt-2 text-sm text-muted">
        Solo la primera vez en este dispositivo.
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label className="meta" htmlFor="url">
            URL del proyecto
          </label>
          <input
            id="url"
            className="field"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="meta" htmlFor="key">
            Clave anónima (anon / public)
          </label>
          <textarea
            id="key"
            className="field min-h-[88px] resize-none font-mono text-[12px]"
            value={anonKey}
            onChange={(event) => setAnonKey(event.target.value)}
            placeholder="eyJhbGciOi…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <button type="submit" className="btn">
          Entrar
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm" style={{ color: 'var(--lang-es)' }}>
          {error}
        </p>
      )}

      <p className="meta mt-6 leading-relaxed">
        La clave está en Supabase, en <em>Project Settings → API Keys</em>, en la
        fila <em>anon / public</em>. Tiene botón de copiar. No es un secreto: va
        dentro de cualquier app de Supabase, y lo que protege la conversación son
        las políticas de la base de datos.
      </p>
    </main>
  )
}
