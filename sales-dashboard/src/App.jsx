import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseWorkbook } from './lib/parseWorkbook.js';
import {
  EMPTY_FILTERS, filterVentas, computeKpisWithDelta, monthlySeries,
  byDimension, topClientes, rankingProductos, agingCartera, distinctValues,
  dataDateRange, dateShortcuts, hasDimensionFilter, comparativaAnual,
} from './lib/calculations.js';
import { fmtDate, fmtPct, ND } from './lib/format.js';
import DropZone from './components/DropZone.jsx';
import FilterBar from './components/FilterBar.jsx';
import KpiGrid from './components/KpiGrid.jsx';
import ChartCard from './components/ChartCard.jsx';
import MonthlyChart from './components/MonthlyChart.jsx';
import MarginChart from './components/MarginChart.jsx';
import HBarList from './components/HBarList.jsx';
import TopClients from './components/TopClients.jsx';
import ProductRanking from './components/ProductRanking.jsx';
import AgingChart from './components/AgingChart.jsx';
import DetailTable from './components/DetailTable.jsx';
import YearComparison from './components/YearComparison.jsx';

export default function App() {
  const [data, setData] = useState(null);        // resultado de parseWorkbook
  const [fileMeta, setFileMeta] = useState(null); // { name, loadedAt }
  const [loadErrors, setLoadErrors] = useState(null);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [dragging, setDragging] = useState(false);

  const loadFile = useCallback(async (file) => {
    setLoadErrors(null);
    try {
      const buf = await file.arrayBuffer();
      const parsed = parseWorkbook(buf);
      if (!parsed.ok) {
        setLoadErrors(parsed.errors);
        return;
      }
      const { min, max } = dataDateRange(parsed.ventas);
      setData(parsed);
      setFileMeta({ name: file.name, loadedAt: new Date() });
      setFilters({ ...EMPTY_FILTERS, desde: min, hasta: max });
    } catch (e) {
      setLoadErrors([`No se ha podido leer el fichero: ${e.message}`]);
    }
  }, []);

  // Autocarga opcional: si la página anfitriona inyecta el libro en base64
  // (window.__XLSX_BASE64__), se carga al abrir. La app en sí no trae datos.
  useEffect(() => {
    const b64 = window.__XLSX_BASE64__;
    if (!b64 || data) return;
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    loadFile(new File([bytes], window.__XLSX_NAME__ ?? 'Control_Ventas_Tornilleria.xlsx'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Arrastrar y soltar sobre toda la ventana
  useEffect(() => {
    const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
    const onDragLeave = (e) => { if (!e.relatedTarget) setDragging(false); };
    const onDrop = (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) loadFile(file);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [loadFile]);

  const ventas = data?.ventas;
  const rows = useMemo(
    () => (ventas ? filterVentas(ventas, filters) : []),
    [ventas, filters],
  );
  const dimensioned = hasDimensionFilter(filters);

  const kpis = useMemo(
    () => (data ? computeKpisWithDelta(ventas, data.gastos, data.parametros.objetivos, filters) : null),
    [data, ventas, filters],
  );

  const monthly = useMemo(
    () => (data && filters.desde
      ? monthlySeries(rows, data.parametros.objetivos, filters.desde, filters.hasta, !dimensioned)
      : []),
    [data, rows, filters, dimensioned],
  );

  // La comparativa de años aplica los filtros de dimensión pero ignora el
  // rango de fechas: comparar ejercicios exige verlos todos.
  const comparativa = useMemo(
    () => (ventas ? comparativaAnual(filterVentas(ventas, { ...filters, desde: null, hasta: null })) : null),
    [ventas, filters],
  );

  const porPais = useMemo(() => byDimension(rows, 'pais'), [rows]);
  const porCanal = useMemo(() => byDimension(rows, 'canal'), [rows]);
  const porFamilia = useMemo(() => byDimension(rows, 'familia'), [rows]);
  const clientes = useMemo(() => topClientes(rows, 10), [rows]);
  const productos = useMemo(() => rankingProductos(rows), [rows]);
  const aging = useMemo(
    () => agingCartera(rows, new Date().toISOString().slice(0, 10)),
    [rows],
  );

  const options = useMemo(() => {
    if (!ventas) return null;
    return {
      paises: distinctValues(ventas, 'pais'),
      canales: distinctValues(ventas, 'canal'),
      familias: distinctValues(ventas, 'familia'),
      comerciales: distinctValues(ventas, 'comercial'),
      estados: distinctValues(ventas, 'estadoCobro'),
      shortcuts: dateShortcuts(ventas),
      range: dataDateRange(ventas),
    };
  }, [ventas]);

  // Un clic en país/canal/familia de un gráfico alterna ese valor como filtro
  const toggleFilter = useCallback((key, value) => {
    setFilters((f) => {
      const arr = f[key];
      return { ...f, [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value] };
    });
  }, []);

  const ultimoDato = options?.range?.max;

  return (
    <div className="mx-auto max-w-[1400px] px-3 py-3 sm:px-4">
      {dragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed"
          style={{ borderColor: 'var(--c-blue)', background: 'color-mix(in srgb, var(--page) 80%, transparent)' }}>
          <p className="text-lg font-semibold">Suelta el fichero .xlsx para cargarlo</p>
        </div>
      )}

      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold leading-tight">Control de ventas · Tornillería</h1>
          <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {data
              ? <>Último dato: <span className="num">{fmtDate(ultimoDato)}</span> · Fichero: {fileMeta?.name} · Cargado {fileMeta?.loadedAt.toLocaleString('es-ES')}</>
              : 'Importes netos sin IVA, en euros'}
          </p>
        </div>
        {data && <DropZone compact onFile={loadFile} />}
      </header>

      {loadErrors && (
        <div className="card mb-3 border-l-4 p-3 text-sm" style={{ borderLeftColor: 'var(--c-red)' }}>
          <p className="mb-1 font-semibold">El fichero no se ha podido cargar:</p>
          <ul className="list-disc pl-5">
            {loadErrors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
          <p className="mt-1" style={{ color: 'var(--ink-2)' }}>
            Corrige el Excel y vuelve a arrastrarlo. {data ? 'Se mantienen los datos anteriores.' : ''}
          </p>
        </div>
      )}

      {!data ? (
        <DropZone onFile={loadFile} />
      ) : (
        <>
          <FilterBar filters={filters} setFilters={setFilters} options={options} />

          <KpiGrid kpis={kpis} />

          {dimensioned && (
            <p className="mb-2 text-xs" style={{ color: 'var(--ink-2)' }}>
              Hay filtros de dimensión activos: los gastos de explotación no están repartidos por
              país, canal, familia, comercial ni estado de cobro, así que EBITDA, gastos y
              cumplimiento de objetivo se muestran como «{ND}».
            </p>
          )}

          <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard
              title="Ingresos mensuales frente a objetivo"
              subtitle={dimensioned
                ? 'Objetivo oculto: no está repartido por dimensiones'
                : (kpis.current.cumplimiento != null ? `Cumplimiento del periodo: ${fmtPct(kpis.current.cumplimiento)}` : undefined)}
            >
              <MonthlyChart data={monthly} showObjetivo={!dimensioned} />
            </ChartCard>
            <ChartCard title="Margen de contribución % por mes"
              subtitle="Ingresos − coste de ventas − portes − comisión, sobre ingresos">
              <MarginChart data={monthly} />
            </ChartCard>
          </div>

          <div className="mb-3">
            <ChartCard title="Comparativa de años"
              subtitle="Mismos meses de calendario superpuestos por ejercicio · aplica los filtros de dimensión e ignora el rango de fechas">
              <YearComparison data={comparativa} />
            </ChartCard>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-3">
            <ChartCard title="Ingresos por país" subtitle="Clic para filtrar">
              <HBarList data={porPais} activos={filters.paises} onClick={(v) => toggleFilter('paises', v)} />
            </ChartCard>
            <ChartCard title="Ingresos por canal" subtitle="Clic para filtrar">
              <HBarList data={porCanal} activos={filters.canales} onClick={(v) => toggleFilter('canales', v)} />
            </ChartCard>
            <ChartCard title="Ingresos por familia" subtitle="Clic para filtrar">
              <HBarList data={porFamilia} activos={filters.familias} onClick={(v) => toggleFilter('familias', v)} />
            </ChartCard>
          </div>

          <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <ChartCard title="Top 10 clientes por facturación" subtitle="Con su margen % al lado">
              <TopClients data={clientes} />
            </ChartCard>
            <ChartCard title="Antigüedad de la cartera no cobrada"
              subtitle="Pendiente + vencido, por días desde el vencimiento teórico (a hoy)">
              <AgingChart data={aging} />
            </ChartCard>
          </div>

          <div className="mb-3">
            <ChartCard title="Ranking de productos" subtitle="Ordenable por margen € o margen %">
              <ProductRanking data={productos} />
            </ChartCard>
          </div>

          <ChartCard title={`Detalle de líneas (${rows.length.toLocaleString('es-ES')})`}
            subtitle="Ordenable, paginada y exportable a CSV">
            <DetailTable rows={rows} />
          </ChartCard>

          <footer className="py-3 text-center text-xs" style={{ color: 'var(--ink-3)' }}>
            Los datos no salen del navegador: el fichero se lee en local con SheetJS.
          </footer>
        </>
      )}
    </div>
  );
}
