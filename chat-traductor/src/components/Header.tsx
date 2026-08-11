import type { ReactNode } from 'react'
import { langLabel, type Strings } from '../lib/i18n'
import type { Profile } from '../lib/types'

interface Props {
  title: string
  other: Profile | null
  strings: Strings
  status: 'connected' | 'connecting' | 'offline'
  notify: ReactNode
  self: ReactNode
  menuOpen: boolean
  onToggleMenu: () => void
}

/** Avatar circular con las iniciales, teñido con el color de la otra persona. */
function Avatar({ name }: { name: string }) {
  const iniciales = name
    .split(/\s+/)
    .slice(0, 2)
    .map((parte) => parte[0] ?? '')
    .join('')
    .toUpperCase()

  return (
    <div
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[15px] font-semibold text-white shadow-[0_0_18px_-4px_rgba(22,139,255,0.9)]"
      style={{ background: 'linear-gradient(140deg, var(--you-1), var(--you-2))' }}
      aria-hidden="true"
    >
      {iniciales || '·'}
    </div>
  )
}

export function Header({
  title,
  other,
  strings,
  status,
  notify,
  self,
  menuOpen,
  onToggleMenu,
}: Props) {
  return (
    <header className="safe-top glass-strong sticky top-0 z-20 border-b border-white/10 px-3 pb-2">
      <div className="flex items-center gap-3">
        <Avatar name={other?.display_name ?? title} />

        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-[17px] font-semibold leading-tight tracking-tight">
            {title}
          </h1>
          <p className="flex items-center gap-1.5 truncate">
            {other && (
              <>
                <span
                  className="font-mono text-[10px]"
                  style={{ color: `var(--lang-${other.lang})` }}
                >
                  {langLabel[other.lang]}
                </span>
                <span className="truncate text-[13px] text-muted">
                  {other.display_name}
                </span>
              </>
            )}
            {status !== 'connected' && (
              <span className="meta">
                · {status === 'offline' ? strings.offline : strings.reconnecting}
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleMenu}
          aria-expanded={menuOpen}
          aria-label={strings.options}
          className="icon-btn"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
            <circle cx="12" cy="5" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="12" cy="19" r="1.8" />
          </svg>
        </button>
      </div>

      {/* Panel de opciones: lo que antes vivía suelto en la barra. */}
      {menuOpen && (
        <div className="animate-bubble-in mt-2 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2">
          {self}
          {notify}
        </div>
      )}
    </header>
  )
}
