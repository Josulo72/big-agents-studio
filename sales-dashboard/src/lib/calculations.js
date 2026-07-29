/*
 * Cálculos del dashboard — funciones puras y testeables.
 *
 * DEFINICIONES QUE NO SE CAMBIAN SIN SABERLO:
 *
 *  · MARGEN DE CONTRIBUCIÓN = Ingresos netos − Coste de ventas − Portes − Comisión
 *    (columna U del Excel). Incluye logística y comisión: NO es margen bruto industrial.
 *
 *  · EBITDA = Margen de contribución − Gastos de explotación del mismo periodo.
 *    Los gastos NO están repartidos por país, canal, familia, comercial ni estado
 *    de cobro. Con cualquier filtro de dimensión activo, EBITDA, gastos y
 *    cumplimiento de objetivo se devuelven como null («n/d»): no se inventa
 *    ningún criterio de reparto.
 *
 *  · Nº DE PEDIDOS = suma de la columna «Pedido único» (Y), nunca un conteo de
 *    filas. Nota: al filtrar por familia/producto, un pedido cuya primera línea
 *    quede fuera del filtro no cuenta; es la regla literal del modelo.
 *
 *  · Los ABONOS (Tipo = Abono) llevan cajas e importes negativos y NUNCA se
 *    filtran: restan de ingresos, cajas y margen.
 *
 *  · CARTERA PENDIENTE = ingresos con estado Pendiente o Vencido.
 *    CARTERA VENCIDA = solo estado Vencido.
 *
 *  · CUMPLIMIENTO = ingresos del periodo / objetivo del periodo (hoja Parametros).
 */

export const EMPTY_FILTERS = {
  desde: null,   // 'YYYY-MM-DD' inclusive
  hasta: null,   // 'YYYY-MM-DD' inclusive
  paises: [],
  canales: [],
  familias: [],
  comerciales: [],
  estados: [],
};

/** ¿Hay algún filtro de dimensión activo? (invalida EBITDA/gastos/objetivo) */
export function hasDimensionFilter(f) {
  return (
    f.paises.length > 0 ||
    f.canales.length > 0 ||
    f.familias.length > 0 ||
    f.comerciales.length > 0 ||
    f.estados.length > 0
  );
}

/** Aplica todos los filtros de forma cruzada. Los abonos nunca se excluyen. */
export function filterVentas(rows, f) {
  const inSet = (arr, v) => arr.length === 0 || arr.includes(v);
  return rows.filter(
    (r) =>
      (!f.desde || r.fecha >= f.desde) &&
      (!f.hasta || r.fecha <= f.hasta) &&
      inSet(f.paises, r.pais) &&
      inSet(f.canales, r.canal) &&
      inSet(f.familias, r.familia) &&
      inSet(f.comerciales, r.comercial) &&
      inSet(f.estados, r.estadoCobro),
  );
}

const sum = (rows, key) => rows.reduce((a, r) => a + r[key], 0);

export const sumIngresos = (rows) => sum(rows, 'ingresos');
export const sumMargen = (rows) => sum(rows, 'margen'); // margen de contribución (col U)
export const sumCajas = (rows) => sum(rows, 'cajas');
export const numPedidos = (rows) => sum(rows, 'pedidoUnico'); // regla 4: suma de Y

export const carteraPendiente = (rows) =>
  sumIngresos(rows.filter((r) => r.estadoCobro === 'Pendiente' || r.estadoCobro === 'Vencido'));

export const carteraVencida = (rows) =>
  sumIngresos(rows.filter((r) => r.estadoCobro === 'Vencido'));

/** Gastos de explotación cuyo mes cae dentro del rango [desde, hasta]. */
export function gastosEnPeriodo(gastos, desde, hasta) {
  const mDesde = desde ? desde.slice(0, 7) : null;
  const mHasta = hasta ? hasta.slice(0, 7) : null;
  return gastos
    .filter((g) => (!mDesde || g.mes >= mDesde) && (!mHasta || g.mes <= mHasta))
    .reduce((a, g) => a + g.importe, 0);
}

/** Objetivo de ventas acumulado del rango (hoja Parametros). */
export function objetivoEnPeriodo(objetivos, desde, hasta) {
  const mDesde = desde ? desde.slice(0, 7) : null;
  const mHasta = hasta ? hasta.slice(0, 7) : null;
  return Object.entries(objetivos)
    .filter(([m, v]) => v != null && (!mDesde || m >= mDesde) && (!mHasta || m <= mHasta))
    .reduce((a, [, v]) => a + v, 0);
}

