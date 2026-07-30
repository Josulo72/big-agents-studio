import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { fmtEUR, fmtEURCompact, fmtPct, fmtNum, fmtDeltaPct, ND } from '../lib/format.js';
import ChartTip from './ChartTip.jsx';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Color por año (la identidad no cambia al filtrar): el más reciente en azul,
// el anterior en neutro, el previo en naranja.
const YEAR_COLORS = ['var(--c-blue)', 'var(--ink-3)', 'var(--c-orange)'];
const colorForYear = (year, years) => YEAR_COLORS[[...years].reverse().indexOf(year)] ?? 'var(--axis)';

const METRICS = {
  ingresos: { label: 'Ingresos', fmt: fmtEUR, fmtAxis: fmtEURCompact },
  margen: { label: 'Margen €', fmt: fmtEUR, fmtAxis: fmtEURCompact },
  margenPct: { label: 'Margen %', fmt: fmtPct, fmtAxis: fmtPct },
};

/** Comparativa interanual: mismos meses de calendario, una línea por año. */
export default function YearComparison({ data }) {
  const [metric, setMetric] = useState('ingresos');
  const { years, meses, resumen } = data;
  const M = METRICS[metric];

  const chartData = meses.map((f) => {
    const fila = { mm: f.mm };
    for (const y of years) fila[y] = f[y] ? f[y][metric] : null;
    return fila;
  });

  return (
    <div>
      <div className="mb-2 flex gap-1">
        {Object.entries(METRICS).map(([k, m]) => (
          <button key={k} type="button" onClick={() => setMetric(k)}
            className="rounded px-2 py-0.5 text-xs"
            style={k === metric
              ? { background: 'var(--c-blue)', color: '#fff', fontWeight: 600 }
              : { color: 'var(--ink-2)' }}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="mm" tickFormatter={(mm) => MESES[Number(mm) - 1]} tickLine={false} />
              <YAxis tickFormatter={M.fmtAxis} tickLine={false} axisLine={false} width={58}
                domain={metric === 'margenPct'
                  ? [(min) => Math.floor((min - 0.01) * 50) / 50, (max) => Math.ceil((max + 0.01) * 50) / 50]
                  : [0, 'auto']} />
              <Tooltip
                content={
                  <ChartTip
                    formatLabel={(mm) => MESES_LARGO[Number(mm) - 1]}
                    lines={(payload) =>
                      payload.map((p) => ({
                        color: p.stroke,
                        text: `${p.name}: ${p.value == null ? ND : M.fmt(p.value)}`,
                      }))
                    }
                  />
                }
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--ink-2)' }} />
              {years.map((y) => (
                <Line key={y} dataKey={y} name={y}
                  stroke={colorForYear(y, years)} strokeWidth={2} connectNulls={false}
                  dot={{ r: 2.5, fill: colorForYear(y, years), strokeWidth: 0 }}
                  activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left" style={{ color: 'var(--ink-3)' }}>
                <th className="pb-1 font-normal">Ejercicio</th>
                <th className="pb-1 text-right font-normal">Ingresos</th>
                <th className="pb-1 text-right font-normal">Margen %</th>
                <th className="pb-1 text-right font-normal">Pedidos</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.year} className="border-t" style={{ borderColor: 'var(--grid)' }}>
                  <td className="py-1 pr-2">
                    <span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ background: colorForYear(r.year, years) }} />
                    {r.year}
                    {r.mesesConDato < 12 && (
                      <span style={{ color: 'var(--ink-3)' }}> ({r.mesesConDato} m)</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1 pr-2 text-right num">{fmtEUR(r.ingresos)}</td>
                  <td className="py-1 pr-2 text-right num">{fmtPct(r.margenPct)}</td>
                  <td className="py-1 text-right num">{fmtNum(r.pedidos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {resumen.filter((r) => r.varComparable).map((r) => (
            <p key={r.year} className="mt-2 text-[11px]" style={{ color: 'var(--ink-2)' }}>
              {r.year} vs {r.varComparable.prevYear} ({MESES[Number(r.varComparable.meses[0]) - 1]}–{MESES[Number(r.varComparable.meses.at(-1)) - 1]},
              meses comparables):{' '}
              <span className="num font-semibold"
                style={{ color: r.varComparable.pct >= 0 ? 'var(--delta-good)' : 'var(--c-red)' }}>
                {fmtDeltaPct(r.varComparable.pct)}
              </span>{' '}
              en ingresos
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
