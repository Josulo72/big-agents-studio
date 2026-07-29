import { fmtEUR, fmtPct } from '../lib/format.js';

/**
 * Composición de ingresos por dimensión como barras horizontales HTML.
 * Un clic en una fila aplica/quita esa categoría como filtro cruzado.
 */
export default function HBarList({ data, activos = [], onClick }) {
  const total = data.reduce((a, d) => a + d.ingresos, 0);
  const max = Math.max(...data.map((d) => Math.abs(d.ingresos)), 1);

  return (
    <ul className="flex flex-col gap-1.5">
      {data.map((d) => {
        const active = activos.includes(d.name);
        const dimmed = activos.length > 0 && !active;
        const share = total !== 0 ? d.ingresos / total : null;
        return (
          <li key={d.name}>
            <button
              type="button"
              onClick={() => onClick?.(d.name)}
              className="block w-full text-left"
              style={{ opacity: dimmed ? 0.45 : 1 }}
              title={active ? 'Quitar filtro' : 'Filtrar el resto del dashboard'}
            >
              <span className="mb-0.5 flex items-baseline justify-between gap-2 text-xs">
                <span style={{ fontWeight: active ? 700 : 400 }}>{d.name}</span>
                <span className="num whitespace-nowrap" style={{ color: 'var(--ink-2)' }}>
                  {fmtEUR(d.ingresos)}
                  {share != null && (
                    <span style={{ color: 'var(--ink-3)' }}> · {fmtPct(share)}</span>
                  )}
                </span>
              </span>
              <span className="block h-3.5 w-full overflow-hidden rounded-r"
                style={{ background: 'var(--grid)' }}>
                <span
                  className="block h-full rounded-r"
                  style={{
                    width: `${(Math.abs(d.ingresos) / max) * 100}%`,
                    background: d.ingresos < 0 ? 'var(--c-red)' : 'var(--c-blue)',
                  }}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
