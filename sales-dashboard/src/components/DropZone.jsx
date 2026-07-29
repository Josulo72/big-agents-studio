import { useRef } from 'react';

/**
 * Zona de carga del .xlsx. En modo `compact` es solo un botón para actualizar
 * los datos; sin datos cargados es el estado vacío con instrucciones.
 * El fichero se lee en el navegador: nada se sube a ningún servidor.
 */
export default function DropZone({ onFile, compact = false }) {
  const inputRef = useRef(null);

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept=".xlsx"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) onFile(f);
        e.target.value = '';
      }}
    />
  );

  if (compact) {
    return (
      <div>
        {input}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded border px-3 py-1.5 text-xs font-semibold hover:opacity-80"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-1)' }}
        >
          Actualizar datos (.xlsx)
        </button>
      </div>
    );
  }

  return (
    <div
      className="card flex min-h-[60vh] flex-col items-center justify-center gap-3 border-2 border-dashed p-8 text-center"
      style={{ borderColor: 'var(--axis)' }}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
    >
      {input}
      <p className="text-xl font-semibold">Arrastra aquí tu Control_Ventas_Tornilleria.xlsx</p>
      <p className="max-w-xl text-sm" style={{ color: 'var(--ink-2)' }}>
        O haz clic para elegirlo. El fichero se lee íntegramente en tu navegador con SheetJS:
        no se sube nada a ningún servidor. Debe contener las hojas <b>Ventas</b>, <b>Gastos</b> y{' '}
        <b>Parametros</b> con el esquema original; si falta alguna hoja o columna verás un
        mensaje indicando exactamente cuál.
      </p>
      <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
        Cuando actualices tu Excel, vuelve a arrastrarlo y el dashboard se recalcula.
      </p>
    </div>
  );
}
