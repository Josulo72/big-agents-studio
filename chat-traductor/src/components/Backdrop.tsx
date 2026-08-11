/**
 * Fondo inmersivo: atardecer nocturno. Azul profundo arriba, violeta en medio
 * y magenta encendido en el horizonte, con estrellas y una silueta de ciudad
 * apenas insinuada.
 *
 * Va detrás de todo y no captura toques. Las burbujas son opacas, así que el
 * fondo puede tener color de verdad sin comprometer la lectura; lo único que
 * se protege es el texto suelto (separadores, estados), con un velo suave.
 */

function estrellas(): string {
  const puntos: [number, number, number, number][] = [
    [23, 41, 1, 0.7], [71, 12, 0.8, 0.5], [140, 63, 1.3, 0.8], [199, 27, 0.7, 0.45],
    [255, 88, 1, 0.65], [297, 39, 0.9, 0.5], [16, 122, 1.2, 0.7], [88, 154, 0.7, 0.4],
    [131, 199, 1, 0.6], [186, 141, 0.9, 0.5], [243, 176, 1.3, 0.75], [304, 133, 0.7, 0.4],
    [44, 231, 1, 0.6], [96, 271, 0.8, 0.45], [162, 246, 1.1, 0.65], [214, 299, 0.8, 0.4],
    [268, 253, 1, 0.55], [309, 292, 0.9, 0.5], [55, 88, 0.7, 0.4], [178, 18, 0.9, 0.55],
    [232, 118, 0.8, 0.45], [120, 108, 0.7, 0.4], [280, 205, 1, 0.6], [37, 178, 0.8, 0.45],
  ]
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">${puntos
        .map(
          ([x, y, r, o]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${o}"/>`,
        )
        .join('')}</svg>`,
    )
  )
}

/** Skyline muy tenue: solo insinúa un horizonte, no dibuja una ciudad. */
const SKYLINE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="930" height="220" preserveAspectRatio="none">
      <path fill="#05030f" d="M0 220 V150 h48 v-34 h30 v34 h26 v-58 h34 v58 h40 v-26 h52 v26 h30 v-72 h28 v72 h44 v-40 h38 v40 h50 v-52 h32 v52 h36 v-30 h46 v30 h40 v-64 h30 v64 h42 v-36 h50 v36 h38 v-48 h34 v48 h44 v-28 h60 v28 h58 v70 z"/>
    </svg>`,
  )

export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      {/* Cielo: de azul noche cerrado arriba a magenta encendido abajo. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, #070A2E 0%, #131a5c 22%, #2b1d6e 44%, #5b1f6f 64%, #93265f 80%, #b83355 90%, #4a1338 97%, #14061c 100%)',
        }}
      />

      {/* Estrellas: solo arriba, se apagan al acercarse al horizonte. */}
      <div
        className="absolute inset-x-0 top-0 h-[62%]"
        style={{
          backgroundImage: `url("${estrellas()}")`,
          backgroundRepeat: 'repeat',
          maskImage: 'linear-gradient(180deg, #000 0%, #000 55%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(180deg, #000 0%, #000 55%, transparent 100%)',
        }}
      />

      {/* Resplandores. Se mueven muy despacio, casi imperceptible. */}
      <div
        className="absolute -left-32 top-[8vh] h-[46vh] w-[46vh] rounded-full blur-[100px]"
        style={{
          background: 'radial-gradient(circle, rgba(120,60,220,0.55), transparent 70%)',
          animation: 'drift 26s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute -right-28 top-[30vh] h-[42vh] w-[42vh] rounded-full blur-[110px]"
        style={{
          background: 'radial-gradient(circle, rgba(232,60,140,0.5), transparent 70%)',
          animation: 'drift 32s ease-in-out infinite alternate-reverse',
        }}
      />

      {/* El sol ya puesto: el foco cálido justo bajo el horizonte. */}
      <div
        className="absolute inset-x-0 bottom-[16%] h-[30vh]"
        style={{
          background:
            'radial-gradient(60% 100% at 50% 100%, rgba(255,120,90,0.55), rgba(255,60,140,0.28) 45%, transparent 72%)',
        }}
      />

      {/* Silueta del horizonte. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[22vh] opacity-80"
        style={{
          backgroundImage: `url("${SKYLINE}")`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'bottom',
        }}
      />

      {/* Reflejo en el agua bajo la silueta. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[12vh]"
        style={{
          background:
            'linear-gradient(180deg, rgba(255,90,150,0.16), rgba(10,4,20,0.9) 70%)',
        }}
      />

      {/* Velo suave: mantiene legible el texto que no va dentro de burbuja. */}
      <div className="absolute inset-0 bg-[#06021a]/35" />
    </div>
  )
}
