/**
 * base64url → bytes. Lo pide `applicationServerKey` del PushManager.
 *
 * Se tipa sobre `ArrayBuffer` explícito porque `Uint8Array` genérico admite
 * `SharedArrayBuffer`, y la firma de `PushManager.subscribe` no.
 */
export function b64urlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
