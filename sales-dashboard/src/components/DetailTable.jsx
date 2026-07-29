import { useMemo, useState } from 'react';
import { fmtDate, fmtEUR, fmtNum, fmtPct } from '../lib/format.js';

const PAGE_SIZE = 25;

const COLS = [
  { key: 'fecha', label: 'Fecha', numeric: false, fmt: fmtDate },
  { key: 'pedido', label: 'Pedido', numeric: false },
  { key: 'cliente', label: 'Cliente', numeric: false },
  { key: 'pais', label: 'País', numeric: false },
  { key: 'canal', label: 'Canal', numeric: false },
  { key: 'comercial', label: 'Comercial', numeric: false },
  { key: 'producto', label: 'Producto', numeric: false },
  { key: 'familia', label: 'Familia', numeric: false },
  { key: 'tipo', label: 'Tipo', numeric: false },
  { key: 'cajas', label: 'Cajas', numeric: true, fmt: fmtNum },
  { key: 'precioNeto', label: 'P. neto', numeric: true, fmt: (v) => fmtEUR(v, 2) },
  { key: 'ingresos', label: 'Ingresos', numeric: true, fmt: (v) => fmtEUR(v, 2) },
  { key: 'margen', label: 'Margen €', numeric: true, fmt: (v) => fmtEUR(v, 2) },
  { key: 'margenPct', label: 'Margen %', numeric: true, fmt: fmtPct },
  { key: 'vto', label: 'Vto. cobro', numeric: false, fmt: fmtDate },
  { key: 'estadoCobro', label: 'Estado', numeric: false },
];

/** Exporta las filas filtradas a CSV para Excel español (separador ';', UTF-8 BOM). */
function exportCSV(rows) {
  const dec = (v) => String(v).replace('.', ',');
  const esc = (v) => {
    const s = String(v ?? '');
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = COLS.map((c) => c.label).join(';');
  const lines = rows.map((r) =>
    COLS.map((c) => {
      const v = r[c.key];
      if (c.key === 'fecha' || c.key === 'vto') return fmtDate(v);
      if (typeof v === 'number') return dec(Math.round(v * 10000) / 10000);
      return esc(v);
    }).join(';'),
  );
  const blob = new Blob([`﻿${header}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'detalle_ventas_filtrado.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export default function DetailTable({ rows }) {
  const [sort, setSort] = useState({ key: 'fecha', dir: -1 });
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    const { key, dir } = sort;
    return [...rows].sort((a, b) => {
      const va = a[key] ?? '';
      const vb = b[key] ?? '';
      if (typeof va === 'string') return va.localeCompare(vb, 'es') * dir;
      return (va - vb) * dir;
    });
  }, [rows, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const clickSort = (key) => {
    setSort((s) => ({ key, dir: s.key === key ? -s.dir : -1 }));
    setPage(0);
  };

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-xs">
          <thead>
            <tr className="text-left" style={{ color: 'var(--ink-3)' }}>
              {COLS.map((c) => (
                <th key={c.key}
                  className={`cursor-pointer select-none pb-1 pr-2 font-normal ${c.numeric ? 'text-right' : ''}`}
                  onClick={() => clickSort(c.key)}>
                  {c.label}{sort.key === c.key ? (sort.dir === -1 ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={`${r.pedido}-${r.codigo}-${i}`} className="border-t" style={{ borderColor: 'var(--grid)' }}>
                {COLS.map((c) => {
                  const v = c.fmt ? c.fmt(r[c.key]) : r[c.key];
                  const negative =
                    (c.key === 'ingresos' || c.key === 'margen' || c.key === 'cajas') && r[c.key] < 0;
                  const vencido = c.key === 'estadoCobro' && r.estadoCobro === 'Vencido';
                  return (
                    <td key={c.key}
                      className={`py-0.5 pr-2 ${c.numeric ? 'text-right num' : ''} ${c.key === 'producto' || c.key === 'cliente' ? 'max-w-[220px] truncate' : ''}`}
                      title={c.key === 'producto' || c.key === 'cliente' ? r[c.key] : undefined}
                      style={negative || vencido ? { color: 'var(--c-red)' } : undefined}>
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1">
          <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}
            className="rounded border px-2 py-1 disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}>
            ← Anterior
          </button>
          <span className="num px-1" style={{ color: 'var(--ink-2)' }}>
            Página {safePage + 1} de {pages}
          </span>
          <button type="button" disabled={safePage >= pages - 1} onClick={() => setPage(safePage + 1)}
            className="rounded border px-2 py-1 disabled:opacity-40"
            style={{ borderColor: 'var(--border)' }}>
            Siguiente →
          </button>
        </div>
        <button type="button" onClick={() => exportCSV(sorted)}
          className="rounded border px-2 py-1 font-semibold"
          style={{ borderColor: 'var(--border)' }}>
          Exportar CSV ({sorted.length.toLocaleString('es-ES')} filas)
        </button>
      </div>
    </div>
  );
}
