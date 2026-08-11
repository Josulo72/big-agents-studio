/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: 'var(--night-0)',
        me: 'var(--me-1)',
        you: 'var(--you-1)',
        'lang-es': 'var(--lang-es)',
        'lang-bg': 'var(--lang-bg)',
        text: 'var(--text)',
        muted: 'var(--muted)',
      },
      fontFamily: {
        display: ['Unbounded', 'system-ui', 'sans-serif'],
        body: ['"Golos Text"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        bubble: '22px',
        control: '9999px',
      },
      transitionDuration: {
        120: '120ms',
        180: '180ms',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out both',
      },
    },
  },
  plugins: [],
}
