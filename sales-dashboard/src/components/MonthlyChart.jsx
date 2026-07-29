import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { fmtEUR, fmtEURCompact, fmtMonthShort, fmtMonthLong } from '../lib/format.js';
import ChartTip from './ChartTip.jsx';

/** Ingresos mensuales en columnas con el objetivo superpuesto como línea. */
export default function MonthlyChart({ data, showObjetivo }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="mes" tickFormatter={fmtMonthShort} tickLine={false} interval="preserveStartEnd" />
        <YAxis tickFormatter={fmtEURCompact} tickLine={false} axisLine={false} width={58} />
        <Tooltip
          cursor={{ fill: 'var(--grid)', opacity: 0.4 }}
          content={
            <ChartTip
              formatLabel={fmtMonthLong}
              lines={(payload) =>
                payload.map((p) => ({
                  color: p.color,
                  text: `${p.name}: ${fmtEUR(p.value)}`,
                }))
              }
            />
          }
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: 11, color: 'var(--ink-2)' }}
        />
        <Bar
          dataKey="ingresos"
          name="Ingresos netos"
          fill="var(--c-blue)"
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
        />
        {showObjetivo && (
          <Line
            dataKey="objetivo"
            name="Objetivo"
            stroke="var(--ink-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
