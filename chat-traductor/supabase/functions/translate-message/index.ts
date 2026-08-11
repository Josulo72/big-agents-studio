// Edge Function `translate-message`
//
// Entrada:  { "message_id": "uuid" }   con el JWT del usuario en Authorization
//           { "usage": true }          devuelve el consumo del plan de DeepL
// Salida:   { "status": "translated" | "failed", "translations": {...} }
//
// Secrets necesarios (nunca en el frontend):
//   DEEPL_API_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { corsHeaders, json } from '../_shared/cors.ts'

type Lang = 'es' | 'bg'

interface MessageRow {
  id: string
  room_id: string
  sender_id: string
  source_lang: Lang
  source_text: string
  translations: Record<string, string>
  status: 'pending' | 'translated' | 'failed'
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const DEEPL_API_KEY = Deno.env.get('DEEPL_API_KEY')!

// Las claves del plan Free terminan en `:fx` y usan un host distinto.
const DEEPL_BASE =
  Deno.env.get('DEEPL_API_URL') ??
  (DEEPL_API_KEY?.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com')

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

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
    return await deeplUsage()
  }

  const messageId = body.message_id
  if (!messageId || typeof messageId !== 'string') {
    return json({ error: 'missing_message_id' }, 400)
  }

  // 2. Cargar el mensaje y comprobar pertenencia a la sala -----------------
  const { data: message, error: msgError } = await admin
    .from('messages')
    .select('id, room_id, sender_id, source_lang, source_text, translations, status')
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
  const { data: members, error: membersError } = await admin
    .from('room_members')
    .select('profiles!inner(lang)')
    .eq('room_id', message.room_id)

  if (membersError) {
    return json({ error: 'db_error', detail: membersError.message }, 500)
  }

  const memberLangs = (members ?? [])
    .map((row) => (row as unknown as { profiles: { lang: Lang } }).profiles?.lang)
    .filter(Boolean)

  const targets = [...new Set(memberLangs)].filter(
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
  const translations: Record<string, string> = { ...existing }
  try {
    for (const target of missing) {
      translations[target] = await deeplTranslate(
        message.source_text,
        message.source_lang,
        target,
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

  return json({ status: 'translated', translations })
})

// ---------------------------------------------------------------------------

async function deeplTranslate(
  text: string,
  sourceLang: Lang,
  targetLang: Lang,
): Promise<string> {
  const res = await fetch(`${DEEPL_BASE}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      source_lang: sourceLang.toUpperCase(),
      target_lang: targetLang.toUpperCase(),
      preserve_formatting: true,
    }),
  })

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300)
    throw new Error(`DeepL ${res.status}: ${detail}`)
  }

  const payload = (await res.json()) as {
    translations?: { text: string }[]
  }
  const translated = payload.translations?.[0]?.text
  if (typeof translated !== 'string') {
    throw new Error('DeepL 200: respuesta sin traducción')
  }
  return translated
}

async function deeplUsage(): Promise<Response> {
  const res = await fetch(`${DEEPL_BASE}/v2/usage`, {
    headers: { Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}` },
  })
  if (!res.ok) {
    return json({ error: `DeepL ${res.status}` }, 502)
  }
  const usage = (await res.json()) as {
    character_count: number
    character_limit: number
  }
  return json(usage)
}
