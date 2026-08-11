import { Fragment, useEffect, useLayoutEffect, useRef } from 'react'
import { MessageBubble } from './MessageBubble'
import type { Strings } from '../lib/i18n'
import { localeOf } from '../lib/i18n'
import type { ChatMessage, Lang } from '../lib/types'

interface Props {
  messages: ChatMessage[]
  viewerId: string
  viewerLang: Lang
  strings: Strings
  now: number
  hasMore: boolean
  loading: boolean
  loadingOlder: boolean
  onLoadOlder: () => void
  onRetry: (message: ChatMessage) => void
}

const NEAR_BOTTOM_PX = 120

export function MessageList({
  messages,
  viewerId,
  viewerLang,
  strings,
  now,
  hasMore,
  loading,
  loadingOlder,
  onLoadOlder,
  onRetry,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const anchorRef = useRef<{ height: number; top: number } | null>(null)
  const atBottomRef = useRef(true)
  const lastIdRef = useRef<string | null>(null)

  // Scroll infinito hacia arriba.
  useEffect(() => {
    const sentinel = sentinelRef.current
    const root = scrollRef.current
    if (!sentinel || !root || !hasMore || loading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingOlder) return
        const el = scrollRef.current
        if (el) anchorRef.current = { height: el.scrollHeight, top: el.scrollTop }
        onLoadOlder()
      },
      { root, rootMargin: '200px 0px 0px 0px' },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [hasMore, loading, loadingOlder, onLoadOlder])

  // Al anteponer mensajes antiguos, mantener el punto de lectura donde estaba.
  useLayoutEffect(() => {
    const el = scrollRef.current
    const anchor = anchorRef.current
    if (!el) return

    if (anchor) {
      el.scrollTop = el.scrollHeight - anchor.height + anchor.top
      anchorRef.current = null
      return
    }

    const last = messages[messages.length - 1]
    const isNew = last && last.id !== lastIdRef.current
    lastIdRef.current = last?.id ?? null

    // Bajar solo si el usuario ya estaba abajo: si está leyendo historial,
    // un mensaje nuevo no le mueve la vista.
    if (isNew && atBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="meta">{strings.loading}</span>
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto overscroll-contain px-3 py-3"
    >
      {/* `justify-end` sobre una columna de alto mínimo completo: con pocos
          mensajes la conversación descansa sobre el compositor en vez de
          quedarse flotando arriba. */}
      <div className="flex min-h-full flex-col justify-end">
        <div ref={sentinelRef} aria-hidden="true" />

        <p className="meta mb-3 text-center">
          {loadingOlder
            ? strings.loading
            : hasMore
              ? strings.loadOlder
              : messages.length > 0
                ? strings.historyStart
                : ''}
        </p>

        {messages.length === 0 && (
          <p className="meta mt-8 text-center">{strings.noMessages}</p>
        )}

        <ul className="flex flex-col gap-3">
          {messages.map((message, index) => {
            const previous = messages[index - 1]
            const showDay =
              !previous || !sameDay(previous.created_at, message.created_at)
            return (
              <Fragment key={message.client_id}>
                {showDay && (
                  <li className="my-2 flex items-center gap-3" aria-hidden="false">
                    <span className="h-px flex-1 bg-line" />
                    <span className="meta">
                      {dayLabel(message.created_at, viewerLang, strings)}
                    </span>
                    <span className="h-px flex-1 bg-line" />
                  </li>
                )}
                <MessageBubble
                  message={message}
                  viewerLang={viewerLang}
                  isOwn={message.sender_id === viewerId}
                  strings={strings}
                  now={now}
                  onRetry={onRetry}
                />
              </Fragment>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

function sameDay(a: string, b: string) {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function dayLabel(iso: string, lang: Lang, strings: Strings) {
  const date = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (sameDay(iso, today.toISOString())) return strings.today
  if (sameDay(iso, yesterday.toISOString())) return strings.yesterday

  return date.toLocaleDateString(localeOf[lang], {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}
