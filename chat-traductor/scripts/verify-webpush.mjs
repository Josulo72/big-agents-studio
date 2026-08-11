// Verifica el módulo webpush.ts contra `http_ece` (implementación independiente
// del RFC 8188/8291) y comprueba la firma VAPID con WebCrypto.
import { webcrypto } from 'node:crypto'
import ece from 'http_ece'
import { createRequire } from 'node:module'

// Node 22 ya expone globalThis.crypto como WebCrypto

const require = createRequire(import.meta.url)
const { generateKeyPairSync, createECDH } = require('node:crypto')

// El módulo es TypeScript; se carga la versión transpilada por esbuild.
const { pathToFileURL } = await import('node:url')
const { resolve } = await import('node:path')
const { encryptPayload, vapidAuthorization, b64urlToBytes, bytesToB64url } =
  await import(pathToFileURL(resolve(process.argv[2])).href)

const b64u = (b) => Buffer.from(b).toString('base64url')

// --- 1. Simula un navegador: genera su par de claves y su secreto auth ------
const ua = createECDH('prime256v1')
ua.generateKeys()
const uaPublic = ua.getPublicKey() // 65 bytes, sin comprimir
const uaPrivate = ua.getPrivateKey()
const authSecret = webcrypto.getRandomValues(new Uint8Array(16))

const subscription = {
  p256dh: b64u(uaPublic),
  auth: b64u(authSecret),
}

const mensaje = {
  title: 'Ива',
  body: 'Добро утро. Кафето е готово.',
  url: '/',
}
const plaintext = new TextEncoder().encode(JSON.stringify(mensaje))

// --- 2. Cifra con NUESTRA implementación -----------------------------------
const body = await encryptPayload(plaintext, subscription)

// --- 3. Descifra con http_ece (independiente) ------------------------------
const descifrado = ece.decrypt(Buffer.from(body), {
  version: 'aes128gcm',
  privateKey: ua, // objeto ECDH del "navegador"
  authSecret: Buffer.from(authSecret),
})

const recuperado = descifrado.toString('utf8')
const esperado = JSON.stringify(mensaje)

console.log('descifrado por http_ece :', recuperado)
if (recuperado !== esperado) {
  console.error('✗ El texto descifrado NO coincide')
  process.exit(1)
}
console.log('✓ RFC 8291: http_ece descifra correctamente lo que ciframos')

// --- 4. Estructura del cuerpo ----------------------------------------------
const salt = body.slice(0, 16)
const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)
const idlen = body[20]
console.log(`✓ cabecera: salt=${salt.length}B rs=${rs} idlen=${idlen}`)
if (idlen !== 65 || rs !== 4096 || salt.length !== 16) {
  console.error('✗ Cabecera aes128gcm mal formada')
  process.exit(1)
}

// --- 5. Firma VAPID --------------------------------------------------------
const kp = await webcrypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
)
const pubRaw = new Uint8Array(await webcrypto.subtle.exportKey('raw', kp.publicKey))
const privJwk = await webcrypto.subtle.exportKey('jwk', kp.privateKey)

const header = await vapidAuthorization('https://fcm.googleapis.com', {
  publicKey: bytesToB64url(pubRaw),
  privateJwk: { kty: privJwk.kty, crv: privJwk.crv, x: privJwk.x, y: privJwk.y, d: privJwk.d },
  subject: 'mailto:jrollon@gmail.com',
})

const m = header.match(/^vapid t=([^,]+), k=(.+)$/)
if (!m) {
  console.error('✗ Cabecera Authorization mal formada:', header)
  process.exit(1)
}
const [, jwt, k] = m
const [h, p, s] = jwt.split('.')

const ok = await webcrypto.subtle.verify(
  { name: 'ECDSA', hash: 'SHA-256' },
  kp.publicKey,
  b64urlToBytes(s),
  new TextEncoder().encode(`${h}.${p}`),
)
if (!ok) {
  console.error('✗ La firma VAPID no verifica')
  process.exit(1)
}

const payload = JSON.parse(Buffer.from(p, 'base64url').toString())
console.log('✓ RFC 8292: firma ES256 verificada, aud =', payload.aud, '| sub =', payload.sub)
if (k !== bytesToB64url(pubRaw)) {
  console.error('✗ k= no coincide con la clave pública')
  process.exit(1)
}
console.log('✓ k= coincide con la clave pública VAPID')
console.log('\nTodo correcto.')
