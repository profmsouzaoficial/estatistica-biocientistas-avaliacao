#!/usr/bin/env node
/**
 * Testa a publicação das variáveis na Vercel contra um servidor falso.
 *
 *   pnpm test:configuracao:vercel
 *
 * O `pnpm configurar:ia` mexe em produção: grava segredos e publica na Vercel.
 * Um erro ali (método errado, campo faltando, variável sem `target`) só apareceria
 * na hora de ligar a IA de verdade — com a chave em mãos e pressa.
 *
 * Aqui um servidor local imita a API da Vercel: o script aponta para ele com
 * VERCEL_API_BASE e a gente confere exatamente o que ele enviaria.
 */
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const raiz = join(import.meta.dirname, '..')
const verificacoes = []
const conferir = (nome, ok, detalhe = '') => {
  verificacoes.push(ok)
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
}

// ---- servidor falso da Vercel ----------------------------------------------
const pedidos = []
let falharPost = false

const servidor = createServer((req, res) => {
  let corpo = ''
  req.on('data', (d) => (corpo += d))
  req.on('end', () => {
    const url = new URL(req.url, 'http://x')
    const json = corpo ? JSON.parse(corpo) : null
    pedidos.push({ metodo: req.method, caminho: url.pathname + url.search, corpo: json })

    const responder = (status, dados) => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(dados))
    }

    if (req.method === 'GET' && url.pathname === '/v9/projects/estatistica-biocientistas-avaliacao') {
      return responder(200, { id: 'prj_teste' })
    }
    if (req.method === 'GET' && url.pathname === '/v10/projects/prj_teste/env') {
      // LLM_MODEL já existe: precisa virar PATCH, não POST duplicado
      return responder(200, { envs: [{ id: 'env_existente', key: 'LLM_MODEL', target: ['production'] }] })
    }
    if (req.method === 'POST' && url.pathname === '/v10/projects/prj_teste/env') {
      if (falharPost) return responder(500, { error: { message: 'falha simulada' } })
      return responder(200, { created: { id: 'env_novo' } })
    }
    if (req.method === 'PATCH' && url.pathname.startsWith('/v10/projects/prj_teste/env/')) {
      return responder(200, { updated: true })
    }
    return responder(404, { error: { message: `sem rota para ${req.method} ${url.pathname}` } })
  })
})

await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
const porta = servidor.address().port

function rodar(extra = []) {
  const arquivo = join(mkdtempSync(join(tmpdir(), 'cfgvercel-')), 'segredos.env')
  return new Promise((ok) => {
    const p = spawn(
      'node',
      [
        join(raiz, 'scripts/configurar-ia.mjs'),
        '--arquivo', arquivo,
        '--base', 'https://llm.exemplo/v1',
        '--modelo', 'Qwen2.5-7B-Instruct',
        '--chave', 'sk-chave-de-teste',
        '--visao-modelo', 'Qwen2.5-VL-7B-Instruct',
        '--sem-deploy',
        '--sem-testes',
        ...extra,
      ],
      {
        cwd: raiz,
        env: { ...process.env, VERCEL_API_BASE: `http://127.0.0.1:${porta}`, VERCEL_TOKEN: 'token-de-teste' },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let saida = ''
    p.stdout.on('data', (d) => (saida += d))
    p.stderr.on('data', (d) => (saida += d))
    p.on('exit', (c) => ok({ codigo: c, saida, arquivo }))
  })
}

console.log('\n  Configurar a IA · publicação na Vercel (servidor falso)\n')

const primeira = await rodar()
conferir('o script termina sem erro', primeira.codigo === 0, `exit ${primeira.codigo}`)

const cria = pedidos.filter((p) => p.metodo === 'POST')
const atualiza = pedidos.filter((p) => p.metodo === 'PATCH')
conferir('consulta o projeto pelo nome', pedidos.some((p) => p.caminho === '/v9/projects/estatistica-biocientistas-avaliacao'))
conferir('lê as variáveis existentes', pedidos.some((p) => p.metodo === 'GET' && p.caminho.includes('/env')))
conferir('atualiza LLM_MODEL em vez de duplicar', atualiza.length === 1 && atualiza[0].caminho.endsWith('/env/env_existente'))
conferir('cria as demais variáveis', cria.length === 8, `${cria.length} POST`)
conferir(
  'todas com target production e tipo encrypted',
  cria.every((p) => p.corpo.type === 'encrypted' && JSON.stringify(p.corpo.target) === '["production"]'),
)
conferir('envia o valor junto da chave', cria.every((p) => typeof p.corpo.key === 'string' && typeof p.corpo.value === 'string'))
const chavesCriadas = cria.map((p) => p.corpo.key).sort()
conferir(
  'as chaves são as esperadas',
  JSON.stringify(chavesCriadas) === JSON.stringify(['LLM_API_KEY', 'LLM_BASE_URL', 'LLM_TIMEOUT_MS', 'VISION_API_KEY', 'VISION_BASE_URL', 'VISION_MODEL', 'VISION_PROVIDER', 'LLM_MAX_TOKENS'].sort()),
  chavesCriadas.join(', '),
)
const mapa = readFileSync(primeira.arquivo, 'utf8')
conferir('a chave ficou no arquivo local', mapa.includes('LLM_API_KEY=sk-chave-de-teste'))
conferir('a saída lista o que foi publicado', /criada na Vercel|criad/.test(primeira.saida) || primeira.saida.includes('Vercel'))

// ---- falha da Vercel: tem de parar e dizer o porquê ------------------------
pedidos.length = 0
falharPost = true
const comFalha = await rodar()
conferir('falha da Vercel interrompe o script', comFalha.codigo === 1, `exit ${comFalha.codigo}`)
conferir('a mensagem diz qual variável falhou', /Vercel recusou criar/.test(comFalha.saida), comFalha.saida.trim().split('\n').pop())
falharPost = false

servidor.close()

const falhas = verificacoes.filter((v) => !v).length
console.log('')
if (falhas) {
  console.log(`\x1b[31m${falhas} de ${verificacoes.length} verificações falharam.\x1b[0m\n`)
  process.exit(1)
}
console.log(`\x1b[32m${verificacoes.length} verificações da publicação passaram.\x1b[0m\n`)
