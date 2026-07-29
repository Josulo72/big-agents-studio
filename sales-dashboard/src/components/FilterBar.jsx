import MultiSelect from './MultiSelect.jsx';
import { EMPTY_FILTERS } from '../lib/calculations.js';

/** Barra de filtros: rango de fechas con atajos + dimensiones multiselección. */
export default function FilterBar({ filters, setFilters, options }) {
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));

  const isShortcutActive = (s) => filters.desde === s.desde && filters.hasta === s.hasta;
  const anyFilter =
    filters.paises.length || filters.canales.length || filters.familias.length ||
    filters.comerciales.length || filters.estados.length;

  return (
    <div className="card mb-3 flex flex-wrap items-center gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1">
        {options.shortcuts.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => set({ desde: s.desde, hasta: s.hasta })}
            className="rounded px-2 py-1 text-xs"
            style={isShortcutActive(s)
              ? { background: 'var(--c-blue)', color: '#fff', fontWeight: 600 }
              : { background: 'transparent', color: 'var(--ink-2)' }}
          >
            {s.label}
          </button>
        ))}
      </div>

      <span className="hidden h-5 w-px sm:block" style={{ background: 'var(--grid)' }} />

      <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-2)' }}>
        Desde
        <input
          type="date"
          value={filters.desde ?? ''}
          min={options.range.min}
          max={options.range.max}
          onChange={(e) => set({ desde: e.target.value || options.range.min })}
          className="rounded border px-1 py-0.5 text-xs num"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--ink-1)' }}
        />
      </label>
      <label className="flex items-center gap-1 text-xs" style={{ color: 'var(--ink-2)' }}>
        Hasta
        <input
          type="date"
          value={filters.hasta ?? ''}
          min={options.range.min}
          onChange={(e) => set({ hasta: e.target.value || options.range.max })}
          className="rounded border px-1 py-0.5 text-xs num"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)', color: 'var(--ink-1)' }}
        />
      </label>

      <span className="hidden h-5 w-px sm:block" style={{ background: 'var(--grid)' }} />

      <MultiSelect label="País" options={options.paises} selected={filters.paises}
        onChange={(v) => set({ paises: v })} />
      <MultiSelect label="Canal" options={options.canales} selected={filters.canales}
        onChange={(v) => set({ canales: v })} />
      <MultiSelect label="Familia" options={options.familias} selected={filters.familias}
        onChange={(v) => set({ familias: v })} />
      <MultiSelect label="Comercial" options={options.comerciales} selected={filters.comerciales}
        onChange={(v) => set({ comerciales: v })} />
      <MultiSelect label="Estado cobro" options={options.estados} selected={filters.estados}
        onChange={(v) => set({ estados: v })} />

      {anyFilter > 0 && (
        <button
          type="button"
          className="ml-auto rounded px-2 py-1 text-xs font-semibold"
          style={{ color: 'var(--c-blue)' }}
          onClick={() => set({
            ...EMPTY_FILTERS,
            desde: filters.desde,
            hasta: filters.hasta,
          })}
        >
          Limpiar dimensiones
        </button>
      )}
    </div>
  );
}
