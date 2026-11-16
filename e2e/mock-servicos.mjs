#!/usr/bin/env node
/**
 * Serviços falsos para o teste de ponta a ponta (porta 3199).
 *
 * Imita o suficiente do Llama e da API do SIGA para exercitar o caminho real do
 * aplicativo sem depender do Coolify nem escrever nota em aluno de verdade.
 *
 * Uso (o e2e já sobe sozinho):
 *   node e2e/mock-servicos.mjs
 */
import { createServer } from 'node:http'

const porta = Number(process.env.PORTA_MOCK ?? 3199)

const TRANSCRICAO = `A sensibilidade de um teste diagnóstico é a capacidade de identificar corretamente as pessoas que têm a doença, ou seja, a proporção de verdadeiros positivos entre os doentes. Já a especificidade mede a capacidade de identificar corretamente quem não tem a doença, isto é, a proporção de verdadeiros negativos entre os sadios.

Um teste muito sensível serve para triagem, porque dificilmente deixa passar alguém doente. Um teste muito específico serve para confirmar o diagnóstico, porque raramente classifica um sadio como doente. O ideal é equilibrar os dois, mas existe um compromisso: ao aumentar a sensibilidade, em geral a especificidade cai, e vice-versa.

Por isso o valor preditivo positivo depende da prevalência. Em uma população com poucos doentes, mesmo um teste específico pode gerar muitos falsos positivos.`

function rubricDoPrompt(prompt) {
  const criterios = []
  const regex = /id="([^"]+)"\s*\|\s*([^|]+?)\s*\|\s*máximo\s*([\d.,]+)\s*pts/gi
  let achado
  while ((achado = regex.exec(prompt)) !== null) {
    criterios.push({ id: achado[1], nome: achado[2], max: Number(achado[3].replace(',', '.')) })
  }
  return criterios
}

function correcaoJson(criterios) {
  const lista = criterios.map((c) => ({
    id: c.id,
    valor: Math.round(Math.min(c.max, c.max * 0.75) * 10) / 10,
    justificativa: `O texto aborda "${c.nome}" com correção, mas poderia aprofundar com um exemplo numérico.`,
  }))
  return {
    criterios: lista,
    pontos_fortes: [
      'Distingue sensibilidade de especificidade com definições corretas.',
      'Relaciona o teste à finalidade clínica (triagem versus confirmação).',
    ],
    pontos_desenvolver: [
      'Inclua um exemplo numérico com tabela 2x2 para tornar o raciocínio concreto.',
      'Explique melhor o papel da prevalência no valor preditivo positivo.',
    ],
    comentario:
      'Boa redação: os conceitos centrais estão corretos e bem organizados. O próximo passo é sustentar a argumentação com um exemplo numérico completo.',
    confianca: 0.82,
  }
}

function responderJson(res, status, corpo) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(corpo))
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pedacos = []
  for await (const p of req) pedacos.push(p)
  const bruto = Buffer.concat(pedacos).toString('utf8')
  let corpo = null
  try {
    corpo = bruto ? JSON.parse(bruto) : null
  } catch {
    corpo = bruto
  }

  console.log(`  [mock] ${req.method} ${url.pathname}`)

  if (url.pathname === '/health') return responderJson(res, 200, { status: 'ok' })

  // ---- LLM / visão (compatível com OpenAI) --------------------------------
  if (url.pathname === '/v1/chat/completions') {
    const mensagens = corpo?.messages ?? []
    const partes = mensagens.flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    const temImagem = partes.some((p) => p?.type === 'image_url') || mensagens.some((m) => Array.isArray(m.content) && m.content.some((p) => p?.type === 'image_url'))

    if (temImagem) {
      return responderJson(res, 200, {
        id: 'mock-ocr',
        model: corpo?.model ?? 'mock-vision',
        choices: [{ index: 0, message: { role: 'assistant', content: TRANSCRICAO }, finish_reason: 'stop' }],
      })
    }

    const prompt = mensagens
      .map((m) => (typeof m.content === 'string' ? m.content : (m.content ?? []).map((p) => p?.text ?? '').join('\n')))
      .join('\n')
    const criterios = rubricDoPrompt(prompt)
    if (criterios.length === 0) {
      console.warn('  [mock] rubrica não encontrada no prompt!')
      return responderJson(res, 200, {
        choices: [{ index: 0, message: { role: 'assistant', content: '{"criterios":[]}' } }],
      })
    }
    const json = correcaoJson(criterios)
    return responderJson(res, 200, {
      id: 'mock-llm',
      model: corpo?.model ?? 'mock-llama',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(json) }, finish_reason: 'stop' }],
    })
  }

  // ---- SIGA ---------------------------------------------------------------
  if (url.pathname.startsWith('/api/')) {
    if (req.headers['x-api-key'] !== 'mock-siga') {
      return responderJson(res, 403, { detail: 'X-API-Key ausente ou inválida (mock).' })
    }
    if (url.pathname === '/api/lancar-notas') {
      return responderJson(res, 200, {
        ok: true,
        turma: corpo?.turma,
        descricao_avaliacao: corpo?.descricao_avaliacao,
        quantidade: Object.keys(corpo?.notas_json ?? {}).length,
        notas_json: corpo?.notas_json,
        origem: 'mock',
      })
    }
    if (url.pathname === '/api/criar-avaliacao') {
      return responderJson(res, 200, { ok: true, criada: corpo, origem: 'mock' })
    }
    if (url.pathname === '/api/notas') {
      return responderJson(res, 200, { alunos: [], resumo: {}, origem: 'mock' })
    }
    return responderJson(res, 404, { detail: 'Rota de mock desconhecida.' })
  }

  responderJson(res, 404, { erro: 'mock: rota desconhecida', caminho: url.pathname })
})

servidor.listen(porta, '127.0.0.1', () => {
  console.log(`  mock de serviços em http://127.0.0.1:${porta}`)
})
