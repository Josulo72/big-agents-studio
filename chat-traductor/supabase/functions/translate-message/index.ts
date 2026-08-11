// Edge Function `translate-message`
//
// Entrada:  { "message_id": "uuid" }   con el JWT del usuario en Authorization
//           { "usage": true }          devuelve el consumo del plan de DeepL
// Salida:   { "status": "translated" | "failed", "translations": {...} }
//
// Secrets (nunca en el frontend):
//   DEEPL_API_KEY *o* GEMINI_API_KEY  — proveedor de traducción, ver translate.ts
//   VAPID_*                            — notificaciones, opcional
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — los inyecta la plataforma

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json } from './cors.ts'
import { sendPush, type PushSubscription, type VapidDetails } from './webpush.ts'
import {
  activeProvider,
  translate,
  usage as providerUsage,
  type ContextMessage,
  type Lang,
} from './translate.ts'

interface Member {
  id: string
  lang: Lang
  display_name: string
}

interface MessageRow {
  id: string
  room_id: string
  sender_id: string
  source_lang: Lang
  source_text: string
  translations: Record<string, string>
  status: 'pending' | 'translated' | 'failed'
  created_at: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Notificaciones: si no hay claves VAPID configuradas, todo el bloque de push
// simplemente no existe y la traducción sigue funcionando igual.
const VAPID: VapidDetails | null = (() => {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const privateJwk = Deno.env.get('VAPID_PRIVATE_JWK')
  const subject = Deno.env.get('VAPID_SUBJECT')
  if (!publicKey || !privateJwk || !subject) return null
  try {
    return { publicKey, privateJwk: JSON.parse(privateJwk), subject }
  } catch {
    console.error('VAPID_PRIVATE_JWK no es un JSON válido')
    return null
  }
})()

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // 1. Validar el JWT ------------------------------------------------------
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: 'missing_authorization' }, 401)

  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData?.user) {
    return json({ error: 'invalid_token' }, 401)
  }
  const userId = userData.user.id

  let body: { message_id?: string; usage?: boolean }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }

  if (body.usage === true) {
    return json(await providerUsage())
  }

  const messageId = body.message_id
  if (!messageId || typeof messageId !== 'string') {
    return json({ error: 'missing_message_id' }, 400)
  }

  // 2. Cargar el mensaje y comprobar pertenencia a la sala -----------------
  const { data: message, error: msgError } = await admin
    .from('messages')
    .select(
      'id, room_id, sender_id, source_lang, source_text, translations, status, created_at',
    )
    .eq('id', messageId)
    .maybeSingle<MessageRow>()

  if (msgError) return json({ error: 'db_error', detail: msgError.message }, 500)
  if (!message) return json({ error: 'not_found' }, 404)

  const { data: membership, error: memberError } = await admin
    .from('room_members')
    .select('profile_id')
    .eq('room_id', message.room_id)
    .eq('profile_id', userId)
    .maybeSingle()

  if (memberError) {
    return json({ error: 'db_error', detail: memberError.message }, 500)
  }
  if (!membership) return json({ error: 'forbidden' }, 403)

  // 3. Idiomas destino: los de los miembros de la sala, menos el de origen --
  const { data: memberRows, error: membersError } = await admin
    .from('room_members')
    .select('profiles!inner(id, lang, display_name)')
    .eq('room_id', message.room_id)

  if (membersError) {
    return json({ error: 'db_error', detail: membersError.message }, 500)
  }

  const members = (memberRows ?? [])
    .map((row) => (row as unknown as { profiles: Member }).profiles)
    .filter(Boolean)

  const targets = [...new Set(members.map((m) => m.lang))].filter(
    (lang) => lang !== message.source_lang,
  )

  const existing = message.translations ?? {}
  const missing = targets.filter(
    (lang) => typeof existing[lang] !== 'string' || existing[lang].length === 0,
  )

  // Idempotencia: nada que hacer, no se llama a DeepL.
  if (missing.length === 0) {
    if (message.status !== 'translated') {
      await admin
        .from('messages')
        .update({ status: 'translated', error_detail: null })
        .eq('id', message.id)
    }
    return json({ status: 'translated', translations: existing })
  }

  // Un mensaje sin texto (p. ej. voz aún sin transcribir) no se traduce.
  if (!message.source_text.trim()) {
    return json({ status: message.status, translations: existing })
  }

  // 4. Traducir ------------------------------------------------------------
  // Gemini sí aprovecha los mensajes anteriores para desambiguar pronombres y
  // respuestas de una palabra; DeepL traduce cada mensaje aislado y no los usa.
  const context =
    activeProvider() === 'gemini' ? await recentContext(message) : []

  const translations: Record<string, string> = { ...existing }
  try {
    for (const target of missing) {
      translations[target] = await translate(
        message.source_text,
        message.source_lang,
        target,
        context,
      )
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    await admin
      .from('messages')
      .update({
        status: 'failed',
        error_detail: detail.slice(0, 500),
        translations, // se conserva lo que sí se pudo traducir
      })
      .eq('id', message.id)
    console.error('translate-message failed', message.id, detail)
    // Se avisa igual: el mensaje ha llegado, aunque sea sin traducir.
    await notifyOthers(message, translations, members)
    return json({ status: 'failed', translations, error: detail }, 200)
  }

  // 5. Persistir -----------------------------------------------------------
  const { error: updateError } = await admin
    .from('messages')
    .update({ translations, status: 'translated', error_detail: null })
    .eq('id', message.id)

  if (updateError) {
    return json({ error: 'db_error', detail: updateError.message }, 500)
  }

  await notifyOthers(message, translations, members)

  return json({ status: 'translated', translations })
})

