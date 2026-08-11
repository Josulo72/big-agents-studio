// Web Push sin dependencias: RFC 8291 (cifrado aes128gcm) + RFC 8292 (VAPID).
//
// Se implementa a mano, con WebCrypto, en vez de tirar de una librería: son
// unas cien líneas, todo el material criptográfico existe ya en el runtime, y
// así se puede verificar contra una implementación independiente sin depender
// de que un paquete de npm funcione dentro del Edge Runtime.

export interface PushSubscription {
  endpoint: string
  p256dh: string // clave pública del navegador, base64url, formato P-256 sin comprimir
  auth: string // secreto de autenticación, base64url, 16 bytes
}

export interface VapidDetails {
  /** Clave pública VAPID en base64url (la misma que usa el frontend). */
  publicKey: string
  /** Clave privada VAPID en JWK. */
  privateJwk: JsonWebKey
  /** Contacto del responsable: `mailto:...`. */
  subject: string
}

// --- utilidades ------------------------------------------------------------

export function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function bytesToB64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

const utf8 = (value: string) => new TextEncoder().encode(value)

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

// --- cifrado del contenido (RFC 8291) --------------------------------------

/**
 * Devuelve el cuerpo listo para enviar:
 *   salt(16) | rs(4) | idlen(1) | clave pública efímera(65) | ciphertext
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  subscription: Pick<PushSubscription, 'p256dh' | 'auth'>,
  // Inyectables solo para poder reproducir vectores de prueba.
  fixed?: { salt?: Uint8Array; serverKeys?: CryptoKeyPair },
): Promise<Uint8Array> {
  const uaPublicRaw = b64urlToBytes(subscription.p256dh)
  const authSecret = b64urlToBytes(subscription.auth)

  const uaPublicKey = await crypto.subtle.importKey(
    'raw',
    uaPublicRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )

  const serverKeys =
    fixed?.serverKeys ??
    ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
      'deriveBits',
    ])) as CryptoKeyPair)

  const serverPublicRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey),
  )

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaPublicKey },
      serverKeys.privateKey,
      256,
    ),
  )

  // IKM: mezcla el secreto ECDH con el secreto de autenticación, atando el
  // resultado a las dos claves públicas concretas de este envío.
  const ikm = await hkdf(
    authSecret,
    sharedSecret,
    concat(utf8('WebPush: info\0'), uaPublicRaw, serverPublicRaw),
    32,
  )

  const salt = fixed?.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cekBytes = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  const cek = await crypto.subtle.importKey('raw', cekBytes, 'AES-GCM', false, [
    'encrypt',
  ])

  // 0x02 es el delimitador de relleno del último (y único) registro.
  const record = concat(plaintext, new Uint8Array([2]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, record),
  )

  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)

  return concat(
    salt,
    recordSize,
    new Uint8Array([serverPublicRaw.length]),
    serverPublicRaw,
    ciphertext,
  )
}

// --- cabecera de autorización VAPID (RFC 8292) -----------------------------

export async function vapidAuthorization(
  audience: string,
  vapid: VapidDetails,
  expirySeconds = 12 * 60 * 60,
): Promise<string> {
  const header = { typ: 'JWT', alg: 'ES256' }
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + expirySeconds,
    sub: vapid.subject,
  }

  const signingInput = `${bytesToB64url(utf8(JSON.stringify(header)))}.${bytesToB64url(
    utf8(JSON.stringify(payload)),
  )}`

  const key = await crypto.subtle.importKey(
    'jwk',
    { ...vapid.privateJwk, key_ops: ['sign'], ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  // WebCrypto ya devuelve la firma como r||s crudo, que es lo que pide JWS.
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      utf8(signingInput),
    ),
  )

  return `vapid t=${signingInput}.${bytesToB64url(signature)}, k=${vapid.publicKey}`
}

// --- envío -----------------------------------------------------------------

export interface PushResult {
  endpoint: string
  status: number
  /** true si el endpoint ya no existe y conviene borrar la suscripción. */
  gone: boolean
}

export async function sendPush(
  subscription: PushSubscription,
  payload: unknown,
  vapid: VapidDetails,
  ttlSeconds = 24 * 60 * 60,
): Promise<PushResult> {
  const body = await encryptPayload(utf8(JSON.stringify(payload)), subscription)
  const audience = new URL(subscription.endpoint).origin

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(audience, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSeconds),
      Urgency: 'high',
    },
    body,
  })

  // 404/410 significan que el navegador tiró la suscripción.
  return {
    endpoint: subscription.endpoint,
    status: res.status,
    gone: res.status === 404 || res.status === 410,
  }
}
