import { useState } from 'react'
import { displayText, type ChatMessage, type Lang } from '../lib/types'
import { langLabel, localeOf, type Strings } from '../lib/i18n'

/** Un mensaje pendiente más de esto se considera atascado y ofrece reintento. */
const STUCK_AFTER_MS = 15_000

interface Props {
  message: ChatMessage
  viewerLang: Lang
  isOwn: boolean
  strings: Strings
  now: number
  onRetry: (message: ChatMessage) => void
}

const langColorVar: Record<Lang, string> = {
  es: 'var(--lang-es)',
  bg: 'var(--lang-bg)',
}

/** Fondo de la burbuja según el idioma en que se escribió el mensaje. */
const bubbleBgVar: Record<Lang, string> = {
  es: 'var(--bubble-es)',
  bg: 'var(--bubble-bg)',
}

export function MessageBubble({
  message,
  viewerLang,
  isOwn,
  strings,
  now,
  onRetry,
}: Props) {
  const [openEcho, setOpenEcho] = useState(false)

  const { text, isTranslation } = displayText(message, viewerLang, isOwn)
  const langColor = langColorVar[message.source_lang]

  const time = new Date(message.created_at).toLocaleTimeString(localeOf[viewerLang], {
    hour: '2-digit',
    minute: '2-digit',
  })

  // Una traducción que tarda demasiado no es un fallo: se sigue anunciando
  // como en curso, solo que además se ofrece reintentar.
  const stuck =
    message.status === 'pending' &&
    now - new Date(message.created_at).getTime() > STUCK_AFTER_MS
  const showRetry = message.status === 'failed' || stuck

  const label =
    message.status === 'pending'
      ? strings.translating
      : message.unsent
        ? strings.notSent
        : message.status === 'failed'
          ? strings.failed
          : null

  const toggleEcho = () => {
    if (!isTranslation) return
    setOpenEcho((open) => !open)
  }

  return (
    <li
      className={[
        'flex w-full animate-fade-in',
        isOwn ? 'justify-end' : 'justify-start',
      ].join(' ')}
    >
      <div className="flex max-w-[85%] flex-col gap-1 sm:max-w-[75%]">
        <div
          className="rounded-bubble px-3 py-2"
          style={{ backgroundColor: bubbleBgVar[message.source_lang] }}
        >
          {isTranslation ? (
            <button
              type="button"
              onClick={toggleEcho}
              aria-expanded={openEcho}
              aria-label={openEcho ? strings.hideOriginal : strings.showOriginal}
              className="block w-full cursor-pointer text-left"
            >
              <BubbleText text={text} />
              <Echo
                open={openEcho}
                sourceText={message.source_text}
                sourceLang={message.source_lang}
                color={langColor}
                strings={strings}
              />
            </button>
          ) : (
            <BubbleText text={text} />
          )}
        </div>

        <div
          className={[
            'flex items-center gap-2',
            isOwn ? 'justify-end' : 'justify-start',
          ].join(' ')}
        >
          <span className="meta" style={{ color: langColor }}>
            {langLabel[message.source_lang]}
          </span>
          <time className="meta" dateTime={message.created_at}>
            {time}
          </time>

          {label && (
            <span className="meta" title={message.error_detail ?? undefined}>
              {label}
            </span>
          )}

          {showRetry && (
            <button
              type="button"
              onClick={() => onRetry(message)}
              className="meta underline underline-offset-2 transition-colors duration-120 hover:text-text"
            >
              {strings.retry}
            </button>
          )}

          {isTranslation && (
            <button
              type="button"
              onClick={toggleEcho}
              aria-expanded={openEcho}
              className="meta underline underline-offset-2 transition-colors duration-120 hover:text-text"
            >
              {openEcho ? strings.hideOriginal : strings.showOriginal}
            </button>
          )}
        </div>
      </div>
    </li>
  )
}

function BubbleText({ text }: { text: string }) {
  return <p className="whitespace-pre-wrap break-words text-[15px]">{text}</p>
}

/**
 * El eco: bajo la traducción, separado por una línea de 1 px del color del
 * idioma de origen, el texto tal cual se escribió. Colapsado por defecto.
 */
function Echo({
  open,
  sourceText,
  sourceLang,
  color,
  strings,
}: {
  open: boolean
  sourceText: string
  sourceLang: Lang
  color: string
  strings: Strings
}) {
  return (
    <div className="echo-grid" data-open={open}>
      <div className="echo-inner">
        <div className="mt-2 border-t pt-2" style={{ borderColor: color }}>
          <p className="meta mb-1" style={{ color }}>
            {strings.original} · {langLabel[sourceLang]}
          </p>
          <p
            lang={sourceLang}
            className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-muted"
          >
            {sourceText}
          </p>
        </div>
      </div>
    </div>
  )
}