// ---------------------------------------------------------------------------

const NOTIFICATION_MAX_CHARS = 140

/**
 * Avisa por push a todos los miembros de la sala menos al que escribió.
 *
 * Cada destinatario recibe el texto en SU idioma, igual que en la burbuja: si
 * la traducción existe, la traducción; si no, el original. Un fallo aquí nunca
 * tumba la traducción, que es lo importante.
 */
async function notifyOthers(
  message: MessageRow,
  translations: Record<string, string>,
  members: Member[],
): Promise<void> {
  if (!VAPID) return

  const recipients = members.filter((member) => member.id !== message.sender_id)
  if (recipients.length === 0) return

  const senderName =
    members.find((member) => member.id === message.sender_id)?.display_name ?? ''

  try {
    const { data: subscriptions, error } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, profile_id')
      .in(
        'profile_id',
        recipients.map((r) => r.id),
      )

    if (error) throw error
    if (!subscriptions || subscriptions.length === 0) return

    const byProfile = new Map(recipients.map((r) => [r.id, r]))

    const results = await Promise.allSettled(
      subscriptions.map((row) => {
        const recipient = byProfile.get(row.profile_id as string)!
        const text = translations[recipient.lang] ?? message.source_text
        const body =
          text.length > NOTIFICATION_MAX_CHARS
            ? `${text.slice(0, NOTIFICATION_MAX_CHARS - 1)}…`
            : text

        return sendPush(
          row as unknown as PushSubscription,
          {
            title: senderName,
            body,
            lang: recipient.lang,
            tag: `room:${message.room_id}`,
            url: '/',
          },
          VAPID!,
        )
      }),
    )

    // Endpoints que el navegador ya ha tirado: se limpian para no reintentar
    // contra ellos en cada mensaje.
    const gone = results
      .filter(
        (result): result is PromiseFulfilledResult<{ endpoint: string; gone: boolean }> =>
          result.status === 'fulfilled' && result.value.gone,
      )
      .map((result) => result.value.endpoint)

    if (gone.length > 0) {
      await admin.from('push_subscriptions').delete().in('endpoint', gone)
    }
  } catch (err) {
    console.error('push', err instanceof Error ? err.message : String(err))
  }
}

// ---------------------------------------------------------------------------

const CONTEXT_MESSAGES = 4

/** Los últimos mensajes de la sala anteriores a este, del más viejo al más nuevo. */
async function recentContext(message: MessageRow): Promise<ContextMessage[]> {
  const { data, error } = await admin
    .from('messages')
    .select('source_lang, source_text, sender_id, created_at')
    .eq('room_id', message.room_id)
    .lt('created_at', message.created_at)
    .order('created_at', { ascending: false })
    .limit(CONTEXT_MESSAGES)

  if (error || !data) return []

  return data
    .slice()
    .reverse()
    .map((row) => ({
      lang: row.source_lang as Lang,
      text: String(row.source_text).slice(0, 300),
      mine: row.sender_id === message.sender_id,
    }))
}
