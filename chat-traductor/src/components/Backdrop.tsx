/**
 * Fondo inmersivo: azul noche con violeta y magenta, unos resplandores
 * desenfocados y un polvo de estrellas muy tenue.
 *
 * Va detrás de todo y no captura toques. La legibilidad la garantiza el velo
 * oscuro de la última capa: por debajo puede haber lo que sea, encima el texto
 * siempre cae sobre algo suficientemente oscuro.
 */

const ESTRELLAS =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320">
      ${[
        [23, 41, 1, 0.5],
        [71, 12, 0.8, 0.35],
        [140, 63, 1.2, 0.55],
        [199, 27, 0.7, 0.3],
        [255, 88, 1, 0.45],
        [297, 39, 0.8, 0.35],
        [16, 122, 1.1, 0.5],
        [88, 154, 0.7, 0.28],
        [131, 199, 1, 0.42],
        [186, 141, 0.9, 0.36],
        [243, 176, 1.2, 0.5],
        [304, 133, 0.7, 0.3],
        [44, 231, 1, 0.44],
        [96, 271, 0.8, 0.32],
        [162, 246, 1.1, 0.48],
        [214, 299, 0.7, 0.26],
        [268, 253, 1, 0.4],
        [309, 292, 0.9, 0.34],
      ]
        .map(
          ([x, y, r, o]) =>
            `<circle cx="${x}" cy="${y}" r="${r}" fill="white" opacity="${o}"/>`,
        )
        .join('')}
    </svg>`,
  )

export function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
      {/* Base: de azul noche arriba a casi negro abajo. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(175deg, #1b2470 0%, #151a52 30%, #101336 58%, #0a0a20 82%, #070714 100%)',
        }}
      />

      {/* Resplandores desenfocados. Se mueven muy despacio, casi imperceptible. */}
      <div
        className="absolute -left-24 -top-24 h-[52vh] w-[52vh] rounded-full blur-[90px]"
        style={{
          background: 'radial-gradient(circle, rgba(190,40,120,0.55), transparent 70%)',
          animation: 'drift 22s ease-in-out infinite alternate',
        }}
      />
      <div
        className="absolute -right-28 top-[22vh] h-[46vh] w-[46vh] rounded-full blur-[100px]"
        style={{
          background: 'radial-gradient(circle, rgba(108,52,196,0.55), transparent 70%)',
          animation: 'drift 28s ease-in-out infinite alternate-reverse',
        }}
      />
      <div
        className="absolute -bottom-24 left-[10vw] h-[44vh] w-[60vh] rounded-full blur-[110px]"
        style={{
          background: 'radial-gradient(circle, rgba(30,96,224,0.45), transparent 70%)',
          animation: 'drift 34s ease-in-out infinite alternate',
        }}
      />

      {/* Silueta muy tenue: una línea de horizonte insinuada, nada figurativo. */}
      <div
        className="absolute inset-x-0 bottom-0 h-[38vh]"
        style={{
          background:
            'radial-gradient(130% 90% at 50% 100%, rgba(255,59,141,0.22), transparent 62%)',
        }}
      />

      {/* Polvo de estrellas. */}
      <div
        className="absolute inset-0 opacity-70"
        style={{ backgroundImage: `url("${ESTRELLAS}")`, backgroundRepeat: 'repeat' }}
      />

      {/* Velo: lo que garantiza el contraste del texto pase lo que pase detrás. */}
      <div className="absolute inset-0 bg-[#05060f]/25" />
    </div>
  )
}
