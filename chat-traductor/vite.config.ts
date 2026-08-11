import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `VITE_BASE` permite publicar en un subdirectorio (GitHub Pages) sin tocar
// nada más. En la raíz de un dominio se queda en '/'.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
