# 🎾 Torneo de Pádel — doble eliminación (máx. 200 parejas)

Dos web apps que comparten una base de datos Supabase:

| App | Archivo | Quién la usa |
|---|---|---|
| **Participantes** | `index.html` | Las parejas: se inscriben, ven su rival/día/hora cuando el organizador publica el cuadro, y envían el resultado con su código secreto |
| **Organizador** | `admin.html` | Solo el administrador: configura todo, sortea el cuadro, programa horarios y corrige resultados |

## Cómo funciona el torneo

- **Doble eliminación**: cuadro principal + cuadro de perdedores (repesca) + gran final.
  Nadie queda fuera hasta perder dos partidos.
- El administrador fija el **número exacto de parejas** (2–200). Si no sale potencia de 2, los *byes* se reparten y resuelven solos.
- Las parejas se inscriben y reciben un **código secreto de 6 caracteres** — con él consultan sus partidos y envían resultados.
- El cuadro **no es visible** para los participantes hasta que el administrador lo publica (interruptor "Cuadro visible").
- Al enviar un resultado, el ganador y el perdedor **avanzan automáticamente** por los dos cuadros. Cuando se juega la final, se proclama campeón automáticamente.
- **Programación automática**: el admin define días, horario, duración de partido y pistas, y un botón asigna día/hora/pista a todos los partidos respetando el orden de rondas. Todo se puede retocar a mano.

## Puesta en marcha (2 pasos)

1. **Base de datos**: en tu proyecto de Supabase, abre *SQL Editor* y ejecuta el contenido de
   `../supabase/migrations/20260731120000_padel_tournament.sql`.
2. **Conexión**: edita `js/config.js` y pon la URL del proyecto y la clave *anon/publishable*
   (Supabase → Settings → API). Esa clave es pública, es seguro incluirla en la web.

Sube la carpeta `padel/` a cualquier hosting estático (GitHub Pages, Netlify, el propio hosting del club…).

## Seguridad

- Contraseña inicial del administrador: **`padel2026`** → cámbiala en el panel (pestaña Configuración) el primer día.
- Las tablas tienen RLS activado sin políticas: **no hay acceso directo a los datos**. Todo pasa por funciones RPC que validan la contraseña del admin o el código secreto de la pareja.
- Los teléfonos y códigos secretos solo los ve el administrador.

## Limitaciones conocidas (honestidad ante todo)

- Corregir un resultado ya jugado solo es posible si los partidos posteriores aún no se han jugado; si no, hay que corregir primero los posteriores (o reiniciar el cuadro).
- La programación automática asigna huecos en orden de ronda, pero no garantiza descansos mínimos entre partidos de una misma pareja; revisa el calendario antes de publicarlo.
- Cualquiera de las dos parejas puede enviar el resultado de su partido (no exige confirmación de la rival); el admin siempre puede corregirlo.
