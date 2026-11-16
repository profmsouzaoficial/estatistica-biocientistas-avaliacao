#!/usr/bin/env node
/**
 * Ambiente de desenvolvimento: Vite na 3000 + espelho das funções de API na 3101.
 *
 * As funções de `api/*.ts` são compiladas com esbuild e recarregadas a cada
 * mudança — é o mesmo código que roda na Vercel, sem duplicação.
 *
 * Uso:  pnpm dev            (3210 + 3101)
 *       pnpm dev --porta 3215
 */
import { createServer } from 'node:http'
import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createServer as criarVite } from 'vite'

const raiz = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '')
const pastaApi = join(raiz, 'api')
const saidaApi = join(raiz, '.temp-api', 'api.mjs')
const portaApi = 3101

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

const arquivosEnv = [
  join(process.env.HOME ?? '', '.dsh/secrets/avaliacoes.env'),
  join(raiz, '.env.local'),
  join(raiz, '.env'),
]

function carregarEnv(arquivo) {
  if (!existsSync(arquivo)) return 0
  const linhas = readFileSync(arquivo, 'utf8').split(/\r?\n/)
  let aplicadas = 0
  for (const linha of linhas) {
    const limpa = linha.trim()
    if (!limpa || limpa.startsWith('#')) continue
    const igual = limpa.indexOf('=')
    if (igual <= 0) continue
    const chave = limpa.slice(0, igual).trim()
    let valor = limpa.slice(igual + 1).trim()
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1)
    }
    if (valor === '' || process.env[chave] !== undefined) continue
    process.env[chave] = valor
    aplicadas++
  }
  return aplicadas
}

let totalEnv = 0
for (const arquivo of arquivosEnv) {
  try {
    const n = carregarEnv(arquivo)
    if (n > 0) console.log(`  · ${n} variável(is) de ${arquivo.replace(process.env.HOME ?? '', '~')}`)
    totalEnv += n
  } catch (erro) {
    console.warn(`  · não consegui ler ${arquivo}: ${erro.message}`)
  }
}

// O servidor usa SUPABASE_*; o navegador só enxerga VITE_*. Espelha os nomes
// para não pedir a mesma chave duas vezes no arquivo de segredos.
if (!process.env.VITE_SUPABASE_URL && process.env.SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL
}
if (!process.env.VITE_SUPABASE_ANON_KEY && process.env.SUPABASE_ANON_KEY) {
  process.env.VITE_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY
}

const supabaseOk = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY)
if (!supabaseOk) process.env.VITE_MODO_DEMO = '1'

// ---------------------------------------------------------------------------
// Bundle das funções de API
// ---------------------------------------------------------------------------

async function listarRotas(dir) {
  const entradas = await readdir(dir, { withFileTypes: true })
  const rotas = []
  for (const entrada of entradas) {
    const caminho = join(dir, entrada.name)
    if (entrada.isDirectory()) {
      if (entrada.name === '_lib') continue
      rotas.push(...(await listarRotas(caminho)))
    } else if (entrada.name.endsWith('.ts') && !entrada.name.startsWith('_')) {
      const rel = relative(pastaApi, caminho).replace(/\\/g, '/')
      rotas.push({ arquivo: caminho, rota: `/api/${rel.replace(/\.ts$/, '')}` })
    }
  }
  return rotas.sort((a, b) => a.rota.localeCompare(b.rota))
}

let versao = 0
let mapaRotas = new Map()

async function compilarApi() {
  const rotas = await listarRotas(pastaApi)
  const linhas = rotas.map((r, i) => `import r${i} from ${JSON.stringify(r.arquivo)}`)
  linhas.push('export const rotas = new Map([')
  rotas.forEach((r, i) => linhas.push(`  [${JSON.stringify(r.rota)}, r${i}],`))
  linhas.push('])')

  const entrada = join(raiz, '.temp-api', 'entrada.ts')
  await mkdir(dirname(entrada), { recursive: true })
  await writeFile(entrada, `${linhas.join('\n')}\n`)

  await build({
    entryPoints: [entrada],
    outfile: saidaApi,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'inline',
    logLevel: 'silent',
    external: [],
  })

  versao++
  const modulo = await import(`file://${saidaApi}?v=${versao}`)
  mapaRotas = modulo.rotas
  console.log(`  · ${mapaRotas.size} rota(s) de API compilada(s)`)
}

