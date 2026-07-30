/*
 * Criterios de aceptación — se ejecutan contra el Excel real usando
 * EXACTAMENTE los mismos módulos que el dashboard (parseWorkbook y
 * calculations). `npm run verify`.
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as XLSX from 'xlsx';
import { parseWorkbook } from '../src/lib/parseWorkbook.js';
import {
  EMPTY_FILTERS, computeKpis, filterVentas, sumIngresos, dataDateRange,
  comparativaAnual,
} from '../src/lib/calculations.js';

const here = dirname(fileURLToPath(import.meta.url));
const FILE = process.argv[2] ?? join(here, '..', 'data', 'Control_Ventas_Tornilleria.xlsx');
const buf = readFileSync(FILE);

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};
const close = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const eur = (v) => `${v.toFixed(2)} €`;

const parsed = parseWorkbook(buf);
if (!parsed.ok) {
  console.error('El fichero de referencia no se ha podido parsear:', parsed.errors);
  process.exit(1);
}
const { ventas, gastos, parametros } = parsed;
const { min, max } = dataDateRange(ventas);
const noFilters = { ...EMPTY_FILTERS, desde: min, hasta: max };

// Referencias leídas directamente del Excel (independientes del parser)
const wb = XLSX.read(buf, { cellDates: true });
const raw = XLSX.utils.sheet_to_json(wb.Sheets['Ventas'], { header: 1, raw: true, defval: null })
  .slice(1)
  .filter((r) => r[0] != null);
const refIngresos = raw.reduce((a, r) => a + (r[15] || 0), 0);
const refPedidos = raw.reduce((a, r) => a + (r[24] || 0), 0);

// ── 1. Sin filtros, los ingresos coinciden con el total de la columna P ──────
const k = computeKpis(ventas, gastos, parametros.objetivos, noFilters);
check(
  '1. Ingresos sin filtros = total columna P del Excel',
  close(k.ingresos, refIngresos),
  `dashboard ${eur(k.ingresos)} · Excel ${eur(refIngresos)}`,
);

// ── 2. El nº de pedidos coincide con la suma de la columna Y ─────────────────
check(
  '2. Nº de pedidos = suma de la columna Y',
  k.pedidos === refPedidos,
  `dashboard ${k.pedidos} · Excel ${refPedidos}`,
);

// ── 3. Filtrando un año, ingresos y margen coinciden con PL_Mensual ──────────
const pl = XLSX.utils.sheet_to_json(wb.Sheets['PL_Mensual'], { header: 1, raw: true, defval: null });
for (const year of ['2025', '2026']) {
  const plRow = pl.find((r) => typeof r[0] === 'string' && r[0].startsWith(year));
  if (!plRow) { check(`3. PL_Mensual: fila del ejercicio ${year}`, false); continue; }
  const ky = computeKpis(ventas, gastos, parametros.objetivos, {
    ...EMPTY_FILTERS, desde: `${year}-01-01`, hasta: `${year}-12-31`,
  });
  check(
    `3. Año ${year}: ingresos = PL_Mensual`,
    close(ky.ingresos, plRow[1]),
    `dashboard ${eur(ky.ingresos)} · PL ${eur(plRow[1])}`,
  );
  check(
    `3. Año ${year}: margen = PL_Mensual`,
    close(ky.margen, plRow[2]),
    `dashboard ${eur(ky.margen)} · PL ${eur(plRow[2])}`,
  );
  check(
    `3. Año ${year}: EBITDA = PL_Mensual`,
    close(ky.ebitda, plRow[5]),
    `dashboard ${eur(ky.ebitda)} · PL ${eur(plRow[5])}`,
  );
}

// ── 4. Al filtrar por país, EBITDA (y gastos y cumplimiento) muestran n/d ────
const kPais = computeKpis(ventas, gastos, parametros.objetivos, {
  ...noFilters, paises: ['España'],
});
check(
  '4. Filtro por país ⇒ EBITDA, gastos y cumplimiento = n/d',
  kPais.ebitda === null && kPais.gastosPeriodo === null && kPais.cumplimiento === null,
  `ebitda=${kPais.ebitda} gastos=${kPais.gastosPeriodo} cumplimiento=${kPais.cumplimiento}`,
);

// ── 5. Los abonos reducen los ingresos en un mes que los contenga ────────────
const mesConAbono = ventas.find((v) => v.tipo === 'Abono')?.mes;
const delMes = ventas.filter((v) => v.mes === mesConAbono);
const conAbonos = sumIngresos(delMes);
const sinAbonos = sumIngresos(delMes.filter((v) => v.tipo !== 'Abono'));
const abonosNegativos = delMes.filter((v) => v.tipo === 'Abono').every((v) => v.ingresos < 0);
check(
  `5. Los abonos restan ingresos (mes ${mesConAbono})`,
  conAbonos < sinAbonos && abonosNegativos,
  `con abonos ${eur(conAbonos)} < sin abonos ${eur(sinAbonos)}`,
);
// …y el filtrado nunca excluye abonos
const filtradoEspana = filterVentas(ventas, { ...noFilters, paises: ['España'] });
check(
  '5b. El filtrado conserva las líneas de abono',
  filtradoEspana.some((v) => v.tipo === 'Abono'),
);

// ── 6. Columna renombrada ⇒ error explicativo, no un fallo ───────────────────
const wb2 = XLSX.read(buf, { cellDates: true });
wb2.Sheets['Ventas']['P1'] = { t: 's', v: 'Facturación' }; // renombra «Ingresos netos»
const buf2 = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' });
const parsed2 = parseWorkbook(buf2);
check(
  '6. Columna renombrada produce un error explicativo',
  !parsed2.ok && parsed2.errors.some((e) => e.includes('Ingresos netos') && e.includes('Facturación')),
  parsed2.errors[0],
);

// hoja que falta
const wb3 = XLSX.read(buf, { cellDates: true });
delete wb3.Sheets['Gastos'];
wb3.SheetNames = wb3.SheetNames.filter((n) => n !== 'Gastos');
const parsed3 = parseWorkbook(XLSX.write(wb3, { type: 'buffer', bookType: 'xlsx' }));
check(
  '6b. Hoja que falta produce un error explicativo',
  !parsed3.ok && parsed3.errors.some((e) => e.includes('Gastos')),
  parsed3.errors[0],
);

// ── 7. Comparativa interanual coherente con PL_Mensual ───────────────────────
const comp = comparativaAnual(ventas);
const r26 = comp.resumen.find((r) => r.year === '2026');
const plMes = new Map(
  pl
    .filter((r) => r[0] instanceof Date && !isNaN(r[0]))
    .map((r) => [r[0].toISOString().slice(0, 7), r[1]]),
);
const mesesComp = r26?.varComparable?.meses ?? [];
const ant = mesesComp.reduce((a, mm) => a + (plMes.get(`2025-${mm}`) ?? 0), 0);
const cur = mesesComp.reduce((a, mm) => a + (plMes.get(`2026-${mm}`) ?? 0), 0);
const refPct = ant !== 0 ? (cur - ant) / ant : null;
check(
  '7. Comparativa 2026 vs 2025 (meses comparables) = PL_Mensual',
  r26?.varComparable != null && refPct != null && close(r26.varComparable.pct, refPct, 1e-9),
  `dashboard ${(r26?.varComparable?.pct * 100).toFixed(2)} % · PL ${(refPct * 100).toFixed(2)} % (${mesesComp.length} meses)`,
);

console.log(failures === 0 ? '\nTodos los criterios de aceptación se cumplen.' : `\n${failures} criterio(s) fallan.`);
process.exit(failures === 0 ? 0 : 1);
