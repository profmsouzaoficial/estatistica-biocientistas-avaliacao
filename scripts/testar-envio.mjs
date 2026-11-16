#!/usr/bin/env node
/**
 * O que o aluno vê quando a foto não sobe.
 *
 *   pnpm test:envio
 *
 * O upload vai do navegador direto para o Storage do Supabase, e o SDK não
 * aceita `AbortSignal`. Sem prazo, a tela fica em “Enviando a foto…” até o
 * navegador desistir sozinho; e o erro que chega é de infraestrutura
 * (“Failed to fetch”), não uma instrução.
 *
 * Aqui se verifica as duas coisas: que a espera tem teto e que a mensagem diz o
 * que fazer — inclusive na chamada `/api/*`, que também não tinha prazo.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const pasta = join(raiz, '.temp-testes')
await mkdir(pasta, { recursive: true })

const { build } = await import('esbuild')
async function carregar(entrada, nome) {
  const arquivo = join(pasta, `${nome}.mjs`)
  const saida = await build({
    entryPoints: [join(raiz, 'src', 'lib', entrada)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'error',
  })
  await writeFile(arquivo, saida.outputFiles[0].text)
  return import(pathToFileURL(arquivo).href)
}

const envio = await carregar('envio.ts', 'envio')
const servidor = await carregar('servidor.ts', 'servidor')

let falhas = 0
let total = 0
function conferir(nome, condicao, detalhe = '') {
  total++
  const marca = condicao ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${marca} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  if (!condicao) falhas++
}

async function capturar(fn) {
  const inicio = Date.now()
  try {
    return { valor: await fn(), erro: null, ms: Date.now() - inicio }
  } catch (erro) {
    return { valor: null, erro, ms: Date.now() - inicio }
  }
}

console.log('\n  Envio da foto · prazo, mensagem e chamada ao servidor\n')

// ---- comPrazo ---------------------------------------------------------------
let r = await capturar(() => envio.comPrazo(Promise.resolve('ok'), 500))
conferir('promessa rápida passa direto', r.valor === 'ok', String(r.valor))

r = await capturar(() => envio.comPrazo(new Promise(() => {}), 120))
conferir('promessa que nunca resolve vira ErroDeEnvio', r.erro?.codigo === 'tempo', r.erro?.codigo ?? 'sem erro')
conferir('desiste perto do prazo', r.ms >= 100 && r.ms < 1500, `${r.ms} ms`)
conferir('a mensagem conta os segundos', /1 s/.test(r.erro?.message ?? ''), r.erro?.message ?? '')
conferir('a mensagem manda tentar de novo', /Enviar.*de novo|de novo/.test(r.erro?.message ?? ''))

r = await capturar(() => envio.comPrazo(Promise.reject(new Error('Falha de rede')), 500))
conferir('erro original não é mascarado', r.erro?.message === 'Falha de rede', r.erro?.message ?? '')
conferir('e não vira erro de tempo', r.erro?.codigo === undefined, String(r.erro?.codigo))

// ---- mensagens --------------------------------------------------------------
const casos = [
  ['Failed to fetch', 'rede', /conexão/i],
  ['Load failed', 'rede', /conexão/i],
  ['new row violates row-level security policy', 'sessao', /Entre de novo/i],
  ['JWT expired', 'sessao', /sessão expirou/i],
  ['The object exceeded the maximum allowed size', 'tamanho', /grande demais/i],
  ['Payload too large', 'tamanho', /grande demais/i],
  ['duplicate key value violates unique constraint', 'outro', /Tente de novo|digite o texto/i],
  ['', 'outro', /Tente de novo|digite o texto/i],
]
for (const [detalhe, codigo, padrao] of casos) {
  const erro = envio.erroDeEnvio(detalhe)
  conferir(`“${detalhe || '(vazio)'}” → ${codigo}`, erro.codigo === codigo, erro.codigo)
  conferir(`  e a mensagem orienta`, padrao.test(erro.message), erro.message.slice(0, 60) + '…')
  conferir(`  sem jargão vazando`, !/failed to fetch|row-level|jwt|payload/i.test(erro.message))
}

// ---- api(): prazo, rede e erros do servidor ---------------------------------
const fetchOriginal = globalThis.fetch

// o fetch de verdade rejeita quando o sinal aborta; o dublê precisa fazer o mesmo
// `AbortSignal.timeout` usa timer "unref": sozinho, ele não segura o processo
// acordado e o Node sai antes de o prazo estourar. Um intervalo mantém a vez.
const segura = setInterval(() => {}, 500)

globalThis.fetch = (_url, init) =>
  new Promise((_ok, rejeitar) => {
    init?.signal?.addEventListener('abort', () =>
      rejeitar(new DOMException('The operation was aborted due to timeout', 'TimeoutError')),
    )
  })
r = await capturar(() => servidor.api('/lento', {}, undefined, 120))
conferir('chamada /api sem resposta vira ErroApi 0', r.erro?.status === 0, String(r.erro?.status))
conferir('a mensagem diz que o servidor não respondeu', /não respondeu em 1 s/.test(r.erro?.message ?? ''), r.erro?.message ?? '')

globalThis.fetch = () => Promise.reject(new TypeError('Failed to fetch'))
r = await capturar(() => servidor.api('/offline'))
conferir('navegador offline vira mensagem de conexão', /conexão/i.test(r.erro?.message ?? ''), r.erro?.message ?? '')

globalThis.fetch = async () =>
  new Response(JSON.stringify({ erro: 'Avaliação fechada.', detalhe: 'prazo em 2026-11-01' }), { status: 409 })
r = await capturar(() => servidor.api('/fechado'))
conferir('erro do nosso servidor mantém o texto', r.erro?.message === 'Avaliação fechada.', r.erro?.message ?? '')
conferir('e mantém o detalhe', r.erro?.detalhe === 'prazo em 2026-11-01', String(r.erro?.detalhe))

globalThis.fetch = async () => new Response('<html>504 Gateway Timeout</html>', { status: 504 })
r = await capturar(() => servidor.api('/corrigir', { submissao_id: 'x' }))
conferir('504 da plataforma ganha explicação', /hospedagem cortou|limite/i.test(r.erro?.message ?? ''), r.erro?.message ?? '')

globalThis.fetch = async () =>
  new Response(JSON.stringify({ correcao: { id: 'c1' } }), { status: 200, headers: { 'content-type': 'application/json' } })
const ok = await servidor.api('/corrigir-manual', { submissao_id: 'x' }, undefined, 5000)
conferir('resposta normal continua passando', ok?.correcao?.id === 'c1', JSON.stringify(ok))

clearInterval(segura)
globalThis.fetch = fetchOriginal

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) do envio falharam\x1b[0m\n`)
  process.exit(1)
}
console.log(`  \x1b[32m✓ ${total} verificações do envio passaram\x1b[0m\n`)
