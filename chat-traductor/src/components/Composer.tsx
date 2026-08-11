import { useEffect, useRef, useState } from 'react'
import type { Strings } from '../lib/i18n'
import { langLabel } from '../lib/i18n'
import type { Lang } from '../lib/types'

interface Props {
  strings: Strings
  lang: Lang
  disabled?: boolean
  onSend: (text: string) => void
  onTyping: () => void
  onStopped: () => void
}

const MAX_HEIGHT = 140

export function Composer({
  strings,
  lang,
  disabled,
  onSend,
  onTyping,
  onStopped,
}: Props) {
  const [value, setValue] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  // Alto automático hasta un tope, para que el teclado no se coma la pantalla.
  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    area.style.height = 'auto'
    area.style.height = `${Math.min(area.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  const submit = () => {
    const text = value.trim()
    if (!text || disabled) return
    setValue('')
    onStopped()
    onSend(text)
    areaRef.current?.focus()
  }

  return (
    <form
      className="safe-bottom border-t border-line bg-ink px-3 pt-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="flex items-end gap-2">
        <span
          className="meta pb-3"
          style={{ color: `var(--lang-${lang})` }}
          aria-hidden="true"
        >
          {langLabel[lang]}
        </span>

        <textarea
          ref={areaRef}
          rows={1}
          value={value}
          lang={lang}
          disabled={disabled}
          aria-label={strings.placeholder}
          placeholder={strings.placeholder}
          className="field max-h-[140px] flex-1 resize-none py-2"
          onChange={(event) => {
            setValue(event.target.value)
            if (event.target.value.trim()) onTyping()
          }}
          onBlur={onStopped}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />

        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="btn mb-[1px] px-4 py-2"
        >
          {strings.send}
        </button>
      </div>
    </form>
  )
}
