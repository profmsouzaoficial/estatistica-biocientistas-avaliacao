#!/usr/bin/env node
/**
 * Correção em lote das redações pendentes — o caminho recomendado quando o
 * Llama roda em CPU, porque não depende do limite de tempo da função da Vercel.
 *
 * Uso:
 *   pnpm corrigir:lote                 # todas as pendentes
 *   pnpm corrigir:lote --avaliacao ID  # só uma avaliação
 *   pnpm corrigir:lote --limite 5      # no máximo 5
 *   pnpm corrigir:lote --refazer       # refaz correções já existentes
 */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { carregarEnv, exigir, raiz, supabaseRest } from './_env.mjs'

const origens = carregarEnv()
console.log(`\n  Correção em lote · Análise de Dados para Biocientistas`)
if (origens.length) console.log(`  env: ${origens.join(', ')}`)
exigir('SUPABASE_URL')
exigir('SUPABASE_SERVICE_ROLE_KEY')
exigir('LLM_BASE_URL')
exigir('LLM_MODEL')

const argumentos = process.argv.slice(2)
const lerArg = (nome) => {
  const i = argumentos.indexOf(nome)
  return i >= 0 ? argumentos[i + 1] : undefined
}
const avaliacaoFiltro = lerArg('--avaliacao')
const limite = Number(lerArg('--limite') ?? 0)
const refazer = argumentos.includes('--refazer')

// --- compila o serviço de correção (mesmo código da rota /api/corrigir) -----
const entrada = join(raiz, '.temp-api', 'lote.ts')
await mkdir(join(raiz, '.temp-api'), { recursive: true })
await writeFile(
  entrada,
  `export { corrigirSubmissao } from ${JSON.stringify(join(raiz, 'api/_lib/corrigirServico.ts'))}\n`,
)
const saida = join(raiz, '.temp-api', 'lote.mjs')
await build({
  entryPoints: [entrada],
  outfile: saida,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'silent',
})
const { corrigirSubmissao } = await import(`file://${saida}?v=${Date.now()}`)

// --- seleciona as submissões ------------------------------------------------
const filtroAvaliacao = avaliacaoFiltro ? `&avaliacao_id=eq.${encodeURIComponent(avaliacaoFiltro)}` : ''
const submissoes = await supabaseRest(
  `submissoes?status=eq.enviada${filtroAvaliacao}&select=id,aluno_id,avaliacao_id,transcrito&order=enviado_em.asc`,
)
const correcoes = await supabaseRest('correcoes?select=submissao_id')
const jaCorrigidas = new Set(correcoes.map((c) => c.submissao_id))

const alvo = (submissoes ?? [])
  .filter((s) => s.transcrito && (refazer || !jaCorrigidas.has(s.id)))
  .slice(0, limite > 0 ? limite : undefined)

if (alvo.length === 0) {
  console.log('\n  Nada a corrigir: não há redações enviadas sem correção.\n')
  process.exit(0)
}

console.log(`\n  ${alvo.length} redação(ões) na fila. Modelo: ${process.env.LLM_MODEL}`)
console.log(`  ${process.env.LLM_BASE_URL}\n`)

let ok = 0
const falhas = []
const inicio = Date.now()

for (let i = 0; i < alvo.length; i++) {
  const submissao = alvo[i]
  const antes = Date.now()
  process.stdout.write(`  [${i + 1}/${alvo.length}] ${submissao.id.slice(0, 8)}… `)
  try {
    const { correcao } = await corrigirSubmissao(submissao.id)
    ok++
    console.log(`nota ${correcao.nota_final}/10 (${((Date.now() - antes) / 1000).toFixed(1)}s)`)
  } catch (erro) {
    const mensagem = erro?.message ?? String(erro)
    falhas.push({ id: submissao.id, mensagem })
    console.log(`FALHOU — ${mensagem}`)
    if (erro?.codigo === 'CONFIGURACAO_AUSENTE' || /ECONNREFUSED|fetch failed/i.test(mensagem)) {
      console.log('\n  O serviço do modelo parece fora do ar. Interrompendo o lote.\n')
      break
    }
  }
}

const minutos = ((Date.now() - inicio) / 60000).toFixed(1)
console.log(`\n  Resumo: ${ok} corrigida(s), ${falhas.length} falha(s), ${minutos} min.`)
if (falhas.length) {
  console.log('  Falhas:')
  for (const f of falhas) console.log(`   · ${f.id}: ${f.mensagem}`)
}
console.log('\n  As correções entram como "pendentes" — revise no painel antes de lançar no SIGA.\n')
