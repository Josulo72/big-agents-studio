import type { Strings } from '../lib/i18n'

export function TypingIndicator({
  name,
  strings,
}: {
  name: string | null
  strings: Strings
}) {
  return (
    <div className="flex h-6 items-center px-3" aria-live="polite">
      {name && <span className="meta animate-fade-in">{strings.typing(name)}</span>}
    </div>
  )
}
