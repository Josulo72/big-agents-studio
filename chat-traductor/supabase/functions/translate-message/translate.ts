// Proveedores de traducción.
//
// Hay dos, y se elige solo según qué clave esté configurada:
//
//   DEEPL_API_KEY   → DeepL. Mejor calidad bruta en búlgaro. Pide tarjeta para
//                     verificar identidad al registrarse (no cobra en el plan
//                     Free).
//   GEMINI_API_KEY  → Gemini. Clave gratuita desde Google AI Studio, SIN
//                     tarjeta. Además arregla dos de las limitaciones
//                     conocidas del proyecto: se le puede fijar el registro
//                     informal y se le pueden pasar los mensajes anteriores
//                     como contexto.
//
// Si están las dos, manda DeepL. Cambiar de proveedor no toca ni el esquema ni
// el frontend: solo se pone o se quita un secret.

export type Lang = 'es' | 'bg'
export type Provider = 'deepl' | 'gemini'

const DEEPL_API_KEY = Deno.env.get('DEEPL_API_KEY') ?? ''
const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? ''

// Las claves Free de DeepL terminan en `:fx` y usan otro host.
const DEEPL_BASE =
  Deno.env.get('DEEPL_API_URL') ??
  (DEEPL_API_KEY.endsWith(':fx')
    ? 'https://api-free.deepl.com'
    : 'https://api.deepl.com')

// Los nombres de modelo de Gemini cambian con el tiempo. Se deja configurable,
// y si el que hay no existe, `translate` devuelve en el error la lista real de
// modelos disponibles para esa clave, en vez de un 404 mudo.
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

const LANG_NAME: Record<Lang, string> = {
  es: 'español',
  bg: 'búlgaro',
}

export function activeProvider(): Provider | null {
  if (DEEPL_API_KEY) return 'deepl'
  if (GEMINI_API_KEY) return 'gemini'
  return null
}

/** Un mensaje anterior, para dar contexto conversacional a Gemini. */
export interface ContextMessage {
  lang: Lang
  text: string
  mine: boolean
}

export async function translate(
  text: string,
  sourceLang: Lang,
  targetLang: Lang,
  context: ContextMessage[] = [],
): Promise<string> {
  const provider = activeProvider()
  if (!provider) {
    throw new Error('Sin proveedor: falta DEEPL_API_KEY o GEMINI_API_KEY')
  }
  return provider === 'deepl'
    ? await translateWithDeepL(text, sourceLang, targetLang)
    : await translateWithGemini(text, sourceLang, targetLang, context)
}

// --- DeepL -----------------------------------------------------------------

async function translateWithDeepL(
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
    throw new Error(`DeepL ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const payload = (await res.json()) as { translations?: { text: string }[] }
  const translated = payload.translations?.[0]?.text
  if (typeof translated !== 'string') {
    throw new Error('DeepL 200: respuesta sin traducción')
  }
  return translated
}

// --- Gemini ----------------------------------------------------------------

function buildPrompt(
  text: string,
  sourceLang: Lang,
  targetLang: Lang,
  context: ContextMessage[],
): string {
  const lines = [
    `Traduce del ${LANG_NAME[sourceLang]} al ${LANG_NAME[targetLang]}.`,
    '',
    'Es una conversación privada entre dos personas de confianza.',
    'Reglas:',
    '- Registro informal (tuteo: "tú" en español, "ти" en búlgaro). Nunca usted ni Вие.',
    '- Conserva el tono, los emoji, los signos de puntuación y los saltos de línea.',
    '- Traduce el sentido, no palabra por palabra. Los modismos van a su equivalente natural.',
    '- Devuelve ÚNICAMENTE la traducción. Sin comillas, sin explicaciones, sin alternativas.',
  ]

  if (context.length > 0) {
    lines.push(
      '',
      'Contexto de los mensajes anteriores (solo para desambiguar pronombres y',
      'respuestas cortas; NO los traduzcas):',
    )
    for (const previous of context) {
      lines.push(`  ${previous.mine ? 'A' : 'B'}: ${previous.text}`)
    }
  }

  lines.push('', 'Mensaje a traducir:', text)
  return lines.join('\n')
}

async function translateWithGemini(
  text: string,
  sourceLang: Lang,
  targetLang: Lang,
  context: ContextMessage[],
): Promise<string> {
  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(text, sourceLang, targetLang, context) }],
        },
      ],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'text/plain',
      },
    }),
  })

  if (!res.ok) {
    const detail = (await res.text()).slice(0, 200)
    // Un nombre de modelo caducado es el fallo más probable, y da un 404 poco
    // informativo. Se añade la lista real para que arreglarlo sea inmediato.
    if (res.status === 404) {
      throw new Error(
        `Gemini 404: el modelo "${GEMINI_MODEL}" no existe para esta clave. ` +
          `Disponibles: ${await listGeminiModels()}. ` +
          `Ajusta el secret GEMINI_MODEL.`,
      )
    }
    throw new Error(`Gemini ${res.status}: ${detail}`)
  }

  const payload = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    promptFeedback?: { blockReason?: string }
  }

  if (payload.promptFeedback?.blockReason) {
    throw new Error(`Gemini bloqueó el mensaje: ${payload.promptFeedback.blockReason}`)
  }

  const raw = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')

  if (!raw || !raw.trim()) {
    throw new Error('Gemini 200: respuesta vacía')
  }

  return cleanup(raw)
}

/** Quita el envoltorio que a veces añade un LLM pese a pedirle que no. */
function cleanup(value: string): string {
  let out = value.trim()
  out = out.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '')
  out = out.trim()
  const paired =
    (out.startsWith('"') && out.endsWith('"')) ||
    (out.startsWith('«') && out.endsWith('»')) ||
    (out.startsWith('“') && out.endsWith('”'))
  if (paired && out.length > 1) out = out.slice(1, -1)
  return out.trim()
}

async function listGeminiModels(): Promise<string> {
  try {
    const res = await fetch(`${GEMINI_BASE}/models`, {
      headers: { 'x-goog-api-key': GEMINI_API_KEY },
    })
    if (!res.ok) return '(no se pudo consultar la lista)'
    const payload = (await res.json()) as { models?: { name?: string }[] }
    return (payload.models ?? [])
      .map((model) => model.name?.replace(/^models\//, '') ?? '')
      .filter((name) => name.includes('flash') || name.includes('pro'))
      .slice(0, 8)
      .join(', ')
  } catch {
    return '(no se pudo consultar la lista)'
  }
}

// --- Consumo ---------------------------------------------------------------

export async function usage(): Promise<Record<string, unknown>> {
  if (activeProvider() !== 'deepl') {
    return {
      provider: activeProvider(),
      nota: 'El consumo solo se consulta en DeepL. Gemini se mira en Google AI Studio.',
    }
  }
  const res = await fetch(`${DEEPL_BASE}/v2/usage`, {
    headers: { Authorization: `DeepL-Auth-Key ${DEEPL_API_KEY}` },
  })
  if (!res.ok) return { error: `DeepL ${res.status}` }
  return { provider: 'deepl', ...(await res.json()) }
}
