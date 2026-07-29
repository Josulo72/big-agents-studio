/*
 * Formato español: miles con punto, decimales con coma, € detrás,
 * fechas dd/mm/aaaa, meses abreviados en los ejes.
 */

// useGrouping 'always': es-ES no separa miles hasta 5 dígitos y el modelo
// exige «miles con punto» también en 7.453 €
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });
const nf2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const pf1 = new Intl.NumberFormat('es-ES', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const ND = 'n/d';

export const fmtEUR = (v, decimals = 0) =>
  v == null ? ND : `${(decimals ? nf2 : nf0).format(v)} €`;

export const fmtNum = (v) => (v == null ? ND : nf0.format(v));

export const fmtPct = (v) => (v == null ? ND : pf1.format(v));

/** Importe compacto para ejes: 1,2 M€ / 350 k€. */
export function fmtEURCompact(v) {
  if (v == null) return ND;
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(v / 1_000_000)} M€`;
  if (abs >= 1_000) return `${nf0.format(v / 1_000)} k€`;
  return `${nf0.format(v)} €`;
}

/** 'YYYY-MM-DD' → 'dd/mm/aaaa'. */
export const fmtDate = (iso) =>
  iso == null ? ND : `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** 'YYYY-MM' → 'ene 25' (abreviado, para ejes). */
export function fmtMonthShort(isoMonth) {
  if (!isoMonth) return '';
  const m = MESES[Number(isoMonth.slice(5, 7)) - 1];
  return `${m} ${isoMonth.slice(2, 4)}`;
}

/** 'YYYY-MM' → 'enero 2025' (largo, para tooltips). */
export function fmtMonthLong(isoMonth) {
  if (!isoMonth) return '';
  const d = new Date(`${isoMonth}-01T00:00:00Z`);
  return d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Variación con signo: '+12,3 %' / '−4,1 %'. */
export function fmtDeltaPct(v) {
  if (v == null || !isFinite(v)) return null;
  const s = pf1.format(Math.abs(v));
  return v >= 0 ? `+${s}` : `−${s}`;
}

/** Variación en puntos porcentuales: '+1,4 pp'. */
export function fmtDeltaPP(v) {
  if (v == null || !isFinite(v)) return null;
  const s = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(v * 100));
  return v >= 0 ? `+${s} pp` : `−${s} pp`;
}
