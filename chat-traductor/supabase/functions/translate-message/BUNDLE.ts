// ---------------------------------------------------------------------------
// VERSIÓN DE UN SOLO FICHERO — generada, no editar a mano.
//
// Es la función `translate-message` completa (index + cors + webpush +
// translate) fusionada en un fichero, para poder pegarla de una vez en el
// editor de Edge Functions del panel de Supabase cuando no se tiene a mano la
// CLI ni un ordenador.
//
// Para regenerarla tras tocar el código:
//   npm run bundle:function
//
// La fuente de verdad son los ficheros sueltos de esta misma carpeta.
// ---------------------------------------------------------------------------

// supabase/functions/translate-message/index.ts
import { createClient } from "jsr:@supabase/supabase-js@2";

// supabase/functions/translate-message/cors.ts
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// supabase/functions/translate-message/webpush.ts
function b64urlToBytes(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - padded.length % 4) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
function bytesToB64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
var utf8 = (value) => new TextEncoder().encode(value);
async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8
  );
  return new Uint8Array(bits);
}
async function encryptPayload(plaintext, subscription, fixed) {
  const uaPublicRaw = b64urlToBytes(subscription.p256dh);
  const authSecret = b64urlToBytes(subscription.auth);
  const uaPublicKey = await crypto.subtle.importKey(
    "raw",
    uaPublicRaw,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );
  const serverKeys = fixed?.serverKeys ?? await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits"
  ]);
  const serverPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey)
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaPublicKey },
      serverKeys.privateKey,
      256
    )
  );
  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    concat(utf8("WebPush: info\0"), uaPublicRaw, serverPublicRaw),
    32
  );
  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cekBytes = await hkdf(salt, ikm, utf8("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, utf8("Content-Encoding: nonce\0"), 12);
  const cek = await crypto.subtle.importKey("raw", cekBytes, "AES-GCM", false, [
    "encrypt"
  ]);
  const record = concat(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, cek, record)
  );
  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, 4096);
  return concat(
    salt,
    recordSize,
    new Uint8Array([serverPublicRaw.length]),
    serverPublicRaw,
    ciphertext
  );
}
async function vapidAuthorization(audience, vapid, expirySeconds = 12 * 60 * 60) {
  const header = { typ: "JWT", alg: "ES256" };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1e3) + expirySeconds,
    sub: vapid.subject
  };
  const signingInput = `${bytesToB64url(utf8(JSON.stringify(header)))}.${bytesToB64url(
    utf8(JSON.stringify(payload))
  )}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    { ...vapid.privateJwk, key_ops: ["sign"], ext: true },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      utf8(signingInput)
    )
  );
  return `vapid t=${signingInput}.${bytesToB64url(signature)}, k=${vapid.publicKey}`;
}
async function sendPush(subscription, payload, vapid, ttlSeconds = 24 * 60 * 60) {
  const body = await encryptPayload(utf8(JSON.stringify(payload)), subscription);
  const audience = new URL(subscription.endpoint).origin;
  const res = await fetch(subscription.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(audience, vapid),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(ttlSeconds),
      Urgency: "high"
    },
    body
  });
  return {
    endpoint: subscription.endpoint,
    status: res.status,
    gone: res.status === 404 || res.status === 410
  };
}

// supabase/functions/translate-message/translate.ts
var DEEPL_API_KEY = Deno.env.get("DEEPL_API_KEY") ?? "";
var GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
var DEEPL_BASE = Deno.env.get("DEEPL_API_URL") ?? (DEEPL_API_KEY.endsWith(":fx") ? "https://api-free.deepl.com" : "https://api.deepl.com");
var GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";
var GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
var LANG_NAME = {
  es: "espa\xF1ol",
  bg: "b\xFAlgaro"
};
function activeProvider() {
  if (DEEPL_API_KEY) return "deepl";
  if (GEMINI_API_KEY) return "gemini";
  return null;
}
async function translate(text, sourceLang, targetLang, context = []) {
  const provider = activeProvider();
  if (!provider) {
    throw new Error("Sin proveedor: falta DEEPL_API_KEY o GEMINI_API_KEY");
  }
  return provider === "deepl" ? await translateWithDeepL(text, sourceLang, targetLang) : await translateWithGemini(text, sourceLang, targetLang, context);
}
async function translateWithDeepL(text, sourceLang, targetLang) {
  const res = await fetch(`${DEEPL_BASE}/v2/translate`, {
    method: "POST",
    headers: {
      Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: [text],
      source_lang: sourceLang.toUpperCase(),
      target_lang: targetLang.toUpperCase(),
      preserve_formatting: true
    })
  });
  if (!res.ok) {
    throw new Error(`DeepL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const payload = await res.json();
  const translated = payload.translations?.[0]?.text;
  if (typeof translated !== "string") {
    throw new Error("DeepL 200: respuesta sin traducci\xF3n");
  }
  return translated;
}
function buildPrompt(text, sourceLang, targetLang, context) {
  const lines = [
    `Traduce del ${LANG_NAME[sourceLang]} al ${LANG_NAME[targetLang]}.`,
    "",
    "Es una conversaci\xF3n privada entre dos personas de confianza.",
    "Reglas:",
    '- Registro informal (tuteo: "t\xFA" en espa\xF1ol, "\u0442\u0438" en b\xFAlgaro). Nunca usted ni \u0412\u0438\u0435.',
    "- Conserva el tono, los emoji, los signos de puntuaci\xF3n y los saltos de l\xEDnea.",
    "- Traduce el sentido, no palabra por palabra. Los modismos van a su equivalente natural.",
    "- Devuelve \xDANICAMENTE la traducci\xF3n. Sin comillas, sin explicaciones, sin alternativas."
  ];
  if (context.length > 0) {
    lines.push(
      "",
      "Contexto de los mensajes anteriores (solo para desambiguar pronombres y",
      "respuestas cortas; NO los traduzcas):"
    );
    for (const previous of context) {
      lines.push(`  ${previous.mine ? "A" : "B"}: ${previous.text}`);
    }
  }
  lines.push("", "Mensaje a traducir:", text);
  return lines.join("\n");
}
async function translateWithGemini(text, sourceLang, targetLang, context) {
  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_API_KEY
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(text, sourceLang, targetLang, context) }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: "text/plain"
      }
    })
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200);
    if (res.status === 404) {
      throw new Error(
        `Gemini 404: el modelo "${GEMINI_MODEL}" no existe para esta clave. Disponibles: ${await listGeminiModels()}. Ajusta el secret GEMINI_MODEL.`
      );
    }
    throw new Error(`Gemini ${res.status}: ${detail}`);
  }
  const payload = await res.json();
  if (payload.promptFeedback?.blockReason) {
    throw new Error(`Gemini bloque\xF3 el mensaje: ${payload.promptFeedback.blockReason}`);
  }
  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
  if (!raw || !raw.trim()) {
    throw new Error("Gemini 200: respuesta vac\xEDa");
  }
  return cleanup(raw);
}
function cleanup(value) {
  let out = value.trim();
  out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "");
  out = out.trim();
  const paired = out.startsWith('"') && out.endsWith('"') || out.startsWith("\xAB") && out.endsWith("\xBB") || out.startsWith("\u201C") && out.endsWith("\u201D");
  if (paired && out.length > 1) out = out.slice(1, -1);
  return out.trim();
}
async function listGeminiModels() {
  try {
    const res = await fetch(`${GEMINI_BASE}/models`, {
      headers: { "x-goog-api-key": GEMINI_API_KEY }
    });
    if (!res.ok) return "(no se pudo consultar la lista)";
    const payload = await res.json();
    return (payload.models ?? []).map((model) => model.name?.replace(/^models\//, "") ?? "").filter((name) => name.includes("flash") || name.includes("pro")).slice(0, 8).join(", ");
  } catch {
    return "(no se pudo consultar la lista)";
  }
}
async function usage() {
  if (activeProvider() !== "deepl") {
    return {
      provider: activeProvider(),
      nota: "El consumo solo se consulta en DeepL. Gemini se mira en Google AI Studio."
    };
  }
  const res = await fetch(`${DEEPL_BASE}/v2/usage`, {
    headers: { Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}` }
  });
  if (!res.ok) return { error: `DeepL ${res.status}` };
  return { provider: "deepl", ...await res.json() };
}

// supabase/functions/translate-message/index.ts
var SUPABASE_URL = Deno.env.get("SUPABASE_URL");
var SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
var admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});
var VAPID = (() => {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateJwk = Deno.env.get("VAPID_PRIVATE_JWK");
  const subject = Deno.env.get("VAPID_SUBJECT");
  if (!publicKey || !privateJwk || !subject) return null;
  try {
    return { publicKey, privateJwk: JSON.parse(privateJwk), subject };
  } catch {
    console.error("VAPID_PRIVATE_JWK no es un JSON v\xE1lido");
    return null;
  }
})();
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "missing_authorization" }, 401);
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData?.user) {
    return json({ error: "invalid_token" }, 401);
  }
  const userId = userData.user.id;
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  if (body.usage === true) {
    return json(await usage());
  }
  const messageId = body.message_id;
  if (!messageId || typeof messageId !== "string") {
    return json({ error: "missing_message_id" }, 400);
  }
  const { data: message, error: msgError } = await admin.from("messages").select(
    "id, room_id, sender_id, source_lang, source_text, translations, status, created_at"
  ).eq("id", messageId).maybeSingle();
  if (msgError) return json({ error: "db_error", detail: msgError.message }, 500);
  if (!message) return json({ error: "not_found" }, 404);
  const { data: membership, error: memberError } = await admin.from("room_members").select("profile_id").eq("room_id", message.room_id).eq("profile_id", userId).maybeSingle();
  if (memberError) {
    return json({ error: "db_error", detail: memberError.message }, 500);
  }
  if (!membership) return json({ error: "forbidden" }, 403);
  const { data: memberRows, error: membersError } = await admin.from("room_members").select("profiles!inner(id, lang, display_name)").eq("room_id", message.room_id);
  if (membersError) {
    return json({ error: "db_error", detail: membersError.message }, 500);
  }
  const members = (memberRows ?? []).map((row) => row.profiles).filter(Boolean);
  const targets = [...new Set(members.map((m) => m.lang))].filter(
    (lang) => lang !== message.source_lang
  );
  const existing = message.translations ?? {};
  const missing = targets.filter(
    (lang) => typeof existing[lang] !== "string" || existing[lang].length === 0
  );
  if (missing.length === 0) {
    if (message.status !== "translated") {
      await admin.from("messages").update({ status: "translated", error_detail: null }).eq("id", message.id);
    }
    return json({ status: "translated", translations: existing });
  }
  if (!message.source_text.trim()) {
    return json({ status: message.status, translations: existing });
  }
  const context = activeProvider() === "gemini" ? await recentContext(message) : [];
  const translations = { ...existing };
  try {
    for (const target of missing) {
      translations[target] = await translate(
        message.source_text,
        message.source_lang,
        target,
        context
      );
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await admin.from("messages").update({
      status: "failed",
      error_detail: detail.slice(0, 500),
      translations
      // se conserva lo que sí se pudo traducir
    }).eq("id", message.id);
    console.error("translate-message failed", message.id, detail);
    await notifyOthers(message, translations, members);
    return json({ status: "failed", translations, error: detail }, 200);
  }
  const { error: updateError } = await admin.from("messages").update({ translations, status: "translated", error_detail: null }).eq("id", message.id);
  if (updateError) {
    return json({ error: "db_error", detail: updateError.message }, 500);
  }
  await notifyOthers(message, translations, members);
  return json({ status: "translated", translations });
});
var NOTIFICATION_MAX_CHARS = 140;
async function notifyOthers(message, translations, members) {
  if (!VAPID) return;
  const recipients = members.filter((member) => member.id !== message.sender_id);
  if (recipients.length === 0) return;
  const senderName = members.find((member) => member.id === message.sender_id)?.display_name ?? "";
  try {
    const { data: subscriptions, error } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth, profile_id").in(
      "profile_id",
      recipients.map((r) => r.id)
    );
    if (error) throw error;
    if (!subscriptions || subscriptions.length === 0) return;
    const byProfile = new Map(recipients.map((r) => [r.id, r]));
    const results = await Promise.allSettled(
      subscriptions.map((row) => {
        const recipient = byProfile.get(row.profile_id);
        const text = translations[recipient.lang] ?? message.source_text;
        const body = text.length > NOTIFICATION_MAX_CHARS ? `${text.slice(0, NOTIFICATION_MAX_CHARS - 1)}\u2026` : text;
        return sendPush(
          row,
          {
            title: senderName,
            body,
            lang: recipient.lang,
            tag: `room:${message.room_id}`,
            url: "/"
          },
          VAPID
        );
      })
    );
    const gone = results.filter(
      (result) => result.status === "fulfilled" && result.value.gone
    ).map((result) => result.value.endpoint);
    if (gone.length > 0) {
      await admin.from("push_subscriptions").delete().in("endpoint", gone);
    }
  } catch (err) {
    console.error("push", err instanceof Error ? err.message : String(err));
  }
}
var CONTEXT_MESSAGES = 4;
async function recentContext(message) {
  const { data, error } = await admin.from("messages").select("source_lang, source_text, sender_id, created_at").eq("room_id", message.room_id).lt("created_at", message.created_at).order("created_at", { ascending: false }).limit(CONTEXT_MESSAGES);
  if (error || !data) return [];
  return data.slice().reverse().map((row) => ({
    lang: row.source_lang,
    text: String(row.source_text).slice(0, 300),
    mine: row.sender_id === message.sender_id
  }));
}
