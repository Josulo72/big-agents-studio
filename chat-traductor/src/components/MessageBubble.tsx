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
        'flex w-full animate-bubble-in',
        isOwn ? 'justify-end pl-8' : 'justify-start pr-8',
      ].join(' ')}
    >
      <div className="flex max-w-[80%] flex-col gap-1 sm:max-w-[68%]">
        <div className={`bubble ${isOwn ? 'bubble-me' : 'bubble-you'}`}>
          {isTranslation ? (
            <button
              type="button"
              onClick={toggleEcho}
              aria-expanded={openEcho}
              aria-label={openEcho ? strings.hideOriginal : strings.showOriginal}
              className="block w-full text-left"
            >
              <Contenido
                text={text}
                time={time}
                message={message}
                isOwn={isOwn}
                showTick={isOwn}
              />
              <Echo
                open={openEcho}
                sourceText={message.source_text}
                sourceLang={message.source_lang}
                strings={strings}
              />
            </button>
          ) : (
            <Contenido
              text={text}
              time={time}
              message={message}
              isOwn={isOwn}
              showTick={isOwn}
            />
          )}
        </div>

        {/* Bajo la burbuja solo aparece lo excepcional: idioma de origen cuando
            hay traducción que desplegar, y los estados que piden acción. */}
        {(isTranslation || label || showRetry) && (
          <div
            className={[
              'flex items-center gap-2 px-1',
              isOwn ? 'justify-end' : 'justify-start',
            ].join(' ')}
          >
            {isTranslation && (
              <button
                type="button"
                onClick={toggleEcho}
                aria-expanded={openEcho}
                className="rounded-full bg-white/[0.08] px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-white/60 transition-colors duration-150 hover:bg-white/15 hover:text-white"
              >
                {openEcho ? strings.hideOriginal : strings.showOriginal}
              </button>
            )}

            {label && (
              <span className="meta" title={message.error_detail ?? undefined}>
                {label}
              </span>
            )}

            {showRetry && (
              <button
                type="button"
                onClick={() => onRetry(message)}
                className="meta rounded-full bg-white/10 px-2 py-0.5 transition-colors duration-150 hover:bg-white/20 hover:text-text"
              >
                {strings.retry}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/** Texto del mensaje con la hora y el estado embebidos en la esquina. */
function Contenido({
  text,
  time,
  message,
  isOwn,
  showTick,
}: {
  text: string
  time: string
  message: ChatMessage
  isOwn: boolean
  showTick: boolean
}) {
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-white">
      {text}
      {/* Espacio fantasma: reserva sitio en la última línea para que la hora
          nunca se monte encima del texto. */}
      <span className="pointer-events-none inline-block w-[68px] select-none opacity-0">
        .
      </span>
      <span
        className={[
          'absolute bottom-1.5 right-3 flex items-center gap-1',
          'font-mono text-[10px] tracking-wide',
          isOwn ? 'text-white/70' : 'text-white/65',
        ].join(' ')}
      >
        <span
          className="text-[9px] uppercase opacity-80"
          title={message.source_lang === 'es' ? 'Español' : 'Български'}
        >
          {langLabel[message.source_lang]}
        </span>
        <time dateTime={message.created_at}>{time}</time>
        {showTick && <Checks message={message} />}
      </span>
    </p>
  )
}

/**
 * Un check cuando el servidor tiene el mensaje; dos cuando además ya está
 * traducido y por tanto legible para el otro. No se inventa un "leído" que la
 * base de datos no guarda.
 */
function Checks({ message }: { message: ChatMessage }) {
  const enviado = !message.unsent && message.id !== message.client_id
  const legible = message.status === 'translated'

  if (!enviado) {
    return (
      <span className="opacity-60" title="Enviando">
        ○
      </span>
    )
  }

  return (
    <svg
      viewBox="0 0 20 12"
      className="h-[11px] w-[18px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={legible ? 'Traducido' : 'Enviado'}
    >
      <path d="M1 6.5 L4.5 10 L11 2" />
      {legible && <path d="M8.5 10 L15 2" opacity="0.95" />}
    </svg>
  )
}

/**
 * El eco: bajo la traducción, separado por una línea del color del idioma de
 * origen, el texto tal cual se escribió. Colapsado por defecto.
 */
function Echo({
  open,
  sourceText,
  sourceLang,
  strings,
}: {
  open: boolean
  sourceText: string
  sourceLang: Lang
  strings: Strings
}) {
  return (
    <div className="echo-grid" data-open={open}>
      <div className="echo-inner">
        <div className="mt-2.5 border-t border-white/30 pt-2">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wide text-white/60">
            {strings.original} · {langLabel[sourceLang]}
          </p>
          <p
            lang={sourceLang}
            className="whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-white/80"
          >
            {sourceText}
          </p>
        </div>
      </div>
    </div>
  )
}
