import { fmtEUR, fmtPct } from '../lib/format.js';

/**
 * Top 10 clientes por facturación con su margen % al lado, para detectar
 * clientes grandes y poco rentables de un vistazo.
 */
export default function TopClients({ data }) {
  const max = Math.max(...data.map((d) => Math.abs(d.ingresos)), 1);
  const avgMargin =
    data.reduce((a, d) => a + d.margen, 0) /
    Math.max(data.reduce((a, d) => a + d.ingresos, 0), 1);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left" style={{ color: 'var(--ink-3)' }}>
            <th className="pb-1 font-normal">Cliente</th>
            <th className="pb-1 font-normal">Facturación</th>
            <th className="pb-1 text-right font-normal">Ingresos</th>
            <th className="pb-1 text-right font-normal">Margen %</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.name} className="border-t" style={{ borderColor: 'var(--grid)' }}>
              <td className="max-w-[180px] truncate py-1 pr-2" title={d.name}>{d.name}</td>
              <td className="w-[30%] py-1 pr-2">
                <span className="block h-3 w-full overflow-hidden rounded-r" style={{ background: 'var(--grid)' }}>
                  <span className="block h-full rounded-r" style={{
                    width: `${(Math.abs(d.ingresos) / max) * 100}%`,
                    background: d.ingresos < 0 ? 'var(--c-red)' : 'var(--c-blue)',
                  }} />
                </span>
              </td>
              <td className="whitespace-nowrap py-1 pr-2 text-right num">{fmtEUR(d.ingresos)}</td>
              <td className="whitespace-nowrap py-1 text-right num"
                style={{ color: d.margenPct != null && d.margenPct < 0 ? 'var(--c-red)' : 'var(--ink-1)' }}>
                {fmtPct(d.margenPct)}
                {d.margenPct != null && d.margenPct >= 0 && d.margenPct < avgMargin && (
                  <span title="Margen por debajo de la media del top" style={{ color: 'var(--c-orange)' }}> ▾</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
