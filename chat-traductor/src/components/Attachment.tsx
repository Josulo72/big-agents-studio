import { useEffect, useState } from 'react'
import { esImagen, signedUrl, tamanoLegible } from '../lib/media'
import type { ChatMessage } from '../lib/types'

/**
 * El adjunto dentro de la burbuja.
 *
 * El almacén es privado, así que la dirección se firma al mostrarlo. Mientras
 * el fichero sube se enseña la vista previa local, para que la foto aparezca
 * en el acto igual que aparece el texto.
 */
export function Attachment({ message }: { message: ChatMessage }) {
  const [url, setUrl] = useState<string | null>(message.localPreview ?? null)
  const [falloAlCargar, setFalloAlCargar] = useState(false)

  useEffect(() => {
    if (message.localPreview || !message.media_url) return
    let vivo = true
    void signedUrl(message.media_url).then((firmada) => {
      if (vivo) setUrl(firmada)
    })
    return () => {
      vivo = false
    }
  }, [message.media_url, message.localPreview])

  const subiendo = typeof message.uploading === 'number' && message.uploading < 1

  if (esImagen(message.media_mime) && !falloAlCargar) {
    // Se reserva la proporción real antes de que cargue, para que la
    // conversación no dé un salto cuando aparece la imagen.
    const ratio =
      message.media_width && message.media_height
        ? `${message.media_width} / ${message.media_height}`
        : '4 / 3'

    return (
      <div className="relative -mx-1 mb-1 overflow-hidden rounded-2xl bg-black/25">
        {url ? (
          <img
            src={url}
            alt={message.media_name ?? 'Imagen'}
            loading="lazy"
            onError={() => setFalloAlCargar(true)}
            className="block max-h-[62vh] w-full object-cover"
            style={{ aspectRatio: ratio }}
          />
        ) : (
          <div
            className="w-full animate-pulse bg-white/10"
            style={{ aspectRatio: ratio }}
          />
        )}

        {subiendo && (
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </div>
    )
  }

  // Cualquier otra cosa: tarjeta con nombre, tamaño y descarga.
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      download={message.media_name ?? undefined}
      onClick={(event) => {
        if (!url) event.preventDefault()
      }}
      className="mb-1 flex items-center gap-3 rounded-2xl bg-black/25 px-3 py-2.5 transition-colors duration-150 hover:bg-black/35"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15">
        {subiendo ? (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 3v5h5" />
            <path d="M15 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          </svg>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium text-white">
          {message.media_name ?? 'Archivo'}
        </span>
        <span className="block font-mono text-[11px] text-white/60">
          {tamanoLegible(message.media_size)}
        </span>
      </span>
    </a>
  )
}