/* ---------- fechas auxiliares (sobre strings ISO, sin zona horaria) ------- */

const toDate = (iso) => new Date(`${iso}T00:00:00Z`);
const toISO = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
};
const addMonths = (iso, n) => {
  const d = toDate(iso);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return toISO(d);
};
const isFirstOfMonth = (iso) => iso.slice(8) === '01';
const isLastOfMonth = (iso) => addDays(iso, 1).slice(8) === '01';
export const endOfMonth = (isoMonth) => addDays(addMonths(`${isoMonth}-01`, 1), -1);

/**
 * Periodo anterior equivalente al rango [desde, hasta].
 * Si el rango son meses completos se desplaza en meses (año actual → año
 * anterior); si no, se desplaza por el mismo número de días.
 */
export function previousRange(desde, hasta) {
  if (!desde || !hasta) return null;
  if (isFirstOfMonth(desde) && isLastOfMonth(hasta)) {
    const months =
      (toDate(hasta).getUTCFullYear() - toDate(desde).getUTCFullYear()) * 12 +
      (toDate(hasta).getUTCMonth() - toDate(desde).getUTCMonth()) + 1;
    const prevDesde = addMonths(desde, -months);
    return { desde: prevDesde, hasta: addDays(desde, -1) };
  }
  const days = Math.round((toDate(hasta) - toDate(desde)) / 86400000) + 1;
  return { desde: addDays(desde, -days), hasta: addDays(desde, -1) };
}

/** Lista 'YYYY-MM' de los meses del rango. */
export function monthsInRange(desde, hasta) {
  const out = [];
  let m = desde.slice(0, 7);
  const last = hasta.slice(0, 7);
  while (m <= last) {
    out.push(m);
    m = addMonths(`${m}-01`, 1).slice(0, 7);
  }
  return out;
}

/* ---------- bloque de KPIs ------------------------------------------------ */

/**
 * KPIs del periodo. EBITDA/gastos/objetivo/cumplimiento van a null («n/d»)
 * cuando hay filtros de dimensión — regla 7 del modelo.
 */
export function computeKpis(allRows, gastos, objetivos, filters) {
  const rows = filterVentas(allRows, filters);
  const ingresos = sumIngresos(rows);
  const margen = sumMargen(rows);
  const pedidos = numPedidos(rows);
  const dimensioned = hasDimensionFilter(filters);

  let gastosPeriodo = null;
  let ebitda = null;
  let objetivo = null;
  let cumplimiento = null;
  if (!dimensioned) {
    gastosPeriodo = gastosEnPeriodo(gastos, filters.desde, filters.hasta);
    // EBITDA = margen de contribución − gastos de explotación del periodo
    ebitda = margen - gastosPeriodo;
    objetivo = objetivoEnPeriodo(objetivos, filters.desde, filters.hasta);
    cumplimiento = objetivo > 0 ? ingresos / objetivo : null;
  }

  return {
    ingresos,
    margen,
    margenPct: ingresos !== 0 ? margen / ingresos : null,
    ebitda,
    gastosPeriodo,
    pedidos,
    ticketMedio: pedidos > 0 ? ingresos / pedidos : null,
    cajas: sumCajas(rows),
    carteraVencida: carteraVencida(rows),
    carteraPendiente: carteraPendiente(rows),
    objetivo,
    cumplimiento,
    dimensioned,
  };
}

/** KPIs del periodo actual + del anterior equivalente (para las variaciones). */
export function computeKpisWithDelta(allRows, gastos, objetivos, filters) {
  const current = computeKpis(allRows, gastos, objetivos, filters);
  const prevRange = previousRange(filters.desde, filters.hasta);
  let previous = null;
  if (prevRange) {
    const prevFilters = { ...filters, ...prevRange };
    const prev = computeKpis(allRows, gastos, objetivos, prevFilters);
    // Solo hay comparación si el periodo anterior tiene actividad
    if (prev.ingresos !== 0 || prev.pedidos !== 0) previous = prev;
  }
  return { current, previous };
}

/* ---------- agregaciones para gráficos ------------------------------------ */

