import type { Strings } from '../lib/i18n'
import type { PushState } from '../hooks/usePush'

interface Props {
  state: PushState
  strings: Strings
  onEnable: () => void
  onDisable: () => void
}

/**
 * Un solo control, discreto, en la barra. Solo aparece cuando hay algo que
 * hacer: si el navegador no puede (Safari sin instalar) o falta configuración,
 * se calla en vez de ofrecer un botón que no va a funcionar.
 */
export function NotifyToggle({ state, strings, onEnable, onDisable }: Props) {
  if (state === 'unconfigured' || state === 'working') return null

  if (state === 'unsupported') {
    return (
      <span className="meta shrink-0" title={strings.notifyInstall}>
        ○
      </span>
    )
  }

  if (state === 'denied') {
    return (
      <span className="meta shrink-0" title={strings.notifyDenied}>
        ⃠
      </span>
    )
  }

  const on = state === 'on'
  return (
    <button
      type="button"
      onClick={on ? onDisable : onEnable}
      aria-pressed={on}
      title={on ? strings.notifyOn : strings.notifyOff}
      className="meta shrink-0 rounded-full bg-white/10 px-3 py-1 transition-colors duration-150 hover:bg-white/20 hover:text-text"
      style={on ? { color: 'var(--me-1)' } : undefined}
    >
      {on ? strings.notifyOn : strings.notifyOff}
    </button>
  )
}
