import type { ReactNode } from 'react'
import { langLabel, type Strings } from '../lib/i18n'
import type { Profile } from '../lib/types'

interface Props {
  title: string
  other: Profile | null
  strings: Strings
  status: 'connected' | 'connecting' | 'offline'
  notify: ReactNode
}

export function Header({ title, other, strings, status, notify }: Props) {
  return (
    <header className="safe-top sticky top-0 z-10 border-b border-line bg-surface px-3 pb-2">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-semibold tracking-tight">
            {title}
          </h1>
          <p className="flex items-center gap-2 truncate">
            {other && (
              <>
                <span className="meta" style={{ color: `var(--lang-${other.lang})` }}>
                  {langLabel[other.lang]}
                </span>
                <span className="truncate text-[13px] text-muted">
                  {other.display_name}
                </span>
              </>
            )}
            {status !== 'connected' && (
              <span className="meta">
                {status === 'offline' ? strings.offline : strings.reconnecting}
              </span>
            )}
          </p>
        </div>

        {notify}
      </div>
    </header>
  )
}
