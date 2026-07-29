import { useEffect, useRef, useState } from 'react';

/** Desplegable de selección múltiple con casillas. */
export default function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const toggle = (v) =>
    onChange(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);

  const active = selected.length > 0;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded border px-2 py-1 text-xs"
        style={{
          borderColor: active ? 'var(--c-blue)' : 'var(--border)',
          background: 'var(--surface-1)',
          fontWeight: active ? 600 : 400,
        }}
      >
        {label}
        {active ? ` (${selected.length})` : ''} ▾
      </button>
      {open && (
        <div
          className="card absolute z-40 mt-1 max-h-64 min-w-[180px] overflow-auto p-1 shadow-lg"
        >
          {options.map((o) => (
            <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:opacity-70">
              <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} />
              {o}
            </label>
          ))}
          {active && (
            <button
              type="button"
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs font-semibold"
              style={{ color: 'var(--c-blue)' }}
              onClick={() => onChange([])}
            >
              Quitar filtro
            </button>
          )}
        </div>
      )}
    </div>
  );
}
