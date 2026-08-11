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
      {name && (
        <span className="animate-bubble-in flex items-center gap-1.5 font-mono text-[11px] text-muted">
          {strings.typing(name)}
          <span className="flex gap-0.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-1 w-1 rounded-full bg-[var(--you-1)]"
                style={{
                  animation: 'bubble-in 900ms ease-in-out infinite alternate',
                  animationDelay: `${i * 150}ms`,
                }}
              />
            ))}
          </span>
        </span>
      )}
    </div>
  )
}