/** Serie mensual: ingresos, margen, margen % y objetivo por mes del rango. */
export function monthlySeries(rows, objetivos, desde, hasta, includeObjetivo) {
  const byMonth = new Map();
  for (const r of rows) {
    const m = byMonth.get(r.mes) ?? { ingresos: 0, margen: 0 };
    m.ingresos += r.ingresos;
    m.margen += r.margen;
    byMonth.set(r.mes, m);
  }
  return monthsInRange(desde, hasta).map((mes) => {
    const m = byMonth.get(mes) ?? { ingresos: 0, margen: 0 };
    return {
      mes,
      ingresos: m.ingresos,
      margen: m.margen,
      margenPct: m.ingresos !== 0 ? m.margen / m.ingresos : null,
      objetivo: includeObjetivo ? (objetivos[mes] ?? null) : null,
    };
  });
}

/** Composición de ingresos por una dimensión (pais, canal, familia…). */
export function byDimension(rows, key) {
  const map = new Map();
  for (const r of rows) {
    const k = r[key];
    const m = map.get(k) ?? { name: k, ingresos: 0, margen: 0 };
    m.ingresos += r.ingresos;
    m.margen += r.margen;
    map.set(k, m);
  }
  return [...map.values()].sort((a, b) => b.ingresos - a.ingresos);
}

/** Top N clientes por facturación, con su margen % al lado. */
export function topClientes(rows, n = 10) {
  return byDimension(rows, 'cliente')
    .slice(0, n)
    .map((c) => ({ ...c, margenPct: c.ingresos !== 0 ? c.margen / c.ingresos : null }));
}

/** Ranking de productos por margen € y margen %. */
export function rankingProductos(rows) {
  const map = new Map();
  for (const r of rows) {
    const m = map.get(r.codigo) ?? {
      codigo: r.codigo, producto: r.producto, familia: r.familia,
      ingresos: 0, margen: 0, cajas: 0,
    };
    m.ingresos += r.ingresos;
    m.margen += r.margen;
    m.cajas += r.cajas;
    map.set(r.codigo, m);
  }
  return [...map.values()].map((p) => ({
    ...p,
    margenPct: p.ingresos !== 0 ? p.margen / p.ingresos : null,
  }));
}

export const AGING_BUCKETS = ['No vencido', '1–30 días', '31–60 días', '61–90 días', '> 90 días'];

/**
 * Antigüedad de la cartera no cobrada (Pendiente + Vencido) por tramo de
 * días transcurridos desde el vencimiento teórico, respecto a refDate.
 */
export function agingCartera(rows, refDate) {
  const buckets = AGING_BUCKETS.map((b) => ({ bucket: b, Pendiente: 0, Vencido: 0 }));
  for (const r of rows) {
    if (r.estadoCobro !== 'Pendiente' && r.estadoCobro !== 'Vencido') continue;
    const days = r.vto
      ? Math.floor((toDate(refDate) - toDate(r.vto)) / 86400000)
      : 0;
    const i = days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4;
    buckets[i][r.estadoCobro] += r.ingresos;
  }
  return buckets;
}

/** Valores únicos ordenados de una dimensión (para poblar los filtros). */
export function distinctValues(rows, key) {
  return [...new Set(rows.map((r) => r[key]))].sort((a, b) =>
    a.localeCompare(b, 'es'),
  );
}

/** Rango de fechas presente en los datos. */
export function dataDateRange(rows) {
  let min = null;
  let max = null;
  for (const r of rows) {
    if (!min || r.fecha < min) min = r.fecha;
    if (!max || r.fecha > max) max = r.fecha;
  }
  return { min, max };
}

/** Atajos de rango relativos a la última fecha con datos. */
export function dateShortcuts(rows) {
  const { min, max } = dataDateRange(rows);
  if (!min) return [];
  const year = max.slice(0, 4);
  const maxMonth = max.slice(0, 7);
  const lastN = (n) => ({
    desde: addMonths(`${maxMonth}-01`, -(n - 1)),
    hasta: endOfMonth(maxMonth),
  });
  return [
    { id: 'todo', label: 'Todo', desde: min, hasta: max },
    { id: 'anio', label: `Año ${year}`, desde: `${year}-01-01`, hasta: `${year}-12-31` },
    { id: 'anio-1', label: `Año ${year - 1}`, desde: `${year - 1}-01-01`, hasta: `${year - 1}-12-31` },
    { id: '6m', label: 'Últimos 6 meses', ...lastN(6) },
    { id: '12m', label: 'Últimos 12 meses', ...lastN(12) },
  ];
}
