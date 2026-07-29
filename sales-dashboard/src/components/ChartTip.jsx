/** Tooltip común de los gráficos, con formato español. */
export default function ChartTip({ active, payload, label, formatLabel, lines }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-2 py-1.5 text-xs shadow-md" style={{ background: 'var(--surface-1)' }}>
      <p className="mb-0.5 font-semibold">{formatLabel ? formatLabel(label) : label}</p>
      {lines(payload).map((l, i) => (
        <p key={i} className="flex items-center gap-1.5 num" style={{ color: 'var(--ink-2)' }}>
          {l.color && (
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: l.color }} />
          )}
          {l.text}
        </p>
      ))}
    </div>
  );
}
