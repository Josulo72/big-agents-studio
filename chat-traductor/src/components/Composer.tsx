import { useEffect, useRef, useState } from 'react'
import type { Strings } from '../lib/i18n'
import { langLabel } from '../lib/i18n'
import type { Lang } from '../lib/types'

interface Props {
  strings: Strings
  lang: Lang
  disabled?: boolean
  onSend: (text: string) => void
  onAttach: (files: File[]) => void
  onTyping: () => void
  onStopped: () => void
}

const MAX_HEIGHT = 132

/** Emoji de uso frecuente: un atajo, no un teclado. */
const EMOJI = ['❤️', '😂', '😊', '👍', '🙏', '😘', '🔥', '✨', '😢', '🤔']

export function Composer({
  strings,
  lang,
  disabled,
  onSend,
  onAttach,
  onTyping,
  onStopped,
}: Props) {
  const [value, setValue] = useState('')
  const [emojiOpen, setEmojiOpen] = useState(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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
    setEmojiOpen(false)
    onStopped()
    onSend(text)
    areaRef.current?.focus()
  }

  const insertar = (emoji: string) => {
    setValue((previo) => previo + emoji)
    areaRef.current?.focus()
  }

  const puedeEnviar = !disabled && value.trim().length > 0

  return (
    <div className="safe-bottom px-3 pt-1">
      {emojiOpen && (
        <div className="animate-bubble-in glass mb-2 flex flex-wrap gap-1 rounded-2xl px-2 py-2">
          {EMOJI.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => insertar(emoji)}
              className="grid h-9 w-9 place-items-center rounded-full text-lg transition-transform duration-150 hover:bg-white/10 active:scale-90"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      <form
        className="glass flex items-end gap-2 rounded-[26px] p-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length) onAttach(files)
            // Se limpia para poder volver a elegir el mismo fichero.
            event.target.value = ''
            setEmojiOpen(false)
          }}
        />

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={strings.attach}
          className="icon-btn"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setEmojiOpen((open) => !open)}
          aria-expanded={emojiOpen}
          aria-label="Emoji"
          className="icon-btn"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <circle cx="12" cy="12" r="9" />
            <path
              d="M8.5 14.5c1 1.2 2.2 1.8 3.5 1.8s2.5-.6 3.5-1.8"
              strokeLinecap="round"
            />
            <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
          </svg>
        </button>

        <div className="relative flex-1">
          <textarea
            ref={areaRef}
            rows={1}
            value={value}
            lang={lang}
            disabled={disabled}
            aria-label={strings.placeholder}
            placeholder={strings.placeholder}
            className="max-h-[132px] w-full resize-none border-0 bg-transparent px-1 py-2 pr-8 text-[15px] text-white placeholder:text-muted focus:outline-none"
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
          <span
            className="pointer-events-none absolute bottom-2.5 right-1 font-mono text-[10px]"
            style={{ color: `var(--lang-${lang})` }}
            aria-hidden="true"
          >
            {langLabel[lang]}
          </span>
        </div>

        <button
          type="submit"
          disabled={!puedeEnviar}
          aria-label={strings.send}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white transition-all duration-150 active:scale-90 disabled:opacity-35"
          style={{
            background: 'linear-gradient(140deg, var(--me-1), var(--me-2))',
            boxShadow: puedeEnviar ? '0 0 20px -4px rgba(255,59,141,0.9)' : 'none',
          }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[18px] w-[18px] translate-x-[1px]"
            fill="currentColor"
          >
            <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8Z" />
          </svg>
        </button>
      </form>
    </div>
  )
}
