import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { fmtEUR, fmtEURCompact } from '../lib/format.js';
import ChartTip from './ChartTip.jsx';

/** Antigüedad de la cartera no cobrada, apilada por estado de cobro. */
export default function AgingChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="bucket" tickLine={false} />
        <YAxis tickFormatter={fmtEURCompact} tickLine={false} axisLine={false} width={58} />
        <Tooltip
          cursor={{ fill: 'var(--grid)', opacity: 0.4 }}
          content={
            <ChartTip
              lines={(payload) =>
                payload.map((p) => ({ color: p.color, text: `${p.name}: ${fmtEUR(p.value)}` }))
              }
            />
          }
        />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--ink-2)' }} />
        {/* hueco de 2px en color de superficie entre segmentos apilados */}
        <Bar dataKey="Pendiente" stackId="a" fill="var(--c-orange)" maxBarSize={24}
          stroke="var(--surface-1)" strokeWidth={1} />
        <Bar dataKey="Vencido" stackId="a" fill="var(--c-red)" maxBarSize={24}
          radius={[4, 4, 0, 0]} stroke="var(--surface-1)" strokeWidth={1} />
      </BarChart>
    </ResponsiveContainer>
  );
}
