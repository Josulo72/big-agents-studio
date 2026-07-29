import { useMemo, useState } from 'react';
import { fmtEUR, fmtNum, fmtPct } from '../lib/format.js';

const COLS = [
  { key: 'codigo', label: 'Código', numeric: false },
  { key: 'producto', label: 'Producto', numeric: false },
  { key: 'familia', label: 'Familia', numeric: false },
  { key: 'cajas', label: 'Cajas', numeric: true, fmt: fmtNum },
  { key: 'ingresos', label: 'Ingresos', numeric: true, fmt: (v) => fmtEUR(v) },
  { key: 'margen', label: 'Margen €', numeric: true, fmt: (v) => fmtEUR(v) },
  { key: 'margenPct', label: 'Margen %', numeric: true, fmt: fmtPct },
];

/** Ranking de productos, ordenable por cualquier columna (margen € por defecto). */
export default function ProductRanking({ data }) {
  const [sort, setSort] = useState({ key: 'margen', dir: -1 });

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...data].sort((a, b) => {
      const va = a[key] ?? -Infinity;
      const vb = b[key] ?? -Infinity;
      if (typeof va === 'string') return va.localeCompare(vb, 'es') * dir;
      return (va - vb) * dir;
    });
  }, [data, sort]);

  const maxMargen = Math.max(...data.map((d) => Math.abs(d.margen)), 1);

  const clickSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left" style={{ color: 'var(--ink-3)' }}>
            {COLS.map((c) => (
              <th key={c.key}
                className={`cursor-pointer select-none pb-1 font-normal ${c.numeric ? 'text-right' : ''}`}
                onClick={() => clickSort(c.key)}>
                {c.label}{sort.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
            <th className="w-[18%] pb-1" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((d) => (
            <tr key={d.codigo} className="border-t" style={{ borderColor: 'var(--grid)' }}>
              <td className="py-1 pr-2 num">{d.codigo}</td>
              <td className="max-w-[280px] truncate py-1 pr-2" title={d.producto}>{d.producto}</td>
              <td className="py-1 pr-2">{d.familia}</td>
              <td className="py-1 pr-2 text-right num">{fmtNum(d.cajas)}</td>
              <td className="whitespace-nowrap py-1 pr-2 text-right num">{fmtEUR(d.ingresos)}</td>
              <td className="whitespace-nowrap py-1 pr-2 text-right num"
                style={{ color: d.margen < 0 ? 'var(--c-red)' : 'var(--ink-1)' }}>
                {fmtEUR(d.margen)}
              </td>
              <td className="whitespace-nowrap py-1 pr-2 text-right num"
                style={{ color: d.margenPct != null && d.margenPct < 0 ? 'var(--c-red)' : 'var(--ink-1)' }}>
                {fmtPct(d.margenPct)}
              </td>
              <td className="py-1">
                <span className="block h-3 w-full overflow-hidden rounded-r" style={{ background: 'var(--grid)' }}>
                  <span className="block h-full rounded-r" style={{
                    width: `${(Math.abs(d.margen) / maxMargen) * 100}%`,
                    background: d.margen < 0 ? 'var(--c-red)' : 'var(--c-aqua)',
                  }} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
