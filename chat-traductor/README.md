# Chat traductor ES ↔ БГ

Chat para dos personas en el que cada una escribe en su idioma y lee siempre en
el suyo. La traducción es automática: no hay botón de "traducir".

El mensaje original nunca se pierde. Se guardan por separado el texto tal cual
se escribió (`source_text`) y las traducciones generadas (`translations`), y
cualquier mensaje recibido deja desplegar el original debajo de la traducción.

```
React 18 + Vite + TypeScript + Tailwind
Supabase (Postgres + Realtime + Auth anónima)
DeepL API Free, detrás de una Edge Function en Deno
```

---

## Puesta en marcha

### 1. Proyecto de Supabase

En el SQL Editor, ejecutar en este orden:

1. `supabase/migrations/0001_init.sql` — tablas, RLS, publicación de Realtime.
2. `supabase/migrations/0002_acceso_sin_login.sql` — plazas reclamables.
3. `supabase/migrations/0003_push.sql` — suscripciones de notificaciones.
4. `supabase/migrations/0004_retirar_andamiaje_pruebas.sql` — limpieza de la
   prueba de RLS que se hizo durante la puesta en marcha. En una instalación
   nueva no encuentra nada y no hace nada.
5. `supabase/seed.sql` — la sala y sus dos plazas. **Editar antes** los dos
   nombres.

Y en el panel:

- **Authentication → Sign In / Providers → Allow anonymous sign-ins**:
  activarlo. Sin esto no se puede entrar.
- **Authentication → Providers → Email**: desactivar *Enable Sign Ups*. No se
  usa el correo para nada, pero mejor que no exista la puerta.

No hay cuentas que crear.

### 2. Edge Function

```bash
supabase link --project-ref <ref>

# Proveedor de traducción: UNO de los dos (ver más abajo)
supabase secrets set DEEPL_API_KEY='...'      # la clave Free acaba en :fx
# supabase secrets set GEMINI_API_KEY='...'   # alternativa sin tarjeta

# Notificaciones (opcional; sin esto la app va igual, pero sin avisos)
supabase secrets set VAPID_PUBLIC_KEY='...'
supabase secrets set VAPID_PRIVATE_JWK='{"kty":"EC","crv":"P-256",...}'
supabase secrets set VAPID_SUBJECT='mailto:tu@correo.com'

supabase functions deploy translate-message
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta la plataforma; no hay
que declararlos.

La función elige el host de DeepL según el sufijo de la clave (`:fx` → plan
Free). Se puede forzar con el secret `DEEPL_API_URL`.

### Proveedor de traducción

Hay dos, y se elige solo según qué clave esté puesta. Si están las dos, manda
DeepL.

| | DeepL API Free | Gemini (Google AI Studio) |
|---|---|---|
| Coste | Gratis, 500.000 car./mes | Gratis, con límites por minuto |
| Registro | **Pide tarjeta** para verificar identidad (no cobra) | Solo cuenta de Google, **sin tarjeta** |
| Calidad en búlgaro | Muy buena | Buena |
| Registro informal | No se puede controlar | Se le fija por prompt |
| Contexto conversacional | No | Sí, los 4 mensajes anteriores |

Es decir: Gemini arregla dos de las tres limitaciones conocidas de más abajo, a
cambio de algo de calidad bruta. Cambiar de uno a otro es poner o quitar un
secret — no toca ni el esquema ni el frontend.

Los nombres de modelo de Gemini caducan. El secret `GEMINI_MODEL` lo fija
(por defecto `gemini-2.5-flash`), y si ese modelo no existe para tu clave, el
`error_detail` del mensaje trae la lista real de modelos disponibles en vez de
un 404 mudo.

Clave de Gemini: <https://aistudio.google.com/apikey>

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

## Acceso: sin login, pero con identidad

Nadie escribe correo ni contraseña. Al abrir la app, el navegador abre una
**sesión anónima** de Supabase y lo único que ve el usuario es una pantalla con
dos nombres: toca el suyo y entra. Solo la primera vez en cada dispositivo.

Esa sesión anónima es lo que hace que siga habiendo un `auth.uid()` real, y por
tanto que el RLS siga protegiendo algo. Sin identidad en la base de datos, la
clave anónima que va necesariamente dentro del bundle bastaría para que
cualquiera leyese la conversación entera por la API REST.

**Las plazas se reparten por orden de llegada.** La primera sesión que reclama
la plaza española se queda con ella y a partir de ahí está cerrada; `claim_slot`
serializa con `for update`, así que dos reclamos simultáneos no se pisan.
Conviene reclamar las dos antes de que la URL circule por ningún sitio. RLS solo
deja ver las plazas libres, de modo que una vez cogidas las dos, quien llegue de
fuera no ve ni los nombres.

Si alguien reclama una plaza por error:

```sql
select public.release_slot('<room_id>', 'es');
```

## Notificaciones

Web Push estándar, sin servicios de terceros. La propia Edge Function, después
de traducir, avisa a los demás miembros de la sala — cada uno en **su** idioma,
igual que en la burbuja: si hay traducción, la traducción; si no, el original.
Si DeepL falla también se avisa: el mensaje ha llegado igual.

El cifrado (RFC 8291) y la firma VAPID (RFC 8292) están implementados a mano
con WebCrypto en `webpush.ts`, sin dependencias. Hay una verificación real
contra `http_ece`, una implementación independiente del mismo RFC:

```bash
npm run verify:webpush
```

Comprueba que lo que ciframos lo descifra otro, que la cabecera `aes128gcm` está
bien formada y que la firma ES256 valida con la clave pública anunciada.

**En iOS los avisos solo existen si la app está instalada en la pantalla de
inicio.** En Safari normal el `PushManager` ni aparece; no es un fallo. El botón
de la barra se calla en ese caso en vez de ofrecer algo que no va a funcionar.

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

- RLS activo en las siete tablas. Un usuario solo ve las salas de las que es
  miembro, y solo puede insertar mensajes con `sender_id = auth.uid()`.
- **Sin políticas de `update` ni `delete` sobre `messages`**: con RLS activo, la
  ausencia de política las deniega. Las traducciones solo las escribe la Edge
  Function con la `service_role`.
- Las políticas que consultan `room_members` lo hacen a través de funciones
  `security definer` (`is_room_member`, `shares_room_with`). Consultar la tabla
  directamente desde su propia política provoca recursión infinita en RLS.
- `DEEPL_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY` y `VAPID_PRIVATE_JWK` viven solo
  en los secrets de Supabase. `npm run check:secrets` revisa `dist/` y falla si
  alguna se ha colado; distingue el JWT anónimo y la clave VAPID pública (que
  sí deben estar) del `service_role` y de la VAPID privada.
- `claim_slot` y `release_slot` son `security definer` y solo `claim_slot` está
  concedida a `authenticated`: liberar una plaza requiere el SQL Editor.

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
| `npm run verify:webpush` | Verifica el cifrado push contra `http_ece` |
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
