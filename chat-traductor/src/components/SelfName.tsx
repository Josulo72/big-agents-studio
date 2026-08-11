import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { langLabel, type Strings } from '../lib/i18n'
import type { Profile } from '../lib/types'

/**
 * Tu propio nombre, tocable para cambiarlo.
 *
 * Cada uno solo puede cambiar el suyo: la política de RLS de `profiles` deja
 * actualizar únicamente la fila propia. Existe para no tener que entrar al
 * panel de Supabase por algo tan tonto como corregir un nombre.
 */
export function SelfName({
  profile,
  strings,
  onRenamed,
}: {
  profile: Profile
  strings: Strings
  onRenamed: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(profile.display_name)
  const [saving, setSaving] = useState(false)

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    const name = value.trim()
    if (!name || name === profile.display_name) {
      setEditing(false)
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name })
      .eq('id', profile.id)
    setSaving(false)
    if (error) {
      console.error('No se pudo cambiar el nombre', error)
      return
    }
    setEditing(false)
    onRenamed()
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(profile.display_name)
          setEditing(true)
        }}
        title={strings.yourName}
        className="meta flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 transition-colors duration-150 hover:bg-white/20 hover:text-text"
      >
        <span style={{ color: `var(--lang-${profile.lang})` }}>
          {langLabel[profile.lang]}
        </span>
        <span>{profile.display_name}</span>
      </button>
    )
  }

  return (
    <form onSubmit={save} className="flex shrink-0 items-center gap-1">
      <input
        autoFocus
        value={value}
        maxLength={40}
        onChange={(event) => setValue(event.target.value)}
        onBlur={save}
        aria-label={strings.yourName}
        className="field w-28 px-2 py-1 text-[13px]"
      />
      <button type="submit" className="meta px-1" disabled={saving}>
        ✓
      </button>
    </form>
  )
}
