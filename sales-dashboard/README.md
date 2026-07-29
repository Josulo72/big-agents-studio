# Dashboard de control de ventas · Tornillería

Dashboard web que lee `Control_Ventas_Tornilleria.xlsx` íntegramente en el navegador
(SheetJS) y permite entender la situación del negocio en menos de 30 segundos.
Sin backend, sin base de datos, sin autenticación: los datos no salen del navegador.

**Stack:** React + Vite + Tailwind + Recharts + SheetJS.

## Cómo arrancarlo

```bash
cd sales-dashboard
npm install
npm run dev        # desarrollo en http://localhost:5173
npm run build      # genera dist/ (npm run preview para servirlo)
npm run verify     # criterios de aceptación contra data/Control_Ventas_Tornilleria.xlsx
```

## Cómo actualizar los datos

Arrastra el `.xlsx` a cualquier punto de la página (o pulsa **Actualizar datos**).
El dashboard valida que existan las hojas `Ventas`, `Gastos` y `Parametros` con el
esquema original y se recalcula al momento; si falta una hoja o hay una columna
renombrada, muestra un mensaje indicando exactamente cuál. La cabecera muestra la
fecha del último dato cargado. Hay una copia del fichero en `data/` para probar.

## Dónde se define cada cálculo

| Qué | Dónde |
|---|---|
| Lectura y validación del Excel | `src/lib/parseWorkbook.js` |
| **Todas** las reglas de negocio (funciones puras) | `src/lib/calculations.js` |
| Formato español (miles con punto, €, dd/mm/aaaa) | `src/lib/format.js` |
| Criterios de aceptación ejecutables | `scripts/verify.mjs` (usa los mismos módulos que la app) |

Definiciones clave (comentadas en la cabecera de `calculations.js`):

- **Margen de contribución** = Ingresos netos − Coste de ventas − Portes − Comisión
  (columna U). Incluye logística y comisión: no es margen bruto industrial.
- **EBITDA** = margen de contribución − gastos de explotación del periodo. Los gastos
  no están repartidos por dimensiones: con cualquier filtro de país, canal, familia,
  comercial o estado de cobro, EBITDA, gastos y cumplimiento se muestran como **n/d**.
- **Nº de pedidos** = suma de la columna `Pedido único` (Y), nunca un conteo de filas.
- Los **abonos** (importes negativos) nunca se filtran: restan de ingresos y margen.
- **Cartera pendiente** = Pendiente + Vencido; **cartera vencida** = solo Vencido.

## Decisiones tomadas

- El filtro por **estado de cobro** también pone EBITDA en n/d (la regla del modelo
  lista país/canal/producto/comercial; un subconjunto por estado de cobro tampoco
  tiene gastos atribuibles, así que se aplica el mismo criterio conservador).
- El **periodo anterior equivalente** de los KPIs se calcula desplazando el rango:
  meses completos → mismos meses hacia atrás (Año 2026 se compara con 2025);
  rangos parciales → mismo número de días. Con «Todo» no hay periodo anterior y
  la variación se omite.
- El **nº de pedidos filtrado** sigue la regla literal (suma de Y): al filtrar por
  familia, un pedido cuya primera línea sea de otra familia no cuenta.
- La **antigüedad de la cartera** se calcula sobre la fecha actual del navegador,
  en tramos de días desde el vencimiento teórico (col. W).
- Los **atajos de fechas** se anclan a la última fecha con datos (jun-2026), no a hoy,
  para que «últimos 6 meses» nunca quede vacío con datos históricos.
- El **CSV** se exporta con separador `;`, decimales con coma y BOM UTF-8 para que
  el Excel español lo abra directamente en columnas.

## Qué queda fuera

- Reparto de gastos por dimensión (prohibido por el modelo), previsiones, y las hojas
  `Dashboard`/`KPIs`/`PL_Mensual` del Excel (son derivadas; la app calcula lo mismo
  desde `Ventas`, `Gastos` y `Parametros`, y `verify.mjs` lo comprueba contra PL_Mensual).
- Persistencia entre sesiones: al recargar la página hay que volver a arrastrar el
  fichero (a cambio, nada se almacena en ningún sitio).
