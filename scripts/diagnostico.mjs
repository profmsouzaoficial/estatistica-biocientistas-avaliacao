#!/usr/bin/env node
/**
 * Diagnóstico de configuração — um comando para saber o que já funciona.
 *
 *   pnpm diagnostico
 *
 * Verifica, na ordem: Supabase (chave de serviço), corretor (Llama), visão (OCR) e SIGA.
 * Cada teste é curto e read-only: nenhuma nota é lançada e nenhuma redação é alterada.
 * Sai com código 1 se algum serviço *configurado* falhar.
 */
import { carregarEnv } from './_env.mjs'

carregarEnv()

const cor = {
  ok: (t) => `\x1b[32m${t}\x1b[0m`,
  falha: (t) => `\x1b[31m${t}\x1b[0m`,
  aviso: (t) => `\x1b[33m${t}\x1b[0m`,
  fraco: (t) => `\x1b[2m${t}\x1b[0m`,
  forte: (t) => `\x1b[1m${t}\x1b[0m`,
}

const resultados = []
function registrar(nome, estado, detalhe) {
  resultados.push({ nome, estado, detalhe })
}

const env = (nome) => (process.env[nome] ?? '').trim()

// ---------------------------------------------------------------- Supabase
async function testarSupabase() {
  const url = env('SUPABASE_URL')
  const chave = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !chave) return registrar('Supabase', 'ausente', 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

  const inicio = Date.now()
  const resposta = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/avaliacoes?select=id&limit=1`, {
    headers: { apikey: chave, Authorization: `Bearer ${chave}` },
  })
  const ms = Date.now() - inicio
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
  registrar('Supabase', 'ok', `REST respondeu em ${ms} ms`)
}

// ---------------------------------------------------------------- Llama
async function testarCorretor() {
  const base = env('LLM_BASE_URL')
  const modelo = env('LLM_MODEL')
  const chave = env('LLM_API_KEY')
  if (!base || !modelo) return registrar('Corretor (Llama)', 'ausente', 'LLM_BASE_URL / LLM_MODEL')

  const inicio = Date.now()
  const resposta = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(chave ? { Authorization: `Bearer ${chave}` } : {}) },
    body: JSON.stringify({
      model: modelo,
      messages: [{ role: 'user', content: 'Responda apenas com a palavra: ok' }],
      max_tokens: 16,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(180_000),
  })
  const texto = await resposta.text()
  const ms = Date.now() - inicio
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}: ${texto.slice(0, 200)}`)

  let dados = {}
  try {
    dados = JSON.parse(texto)
  } catch {
    throw new Error('resposta não é JSON — confira se a URL termina em /v1')
  }
  const saida = dados.choices?.[0]?.message?.content ?? ''
  const tokens = dados.usage?.completion_tokens
  const ritmo = tokens ? ` · ${(tokens / (ms / 1000)).toFixed(1)} tok/s` : ''
  registrar('Corretor (Llama)', 'ok', `${modelo} respondeu "${saida.trim().slice(0, 20)}" em ${(ms / 1000).toFixed(1)} s${ritmo}`)

  // uma redação de ~120 palavras gera ~500 tokens de saída; extrapola o tempo
  if (tokens && ms > 0) {
    const porRedacao = (500 / (tokens / (ms / 1000))) / 60
    if (porRedacao > 1) {
      registrar('  ritmo estimado', 'aviso', `~${porRedacao.toFixed(1)} min por redação · 40 alunos ≈ ${(porRedacao * 40 / 60).toFixed(1)} h em lote`)
    } else {
      registrar('  ritmo estimado', 'ok', `~${(porRedacao * 60).toFixed(0)} s por redação`)
    }
  }
}

// ---------------------------------------------------------------- Visão
async function testarVisao() {
  const provedor = (env('VISION_PROVIDER') || 'openrouter').toLowerCase()
  const chave = env('VISION_API_KEY')
  if (!chave) return registrar('Visão (OCR)', 'ausente', 'VISION_API_KEY')

  const basePadrao = {
    openrouter: 'https://openrouter.ai/api/v1',
    openai: 'https://api.openai.com/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta',
  }
  const base = (env('VISION_BASE_URL') || basePadrao[provedor] || '').replace(/\/+$/, '')
  if (!base) throw new Error(`provedor desconhecido: ${provedor}`)

  const inicio = Date.now()
  const url = provedor === 'google' ? `${base}/models?key=${encodeURIComponent(chave)}` : `${base}/models`
  const resposta = await fetch(url, {
    headers: provedor === 'google' ? {} : { Authorization: `Bearer ${chave}` },
    signal: AbortSignal.timeout(30_000),
  })
  const ms = Date.now() - inicio
  if (resposta.status === 401 || resposta.status === 403) throw new Error(`chave recusada (HTTP ${resposta.status})`)
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
  const modelo = env('VISION_MODEL') || '(padrão do provedor)'
  registrar('Visão (OCR)', 'ok', `${provedor} · ${modelo} · credencial aceita em ${ms} ms`)
}

