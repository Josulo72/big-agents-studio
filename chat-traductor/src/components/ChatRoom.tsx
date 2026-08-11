import { useEffect, useMemo } from 'react'
import { Header } from './Header'
import { MessageList } from './MessageList'
import { Composer } from './Composer'
import { TypingIndicator } from './TypingIndicator'
import { useMessages } from '../hooks/useMessages'
import { useTyping } from '../hooks/useTyping'
import { useOnline, useTicker } from '../hooks/useOnline'
import { t } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { Profile, Room } from '../lib/types'

interface Props {
  profile: Profile
  room: Room
  members: Profile[]
}

export function ChatRoom({ profile, room, members }: Props) {
  const strings = t(profile.lang)
  const online = useOnline()

  const other = useMemo(
    () => members.find((member) => member.id !== profile.id) ?? null,
    [members, profile.id],
  )

  const {
    messages,
    loading,
    loadingOlder,
    hasMore,
    connection,
    loadOlder,
    send,
    retry,
  } = useMessages({ roomId: room.id, profile })

  const { typingName, notifyTyping, notifyStopped } = useTyping(room.id, profile)

  const hasPending = messages.some((message) => message.status === 'pending')
  const now = useTicker(hasPending)

  // Si llega un mensaje del otro, ya no está escribiendo.
  const lastSender = messages[messages.length - 1]?.sender_id
  useEffect(() => {
    if (lastSender && lastSender !== profile.id) notifyStopped()
  }, [lastSender, profile.id, notifyStopped])

  const status = !online
    ? ('offline' as const)
    : connection === 'connected'
      ? ('connected' as const)
      : ('connecting' as const)

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl flex-col">
      <Header
        title={room.name}
        other={other}
        strings={strings}
        status={status}
        onSignOut={() => void supabase.auth.signOut()}
      />

      <MessageList
        messages={messages}
        viewerId={profile.id}
        viewerLang={profile.lang}
        strings={strings}
        now={now}
        hasMore={hasMore}
        loading={loading}
        loadingOlder={loadingOlder}
        onLoadOlder={loadOlder}
        onRetry={retry}
      />

      <TypingIndicator name={typingName} strings={strings} />

      {/* El compositor nunca se bloquea: `navigator.onLine` da falsos negativos
          con demasiada frecuencia. Si el envío falla, la burbuja se queda
          marcada como no enviada y con botón de reintento. */}
      <Composer
        strings={strings}
        lang={profile.lang}
        onSend={(text) => void send(text)}
        onTyping={notifyTyping}
        onStopped={notifyStopped}
      />
    </div>
  )
}
