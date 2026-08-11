# Chat traductor ES ↔ БГ

Chat para dos personas en el que cada una escribe en su idioma y lee siempre en
el suyo. La traducción es automática: no hay botón de "traducir".

El mensaje original nunca se pierde. Se guardan por separado el texto tal cual
se escribió (`source_text`) y las traducciones generadas (`translations`), y
cualquier mensaje recibido deja desplegar el original debajo de la traducción.

```
React 18 + Vite + TypeScript + Tailwind
Supabase (Postgres + Realtime + Auth)
DeepL API Free, detrás de una Edge Function en Deno
```

---

## Puesta en marcha

### 1. Proyecto de Supabase

Crear el proyecto y, en el SQL Editor, ejecutar en este orden:

1. `supabase/migrations/0001_init.sql` — tablas, RLS, publicación de Realtime.
2. `supabase/seed.sql` — perfiles, sala y pertenencias. **Editar antes** los dos
   correos y los dos nombres que hay al principio del bloque.

Antes del paso 2 hay que crear las dos cuentas:

- **Authentication → Providers → Email**: desactivar *Enable Sign Ups*. No hay
  registro público; son dos cuentas y punto.
- **Authentication → Users → Add user**: una por cada correo, con *Auto Confirm
  User* activado. No hace falta contraseña, se entra por magic link.
- **Authentication → URL Configuration**: añadir la URL de producción a
  *Redirect URLs* (y `http://localhost:5173` para desarrollo).

### 2. Edge Function

```bash
supabase link --project-ref <ref>
supabase secrets set DEEPL_API_KEY='...'      # la clave Free acaba en :fx
supabase functions deploy translate-message
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta la plataforma; no hay
que declararlos.

La función elige el host de DeepL según el sufijo de la clave (`:fx` → plan
Free). Se puede forzar con el secret `DEEPL_API_URL`.

### 3. Frontend

```bash
cp .env.example .env      # rellenar URL y anon key
npm install
npm run dev
```

### 4. Despliegue

En Vercel o Netlify, con el directorio raíz apuntando a `chat-traductor/`
(`netlify.toml` ya lo declara). Variables de entorno: las mismas tres del
`.env`. Ambos ficheros de configuración incluyen ya el *rewrite* a
`index.html` y las cabeceras de caché.

---

## Cómo funciona

### Ciclo de un mensaje

1. El cliente genera un `client_id` (uuid v4) e inserta la fila con
   `status = 'pending'` y `translations = {}`. La burbuja aparece en el acto,
   antes incluso de que el servidor conteste.
2. Realtime propaga el `INSERT`: el otro participante ve el texto original y el
   indicador de traducción en curso.
3. El cliente invoca `translate-message` con el `message.id`.
4. La función calcula los idiomas destino (los de los miembros de la sala,
   menos `source_lang`), llama a DeepL y actualiza `translations` y `status`.
5. Realtime propaga el `UPDATE` y ambos clientes sustituyen el contenido de la
   burbuja sin recargar nada.

Si DeepL falla, `status = 'failed'` y `error_detail` guarda el código HTTP y el
cuerpo de la respuesta. El mensaje llega igual en su idioma original, marcado, y
con un botón para reintentar. El mensaje nunca se pierde ni se bloquea.

La función es idempotente: si ya existen todas las claves de idioma, retorna sin
llamar a DeepL.

### `translations`

```json
{ "bg": "Ще се видим утре." }
```

El cliente lee `translations[miIdioma]` y, si esa clave no existe, muestra
`source_text`. Sirve de caché, evita duplicar columnas y permite añadir un
tercer idioma sin migrar nada. Nunca se traduce a `source_lang`: quien escribió
el mensaje lo ve siempre tal cual lo escribió.

### Realtime y vuelta del segundo plano

En móvil el WebSocket se cae al bloquear la pantalla, y el cliente no siempre se
entera. Al volver a primer plano (tras más de 3 segundos fuera) la app se
resuscribe al canal y, **ya con el canal vivo**, refetcha:

- todo lo posterior a la última marca temporal conocida, y
- el estado actual de los mensajes que aún no están traducidos, porque su
  `UPDATE` pudo perderse mientras tanto.

Ese orden — primero suscribirse, después refetchar — es lo que evita la ventana
ciega entre lo que trae el fetch y lo que empieza a emitir Realtime.

La deduplicación va por `client_id`, no por `id`: la burbuja optimista y la fila
que llega por Realtime son el mismo mensaje. Y un payload `pending` que llegue
tarde nunca degrada un mensaje ya traducido.

El indicador de "escribiendo" va por Broadcast, no por tabla, para no escribir en
Postgres en cada tecla. `typing_state` queda en el esquema como reserva.

---

## Seguridad

- RLS activo en las cinco tablas. Un usuario solo ve las salas de las que es
  miembro, y solo puede insertar mensajes con `sender_id = auth.uid()`.
- **Sin políticas de `update` ni `delete` sobre `messages`**: con RLS activo, la
  ausencia de política las deniega. Las traducciones solo las escribe la Edge
  Function con la `service_role`.
- Las políticas que consultan `room_members` lo hacen a través de funciones
  `security definer` (`is_room_member`, `shares_room_with`). Consultar la tabla
  directamente desde su propia política provoca recursión infinita en RLS.
- `DEEPL_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` viven solo en los secrets de
  Supabase. `npm run check:secrets` revisa `dist/` y falla si alguna se ha
  colado; distingue el JWT anónimo (que sí debe estar) del de `service_role`.

### Comprobar el aislamiento contra la API REST

La UI no es prueba de nada. Con el token de un usuario que no sea miembro de la
sala, ambas cosas deben devolver vacío o error:

```bash
# Debe devolver []
curl -s "$SUPABASE_URL/rest/v1/messages?select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_NO_MIEMBRO"