// ---------------------------------------------------------------- SIGA
async function testarSiga() {
  const base = (env('SIGA_API_BASE') || 'https://siga-api.sparklingtech.com.br').replace(/\/+$/, '')
  const chave = env('SIGA_API_KEY')
  if (!chave) return registrar('SIGA', 'ausente', 'SIGA_API_KEY')

  const saude = await fetch(`${base}/health`, { signal: AbortSignal.timeout(20_000) })
  if (!saude.ok) throw new Error(`/health HTTP ${saude.status}`)
  const info = await saude.json()

  const turma = env('SIGA_TURMA')
  const periodo = env('SIGA_PERIODO')
  if (!turma || !periodo) {
    return registrar('SIGA', 'ok', `versão ${info.versao ?? '?'} · sem SIGA_TURMA/SIGA_PERIODO para consultar turma`)
  }

  const inicio = Date.now()
  const url = `${base}/api/notas?${new URLSearchParams({ turma, periodo })}`
  const resposta = await fetch(url, { headers: { 'X-API-Key': chave }, signal: AbortSignal.timeout(60_000) })
  const ms = Date.now() - inicio
  if (resposta.status === 403) throw new Error('X-API-Key recusada (403)')
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`)
  const quadro = await resposta.json()
  const avaliacoes = (quadro.avaliacoes ?? []).map((a) => a.descricao).filter(Boolean)
  registrar(
    'SIGA',
    'ok',
    `${turma} ${periodo} · ${quadro.alunos?.length ?? 0} alunos · ${avaliacoes.length} avaliações: ${avaliacoes.join(', ') || '—'} (${ms} ms)`,
  )
}

// ---------------------------------------------------------------- execução
const testes = [
  ['Supabase', testarSupabase],
  ['Corretor (Llama)', testarCorretor],
  ['Visão (OCR)', testarVisao],
  ['SIGA', testarSiga],
]

console.log(`\n${cor.forte('Diagnóstico — Avaliações de Redações')}\n`)

for (const [, teste] of testes) {
  try {
    await teste()
  } catch (erro) {
    const pendente = resultados[resultados.length - 1]
    if (!pendente || pendente.estado === 'ok') {
      registrar('?', 'falha', erro instanceof Error ? erro.message : String(erro))
    } else {
      pendente.estado = 'falha'
      pendente.detalhe = erro instanceof Error ? erro.message : String(erro)
    }
  }
}

const largura = Math.max(...resultados.map((r) => r.nome.length), 10)
for (const r of resultados) {
  const marca = r.estado === 'ok' ? cor.ok('✓') : r.estado === 'ausente' ? cor.fraco('○') : r.estado === 'aviso' ? cor.aviso('!') : cor.falha('✗')
  const corDetalhe = r.estado === 'ok' ? (t) => t : r.estado === 'ausente' ? cor.fraco : r.estado === 'aviso' ? cor.aviso : cor.falha
  console.log(`  ${marca} ${r.nome.padEnd(largura)}  ${corDetalhe(r.detalhe)}`)
}

const falhas = resultados.filter((r) => r.estado === 'falha')
const ausentes = resultados.filter((r) => r.estado === 'ausente')

console.log('')
if (falhas.length) {
  console.log(cor.falha(`  ${falhas.length} serviço(s) configurado(s) com problema.`))
  console.log(cor.fraco('  Corrija o que está em vermelho antes de usar em produção.\n'))
  process.exit(1)
}
if (ausentes.length) {
  console.log(cor.aviso(`  ${ausentes.length} serviço(s) ainda não configurado(s) — veja .env.example.`))
  console.log(cor.fraco('  O app funciona sem eles: sem OCR o aluno digita; sem Llama o professor corrige à mão.\n'))
} else {
  console.log(cor.ok('  Tudo configurado.\n'))
}
