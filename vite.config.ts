import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Identidade do build.
 *
 * Sem isso não há como responder "o site publicado é o código que eu acabei de
 * testar?" — pergunta que ficou cara na rodada em que a Vercel recusou o deploy
 * e a produção continuou três commits atrás. O commit entra no HTML como
 * <meta name="app-versao">, então `pnpm versao` compara os dois lados sem
 * precisar de login.
 */
const commit = (() => {
  const daVercel = process.env.VERCEL_GIT_COMMIT_SHA
  if (daVercel) return daVercel.slice(0, 7)
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
})()

const compiladoEm = new Date().toISOString()

// O front é estático; as funções de servidor ficam em /api (Vercel Functions).
// Em desenvolvimento, scripts/dev.mjs sobe as mesmas funções e liga o proxy abaixo.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'versao-no-html',
      transformIndexHtml(html) {
        return html.replace(
          '</head>',
          `  <meta name="app-versao" content="${commit}" />\n    <meta name="app-compilado" content="${compiladoEm}" />\n  </head>`,
        )
      },
    },
  ],
  define: {
    __VERSAO__: JSON.stringify(commit),
    __COMPILADO_EM__: JSON.stringify(compiladoEm),
  },
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
