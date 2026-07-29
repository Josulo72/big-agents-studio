/** Tarjeta contenedora de gráfico con título y subtítulo. */
export default function ChartCard({ title, subtitle, children }) {
  return (
    <section className="card p-3">
      <h2 className="text-sm font-semibold leading-tight">{title}</h2>
      {subtitle && (
        <p className="mb-2 text-[11px]" style={{ color: 'var(--ink-3)' }}>{subtitle}</p>
      )}
      {!subtitle && <div className="mb-2" />}
      {children}
    </section>
  );
}
