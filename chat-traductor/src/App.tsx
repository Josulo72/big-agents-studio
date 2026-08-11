import { useEffect } from 'react'
import { useAuth } from './hooks/useAuth'
import { useWorkspace } from './hooks/useWorkspace'
import { ClaimSlot } from './components/ClaimSlot'
import { Setup } from './components/Setup'
import { hasConfig } from './lib/supabase'
import { ChatRoom } from './components/ChatRoom'
import { t } from './lib/i18n'

export default function App() {
  // Sin configuración no hay nada que hacer: ni sesión, ni sala, ni mensajes.
  if (!hasConfig) return <Setup />
  return <Chat />
}

function Chat() {
  const { session, ready, error: authError } = useAuth()
  const userId = session?.user?.id ?? null
  const { loading, profile, room, members, error, reload } = useWorkspace(userId)

  // La interfaz es bilingüe, así que el idioma del documento tiene que seguir
  // al del usuario: de ello dependen los lectores de pantalla y el guionado.
  useEffect(() => {
    if (profile) document.documentElement.lang = profile.lang
  }, [profile])

  if (!ready) return <Splash />

  if (authError || !session) {
    // El tropiezo más probable en la puesta en marcha: el interruptor de
    // sesiones anónimas viene apagado de fábrica y el error de Supabase no
    // dice dónde se enciende.
    const esAnonimoDesactivado = /anonymous/i.test(authError ?? '')
    return (
      <Centered>
        <div className="max-w-xs">
          <p className="text-sm" style={{ color: 'var(--lang-es)' }}>
            {esAnonimoDesactivado
              ? 'Faltan por permitir las sesiones anónimas.'
              : (authError ?? 'No se pudo abrir sesión.')}
          </p>
          {esAnonimoDesactivado && (
            <p className="meta mt-3 leading-relaxed">
              En Supabase: Authentication → Sign In / Providers → activa «Allow
              anonymous sign-ins». Luego recarga esta página.
            </p>
          )}
        </div>
      </Centered>
    )
  }

  if (loading) return <Splash />
  if (!profile) return <ClaimSlot onClaimed={reload} />

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
