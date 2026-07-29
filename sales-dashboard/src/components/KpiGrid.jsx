import { fmtEUR, fmtNum, fmtPct, fmtDeltaPct, fmtDeltaPP, ND } from '../lib/format.js';

/*
 * Bloque de KPIs, siempre visible. Cada tarjeta muestra la variación frente
 * al periodo anterior equivalente, con signo y color. El rojo se reserva a
 * las desviaciones negativas.
 */

function Kpi({ label, value, delta, deltaLabel, invertGood = false }) {
  // invertGood: para KPIs donde subir es malo (cartera vencida)
  let deltaColor = 'var(--ink-3)';
  if (delta != null && isFinite(delta) && delta !== 0) {
    const good = invertGood ? delta < 0 : delta > 0;
    deltaColor = good ? 'var(--delta-good)' : 'var(--c-red)';
  }
  return (
    <div className="card p-2.5">
      <p className="text-[11px] leading-tight" style={{ color: 'var(--ink-2)' }}>{label}</p>
      <p className="text-lg font-semibold leading-tight">{value}</p>
      <p className="text-[11px] num" style={{ color: deltaColor }}>
        {deltaLabel ?? ' '}
      </p>
    </div>
  );
}

const pctChange = (cur, prev) =>
  prev != null && prev !== 0 && cur != null ? (cur - prev) / Math.abs(prev) : null;

export default function KpiGrid({ kpis }) {
  const { current: c, previous: p } = kpis;

  const d = (key) => (p ? pctChange(c[key], p[key]) : null);
  const dl = (v) => (v == null ? null : `${fmtDeltaPct(v)} vs periodo anterior`);

  const margenPPDelta = p && c.margenPct != null && p.margenPct != null
    ? c.margenPct - p.margenPct : null;
  const ebitdaDelta = c.ebitda != null && p?.ebitda != null ? pctChange(c.ebitda, p.ebitda) : null;

  return (
    <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
      <Kpi label="Ingresos netos" value={fmtEUR(c.ingresos)}
        delta={d('ingresos')} deltaLabel={dl(d('ingresos'))} />
      <Kpi label="Margen contribución" value={fmtEUR(c.margen)}
        delta={d('margen')} deltaLabel={dl(d('margen'))} />
      <Kpi label="Margen %" value={fmtPct(c.margenPct)}
        delta={margenPPDelta}
        deltaLabel={margenPPDelta == null ? null : `${fmtDeltaPP(margenPPDelta)} vs periodo anterior`} />
      <Kpi label="EBITDA" value={c.ebitda == null ? ND : fmtEUR(c.ebitda)}
        delta={ebitdaDelta} deltaLabel={dl(ebitdaDelta)} />
      <Kpi label="Nº de pedidos" value={fmtNum(c.pedidos)}
        delta={d('pedidos')} deltaLabel={dl(d('pedidos'))} />
      <Kpi label="Ticket medio" value={fmtEUR(c.ticketMedio)}
        delta={d('ticketMedio')} deltaLabel={dl(d('ticketMedio'))} />
      <Kpi label="Cajas vendidas" value={fmtNum(c.cajas)}
        delta={d('cajas')} deltaLabel={dl(d('cajas'))} />
      <Kpi label="Cartera vencida" value={fmtEUR(c.carteraVencida)}
        delta={d('carteraVencida')} deltaLabel={dl(d('carteraVencida'))} invertGood />
    </div>
  );
}