async function versaoDaApi() {
  let soma = 0
  async function percorrer(dir) {
    for (const entrada of await readdir(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name)
      if (entrada.isDirectory()) await percorrer(caminho)
      else if (entrada.name.endsWith('.ts')) {
        const info = await stat(caminho)
        soma += info.mtimeMs + entrada.name.length
      }
    }
  }
  await percorrer(pastaApi)
  return soma
}

let ultimaVersao = await versaoDaApi()

async function garantirApiAtual() {
  const atual = await versaoDaApi()
  if (atual !== ultimaVersao) {
    ultimaVersao = atual
    await compilarApi()
  }
}

// ---------------------------------------------------------------------------
// Servidor da API (espelho do runtime da Vercel)
// ---------------------------------------------------------------------------

await compilarApi()

const servidorApi = createServer(async (req, res) => {
  const inicio = Date.now()
  const url = new URL(req.url ?? '/', 'http://localhost')
  const caminho = url.pathname
  res.on('finish', () => {
    const ms = Date.now() - inicio
    console.log(`  ${req.method} ${caminho} → ${res.statusCode} (${ms} ms)`)
  })

  if (caminho === '/health') {
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ status: 'ok', rotas: [...mapaRotas.keys()] }))
    return
  }

  try {
    await garantirApiAtual()
    const manipulador = mapaRotas.get(caminho.replace(/\/$/, ''))
    if (!manipulador) {
      res.statusCode = 404
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ erro: `Rota ${caminho} não existe.`, codigo: 'ROTA_INEXISTENTE' }))
      return
    }
    await manipulador(req, res)
  } catch (erro) {
    console.error(`  ✗ ${caminho}:`, erro)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ erro: erro?.message ?? 'Erro interno.', codigo: 'ERRO_DEV' }))
    }
  }
})

servidorApi.listen(portaApi, '127.0.0.1', () => {
  console.log(`  API   http://127.0.0.1:${portaApi}`)
})

// ---------------------------------------------------------------------------
// Vite
// ---------------------------------------------------------------------------

const argumentos = process.argv.slice(2)
const portaWeb = Number(
  argumentos.find((a) => a.startsWith('--porta'))?.split('=')[1] ??
    argumentos[argumentos.indexOf('--porta') + 1] ??
    3210,
)

const defineVite = {}
for (const [chave, valor] of Object.entries(process.env)) {
  if (chave.startsWith('VITE_')) defineVite[`import.meta.env.${chave}`] = JSON.stringify(valor)
}

const vite = await criarVite({
  root: raiz,
  define: defineVite,
  server: { port: portaWeb, host: '127.0.0.1', strictPort: true },
})

await vite.listen()
vite.printUrls()

console.log('')
console.log(`  ${supabaseOk ? 'Banco: Supabase configurado' : 'Banco: MODO DEMONSTRAÇÃO (sem Supabase)'}`)
console.log(`  OCR:   ${process.env.VISION_API_KEY ? 'configurado' : 'ausente'}`)
console.log(`  LLM:   ${process.env.LLM_BASE_URL ? process.env.LLM_MODEL ?? 'modelo?' : 'ausente'}`)
console.log(`  SIGA:  ${process.env.SIGA_API_KEY ? 'configurado' : 'ausente'}`)
console.log('')

const encerrar = async () => {
  await vite.close()
  servidorApi.close()
  process.exit(0)
}
process.on('SIGINT', encerrar)
process.on('SIGTERM', encerrar)
