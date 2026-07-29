/*
 * Lectura y validación del fichero Control_Ventas_Tornilleria.xlsx.
 * Funciona en navegador y en Node (recibe un ArrayBuffer/Uint8Array).
 * No inventa columnas: valida el esquema exacto y devuelve errores explicativos.
 */
import * as XLSX from 'xlsx';

export const VENTAS_HEADERS = [
  'Nº pedido', 'Fecha', 'Mes', 'Cliente', 'País', 'Canal', 'Comercial',
  'Código', 'Producto', 'Familia', 'Tipo', 'Cajas', 'Precio lista', 'Dto. %',
  'Precio neto', 'Ingresos netos', 'Coste unit. fabricación', 'Coste de ventas',
  'Portes', 'Comisión', 'Margen bruto', 'Margen %', 'Vto. cobro',
  'Estado cobro', 'Pedido único',
];

export const GASTOS_HEADERS = ['Mes', 'Categoría', 'Tipo', 'Importe'];

const REQUIRED_SHEETS = ['Ventas', 'Gastos', 'Parametros'];

/** Fecha (Date de SheetJS, en UTC) → 'YYYY-MM-DD'. Null si no es fecha. */
function toISODate(v) {
  if (v instanceof Date && !isNaN(v)) {
    // SheetJS con cellDates:true crea las fechas ancladas a UTC:
    // usar getUTC* evita corrimientos de día por zona horaria.
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function validateHeaders(actual, expected, sheetName, errors) {
  const actualNorm = actual.map(norm);
  const missing = [];
  for (let i = 0; i < expected.length; i++) {
    if (actualNorm[i] !== norm(expected[i])) {
      missing.push(
        `columna ${String.fromCharCode(65 + i)} debería ser «${expected[i]}»` +
          (actualNorm[i] ? ` y se ha encontrado «${actualNorm[i]}»` : ' y está vacía'),
      );
    }
  }
  if (missing.length) {
    errors.push(`Hoja «${sheetName}»: la cabecera no coincide con el esquema esperado — ${missing.join('; ')}.`);
  }
}

/**
 * Parsea el libro completo.
 * @param {ArrayBuffer|Uint8Array} data contenido binario del .xlsx
 * @returns {{ ok: boolean, errors: string[], ventas?: object[], gastos?: object[], parametros?: object }}
 */
export function parseWorkbook(data) {
  const errors = [];
  let wb;
  try {
    wb = XLSX.read(data, { cellDates: true });
  } catch {
    return { ok: false, errors: ['El fichero no se ha podido leer como un libro de Excel (.xlsx).'] };
  }

  for (const s of REQUIRED_SHEETS) {
    if (!wb.SheetNames.includes(s)) errors.push(`Falta la hoja «${s}» en el libro.`);
  }
  if (errors.length) return { ok: false, errors };

  // ---- Hoja Ventas -------------------------------------------------------
  const ventasRows = XLSX.utils.sheet_to_json(wb.Sheets['Ventas'], {
    header: 1, raw: true, defval: null,
  });
  validateHeaders(ventasRows[0] ?? [], VENTAS_HEADERS, 'Ventas', errors);

  // ---- Hoja Gastos -------------------------------------------------------
  const gastosRows = XLSX.utils.sheet_to_json(wb.Sheets['Gastos'], {
    header: 1, raw: true, defval: null,
  });
  validateHeaders(gastosRows[0] ?? [], GASTOS_HEADERS, 'Gastos', errors);

  if (errors.length) return { ok: false, errors };

  const ventas = [];
  for (const r of ventasRows.slice(1)) {
    if (r[0] == null || r[1] == null) continue; // filas vacías o de resumen
    const fecha = toISODate(r[1]);
    if (!fecha) continue;
    ventas.push({
      pedido: String(r[0]),
      fecha,
      mes: toISODate(r[2])?.slice(0, 7) ?? fecha.slice(0, 7),
      cliente: norm(r[3]),
      pais: norm(r[4]),
      canal: norm(r[5]),
      comercial: norm(r[6]),
      codigo: norm(r[7]),
      producto: norm(r[8]),
      familia: norm(r[9]),
      tipo: norm(r[10]),                 // Venta | Abono (los abonos vienen en negativo)
      cajas: Number(r[11]) || 0,
      precioLista: Number(r[12]) || 0,
      dto: Number(r[13]) || 0,
      precioNeto: Number(r[14]) || 0,
      ingresos: Number(r[15]) || 0,      // col P — negativo en abonos, NO se filtran
      costeUnit: Number(r[16]) || 0,
      costeVentas: Number(r[17]) || 0,   // col R
      portes: Number(r[18]) || 0,        // col S
      comision: Number(r[19]) || 0,      // col T
      margen: Number(r[20]) || 0,        // col U = P − R − S − T (margen de contribución)
      margenPct: Number(r[21]) || 0,
      vto: toISODate(r[22]),
      estadoCobro: norm(r[23]),          // Cobrado | Pendiente | Vencido
      pedidoUnico: Number(r[24]) || 0,   // col Y — 1 en la primera línea de cada pedido
    });
  }
  if (!ventas.length) errors.push('La hoja «Ventas» no contiene ninguna fila de datos válida.');

  // La hoja Gastos puede llevar filas de resumen (p. ej. «TOTAL») sin fecha:
  // solo se aceptan filas cuyo Mes sea una fecha real.
  const gastos = [];
  for (const r of gastosRows.slice(1)) {
    const mes = toISODate(r[0]);
    if (!mes) continue;
    gastos.push({
      mes: mes.slice(0, 7),
      categoria: norm(r[1]),
      tipo: norm(r[2]), // Fijo | Variable
      importe: Number(r[3]) || 0,
    });
  }
  if (!gastos.length) errors.push('La hoja «Gastos» no contiene ninguna fila de datos válida.');

  // ---- Hoja Parametros (celdas fijas según el esquema) --------------------
  const par = wb.Sheets['Parametros'];
  const cell = (addr) => par[addr]?.v ?? null;
  const objetivos = {}; // 'YYYY-MM' → objetivo de ventas del mes
  const indiceAcero = {};
  for (let row = 26; row <= 43; row++) {
    const mes = toISODate(cell(`A${row}`) instanceof Date ? cell(`A${row}`) : null);
    if (!mes) continue;
    const key = mes.slice(0, 7);
    indiceAcero[key] = Number(cell(`B${row}`)) || null;
    objetivos[key] = Number(cell(`C${row}`)) || null;
  }
  if (!Object.keys(objetivos).length) {
    errors.push('Hoja «Parametros»: no se han encontrado los objetivos mensuales en C26:C43.');
  }

  const comisionCanal = {};
  const diasCobroCanal = {};
  for (let row = 13; row <= 16; row++) {
    const canal = norm(cell(`A${row}`));
    if (!canal) continue;
    comisionCanal[canal] = Number(cell(`B${row}`)) || 0;
    diasCobroCanal[canal] = Number(cell(`C${row}`)) || 0;
  }
  const portesPais = {};
  for (let row = 20; row <= 22; row++) {
    const pais = norm(cell(`A${row}`));
    if (pais) portesPais[pais] = Number(cell(`B${row}`)) || 0;
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    errors: [],
    ventas,
    gastos,
    parametros: { objetivos, indiceAcero, comisionCanal, diasCobroCanal, portesPais },
  };
}
