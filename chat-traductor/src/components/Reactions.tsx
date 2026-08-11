import type { Reaction } from '../hooks/useReactions'

export const EMOJI_REACCIONES = ['❤️', '😂', '😮', '😢', '👍', '🙏']

/**
 * Las reacciones colgando de la burbuja. Se agrupan por emoji con su cuenta,
 * y la propia se marca para poder retirarla de un toque.
 */
export function Reactions({
  reactions,
  myProfileId,
  isOwn,
  onToggle,
}: {
  reactions: Reaction[]
  myProfileId: string
  isOwn: boolean
  onToggle: (emoji: string) => void
}) {
  if (reactions.length === 0) return null

  const porEmoji = new Map<string, number>()
  for (const reaction of reactions) {
    porEmoji.set(reaction.emoji, (porEmoji.get(reaction.emoji) ?? 0) + 1)
  }
  const mia = reactions.find((r) => r.profile_id === myProfileId)?.emoji

  return (
    <div
      className={[
        '-mt-2.5 flex flex-wrap gap-1',
        isOwn ? 'justify-end pr-2' : 'justify-start pl-2',
      ].join(' ')}
    >
      {[...porEmoji.entries()].map(([emoji, cuenta]) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onToggle(emoji)}
          aria-pressed={mia === emoji}
          className={[
            'animate-bubble-in flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px]',
            'border backdrop-blur-md transition-transform duration-150 active:scale-90',
            mia === emoji
              ? 'border-white/40 bg-white/25'
              : 'border-white/15 bg-black/40',
          ].join(' ')}
        >
          <span>{emoji}</span>
          {cuenta > 1 && (
            <span className="font-mono text-[10px] text-white/70">{cuenta}</span>
          )}
        </button>
      ))}
    </div>
  )
}

/** El selector que aparece al mantener pulsada una burbuja. */
export function ReactionPicker({
  isOwn,
  current,
  onPick,
  onClose,
}: {
  isOwn: boolean
  current?: string
  onPick: (emoji: string) => void
  onClose: () => void
}) {
  return (
    <>
      {/* Capa para cerrar tocando fuera. */}
      <div className="fixed inset-0 z-30" onClick={onClose} aria-hidden="true" />
      <div
        role="menu"
        className={[
          'animate-bubble-in absolute bottom-full z-40 mb-1 flex gap-0.5 rounded-full p-1',
          'border border-white/20 bg-[#101436]/90 shadow-[0_10px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl',
          isOwn ? 'right-0' : 'left-0',
        ].join(' ')}
      >
        {EMOJI_REACCIONES.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitem"
            onClick={() => {
              onPick(emoji)
              onClose()
            }}
            className={[
              'grid h-9 w-9 place-items-center rounded-full text-[19px]',
              'transition-transform duration-150 hover:scale-110 active:scale-95',
              current === emoji ? 'bg-white/25' : 'hover:bg-white/10',
            ].join(' ')}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  )
}
