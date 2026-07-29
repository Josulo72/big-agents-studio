import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { fmtPct, fmtMonthShort, fmtMonthLong } from '../lib/format.js';
import ChartTip from './ChartTip.jsx';

/** Evolución del margen de contribución % por mes. Serie única: sin leyenda. */
export default function MarginChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="mes" tickFormatter={fmtMonthShort} tickLine={false} interval="preserveStartEnd" />
        <YAxis
          tickFormatter={(v) => fmtPct(v)}
          tickLine={false}
          axisLine={false}
          width={52}
          domain={[
            (min) => Math.floor((min - 0.01) * 50) / 50,
            (max) => Math.ceil((max + 0.01) * 50) / 50,
          ]}
        />
        <Tooltip
          content={
            <ChartTip
              formatLabel={fmtMonthLong}
              lines={(payload) => [{
                color: 'var(--c-aqua)',
                text: `Margen de contribución: ${fmtPct(payload[0]?.value)}`,
              }]}
            />
          }
        />
        <Line
          dataKey="margenPct"
          stroke="var(--c-aqua)"
          strokeWidth={2}
          dot={false}
          connectNulls
          activeDot={{ r: 4, stroke: 'var(--surface-1)', strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
