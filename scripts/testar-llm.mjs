/**
 * Pré-voo do corretor: conversa com o Llama do Coolify sem tocar no banco.
 *
 *   node scripts/testar-llm.mjs
 *   node scripts/testar-llm.mjs --texto caminho/para/redacao.txt
 *
 * Confere, em ordem: se o endpoint responde /models, se aceita a chave, quanto
 * tempo leva e se o JSON vem no formato que a correção espera (critérios com
 * valor, pontos fortes e pontos a desenvolver). Serve para descobrir problema de
 * rede/modelo antes de um aluno enviar redação de verdade.
 */
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'

import { carregarEnv } from './_env.mjs'

carregarEnv()

// api/_lib/rubrica.ts importa './http.js' (nome que a Vercel exige): o Node não
// resolve isso sozinho, então o módulo é empacotado antes de ser importado.
const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
await mkdir(join(raiz, '.temp-api'), { recursive: true })
const empacotado = join(raiz, '.temp-api', 'rubrica-teste.mjs')
const { build } = await import('esbuild')
await build({
  entryPoints: [join(raiz, 'api', '_lib', 'rubrica.ts')],
  outfile: empacotado,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  logLevel: 'silent',
})
const { corrigirRedacao } = await import(pathToFileURL(empacotado).href)

// mesma forma que avaliações guardam no banco: id, nome, descrição e valor
const RUBRICA = [
  { id: 'conceito', nome: 'Conceito estatístico', valor: 4, descricao: 'Explica corretamente sensibilidade, especificidade e valor preditivo.' },
  { id: 'interpretacao', nome: 'Interpretação dos resultados', valor: 3, descricao: 'Lê os números no contexto clínico, sem trocar as definições.' },
  { id: 'escrita', nome: 'Clareza e norma culta', valor: 2, descricao: 'Texto organizado, coeso e em português correto.' },
  { id: 'conclusao', nome: 'Conclusão', valor: 1, descricao: 'Fecha com uma recomendação coerente com os dados.' },
]

const TEXTO_PADRAO = `Testes diagnósticos servem para separar quem tem a doença de quem não tem. A sensibilidade é a proporção de doentes que o teste identifica, enquanto a especificidade é a proporção de sadios que o teste classifica como negativos. Um teste muito sensível erra pouco ao descartar a doença, e por isso é bom para triagem. Já o valor preditivo positivo depende da prevalência: em população com poucos casos, mesmo um teste específico gera muitos falsos positivos. No exemplo da aula, com prevalência de 2%, o valor preditivo positivo ficou baixo, o que mostra que testar todo mundo sem critério pode gerar mais ansiedade do que diagnóstico. Portanto, o ideal é usar o teste na população certa e confirmar com um segundo exame.`

const argumentos = process.argv.slice(2)
const indiceTexto = argumentos.indexOf('--texto')
let texto = TEXTO_PADRAO
if (indiceTexto >= 0) {
  const caminho = argumentos[indiceTexto + 1]
  if (!caminho || !existsSync(caminho)) {
    console.error(`✗ Arquivo não encontrado: ${caminho ?? '(nada depois de --texto)'}`)
    process.exit(1)
  }
  const { readFileSync } = await import('node:fs')
  texto = readFileSync(caminho, 'utf8')
}

const base = (process.env.LLM_BASE_URL ?? '').replace(/\/+$/, '')
const modelo = process.env.LLM_MODEL ?? ''
const chave = process.env.LLM_API_KEY ?? ''

if (!base || !modelo) {
  console.error('\n✗ Defina LLM_BASE_URL e LLM_MODEL (veja .env.example).\n')
  process.exit(1)
}

console.log(`\n▸ Endpoint: ${base}`)
console.log(`▸ Modelo:   ${modelo}`)
console.log(`▸ Chave:    ${chave ? `informada (${chave.slice(0, 4)}…)` : 'nenhuma'}`)
console.log(`▸ Texto:    ${texto.trim().split(/\s+/).length} palavras\n`)

// 1. o servidor está de pé e aceita a chave?
const inicioLista = Date.now()
try {
  const resposta = await fetch(`${base}/models`, {
    headers: chave ? { Authorization: `Bearer ${chave}` } : {},
    signal: AbortSignal.timeout(20000),
  })
  const corpo = await resposta.text()
  if (!resposta.ok) {
    console.log(`✗ /models respondeu ${resposta.status}: ${corpo.slice(0, 200)}`)
    if (resposta.status === 401) console.log('  A chave está errada ou não foi enviada.')
  } else {
    const dados = JSON.parse(corpo)
    const nomes = (dados.data ?? []).map((m) => m.id)
    console.log(`✓ /models respondeu em ${Date.now() - inicioLista} ms`)
    if (nomes.length) console.log(`  modelos no servidor: ${nomes.slice(0, 6).join(', ')}${nomes.length > 6 ? '…' : ''}`)
    if (nomes.length && !nomes.includes(modelo)) {
      console.log(`  ⚠ "${modelo}" não aparece na lista — o llama.cpp pode recusar a chamada.`)
    }
  }
} catch (e) {
  console.log(`✗ Não consegui falar com ${base}/models: ${e.message}`)
  console.log('  Confira se o serviço está no ar, se a URL tem /v1 no final e se o firewall da Vercel alcança o Coolify.')
  process.exit(1)
}

// 2. correção de verdade, com o mesmo prompt que roda em produção
const inicio = Date.now()
try {
  const saida = await corrigirRedacao({
    titulo: 'TVC 1 — Testes diagnósticos',
    tema: 'Sensibilidade, especificidade e valor preditivo',
    instrucoes: 'Explique os conceitos e comente o efeito da prevalência, em até 20 linhas.',
    valor_total: 10,
    rubrica: RUBRICA,
    texto,
  })
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
  const soma = saida.criterios.reduce((t, c) => t + c.valor, 0)

  console.log(`✓ Correção em ${segundos} s · modelo ${saida.modelo} · prompt ${saida.prompt_versao}`)
  console.log(`  nota bruta ${saida.nota_bruta.toFixed(1)}/10 · nota final ${saida.nota_final.toFixed(1)} · soma dos critérios ${soma.toFixed(1)}`)
  for (const criterio of saida.criterios) {
    console.log(`  · ${criterio.id}: ${criterio.valor} — ${criterio.justificativa}`)
  }
  console.log(`  pontos fortes: ${saida.pontos_fortes.join(' | ')}`)
  console.log(`  a desenvolver: ${saida.pontos_desenvolver.join(' | ')}`)
  console.log(`  comentário: ${saida.comentario}`)

  if (segundos > 55) {
    console.log(`\n⚠ Passou de 55 s: a Vercel corta a função em ~60 s no plano atual.`)
    console.log(`  Use "pnpm corrigir:lote" (roda fora da Vercel) para turmas grandes.`)
  }
  console.log('')
} catch (e) {
  console.log(`✗ A correção falhou: ${e.message}`)
  process.exit(1)
}
