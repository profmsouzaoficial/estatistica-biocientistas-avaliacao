import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// O front é estático; as funções de servidor ficam em /api (Vercel Functions).
// Em desenvolvimento, scripts/dev.mjs sobe as mesmas funções e liga o proxy abaixo.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3210,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3101',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