# Debe devolver 401/403
curl -s -X POST "$SUPABASE_URL/rest/v1/messages" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $TOKEN_NO_MIEMBRO" \
  -H "Content-Type: application/json" \
  -d '{"room_id":"'"$ROOM_ID"'","sender_id":"'"$OTRO_ID"'","source_lang":"es",
       "source_text":"prueba","client_id":"'"$(uuidgen)"'"}'
```

---

## Diseño

La app trata sobre dos alfabetos que conviven; eso es el material.

| Token | Hex | Uso |
|---|---|---|
| `--ink` | `#0F1620` | Fondo general |
| `--surface` | `#18232F` | Burbujas del otro, barras |
| `--line` | `#2B3948` | Divisores, bordes |
| `--lang-es` | `#E0A040` | Ámbar: identidad del español |
| `--lang-bg` | `#48ADA4` | Verde jade: identidad del búlgaro |
| `--text` | `#E9EEF3` | Texto principal |
| `--muted` | `#8496A6` | Metadatos, texto original |

El color no decora: indica en qué idioma se escribió el mensaje, y aparece en la
etiqueta y en el divisor del eco.

**El eco** es el elemento distintivo. Cada burbuja recibida muestra la traducción
a tamaño de lectura y, bajo una línea de 1 px del color del idioma origen, el
texto original en mono a 12 px. Colapsado por defecto, se despliega al tocar la
burbuja con una transición de altura de 180 ms. Es lo que evita que la app
parezca una caja negra.

### Fuentes

Unbounded (display), Golos Text (cuerpo) y JetBrains Mono (utilidad) van
**auto-alojadas** en `public/fonts`, no enlazadas a Google Fonts.

Es deliberado. El fallo silencioso más típico de un proyecto así es que la
fuente cargue, el cirílico caiga al fallback del sistema, y la app se vea
descuadrada solo para el participante búlgaro. Sirviendo los `woff2` desde el
propio origen, el subset cirílico o está en el repositorio o no está, y
`npm run fonts` falla explícitamente si alguna familia no lo trae. De paso,
desaparecen las peticiones a terceros y la app abre offline con su tipografía.

Para regenerarlas tras cambiar familias o pesos:

```bash
npm run fonts   # descarga latin, latin-ext, cyrillic y cyrillic-ext
npm run icons   # regenera los iconos de la PWA
```

---

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Typecheck + build de producción |
| `npm test` | Tests de la lógica de mensajes |
| `npm run check:secrets` | Busca secretos en `dist/` (tras `build`) |
| `npm run fonts` | Descarga y auto-aloja las tres familias |
| `npm run icons` | Regenera los iconos de la PWA |

---

## Consumo de DeepL

El plan Free son 500.000 caracteres al mes. Para dos personas conversando a
diario sobra, pero conviene mirarlo de vez en cuando. La propia Edge Function lo
devuelve:

```bash
curl -s -X POST "$SUPABASE_URL/functions/v1/translate-message" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"usage":true}'
# → {"character_count":12345,"character_limit":500000}
```

No se consulta en cada mensaje a propósito: añadiría una llamada de red al
camino crítico de cada traducción.

---

## Limitaciones conocidas

- **Registro formal**: DeepL no ofrece control de formalidad para búlgaro. Las
  traducciones tenderán a un registro neutro-formal. Si en uso real resulta
  molesto, la alternativa es sustituir DeepL por un LLM con un prompt que fije el
  registro informal. Es un cambio localizado en `deeplTranslate()`: no toca ni el
  esquema ni el frontend.
- **Sin contexto conversacional**: cada mensaje se traduce aislado, así que los
  pronombres ambiguos y las respuestas de una palabra ("vale", "ese") pueden
  salir raras. Se resolvería pasando los 3 o 4 mensajes anteriores como
  contexto, pero eso exige un LLM en vez de DeepL.
- **Modismos**: se traducirán mal. Es inherente.

## Preparado para voz (sin implementar)

El esquema ya contempla `kind` y `media_url`. Una nota de voz será un mensaje con
`kind = 'voice'`, el audio en Supabase Storage y `source_text` relleno con la
transcripción. El resto del flujo de traducción no cambia — la función ya ignora
los mensajes sin texto en vez de mandarle una cadena vacía a DeepL.
