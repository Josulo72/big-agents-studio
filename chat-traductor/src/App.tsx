import { useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { useWorkspace } from './hooks/useWorkspace'
import { SignIn } from './components/SignIn'
import { ProfileSetup } from './components/ProfileSetup'
import { ChatRoom } from './components/ChatRoom'
import { t } from './lib/i18n'

export default function App() {
  const { session, ready } = useAuth()
  const userId = session?.user?.id ?? null
  const { loading, profile, room, members, error, reload } = useWorkspace(userId)

  // La interfaz es bilingüe, así que el idioma del documento tiene que seguir
  // al del usuario: de ello dependen los lectores de pantalla y el guionado.
  useEffect(() => {
    if (profile) document.documentElement.lang = profile.lang
  }, [profile])

  if (!ready) return <Splash />
  if (!session) return <SignIn />
  if (loading) return <Splash />
  if (!profile) return <ProfileSetup userId={session.user.id} onDone={reload} />

  const strings = t(profile.lang)

  if (error) {
    return (
      <Centered>
        <p className="text-sm" style={{ color: 'var(--lang-es)' }}>
          {error}
        </p>
      </Centered>
    )
  }

  if (!room) {
    return (
      <Centered>
        <p className="meta">{strings.noRoom}</p>
      </Centered>
    )
  }

  return <ChatRoom profile={profile} room={room} members={members} />
}

function Splash() {
  return (
    <Centered>
      <span className="meta">···</span>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex h-full w-full items-center justify-center px-5 text-center">
      {children}
    </main>
  )
}
