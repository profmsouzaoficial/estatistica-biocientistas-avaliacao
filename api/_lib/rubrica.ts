/**
 * Correção por rubrica usando um modelo de linguagem compatível com a API da
 * OpenAI (llama.cpp, Ollama, vLLM, OpenRouter, DeepSeek…).
 *
 * Decisão de projeto: o modelo NÃO decide a nota. Ele pontua cada critério da
 * rubrica dentro do máximo definido pelo professor; a nota final é sempre
 * calculada aqui, de forma determinística e auditável.
 */
import { ErroHttp, env, envOpcional } from './http.js'

export interface CriterioRubrica {
  id: string
  nome: string
  descricao: string
  valor: number
}

export interface CriterioAvaliado {
  id: string
  nome: string
  valor: number
  justificativa: string
}

export interface SaidaCorrecao {
  criterios: CriterioAvaliado[]
  nota_bruta: number
  nota_final: number
  pontos_fortes: string[]
  pontos_desenvolver: string[]
  comentario: string
  confianca: number | null
  modelo: string
  prompt_versao: string
}

export interface EntradaCorrecao {
  titulo: string
  tema: string
  instrucoes: string
  valor_total: number
  rubrica: CriterioRubrica[]
  texto: string
  limitePalavras?: number
}

const VERSAO_PROMPT = 'rubrica-v2'

const SISTEMA = `Você é um professor universitário de bioestatística corrigindo redações de estudantes de graduação da UFJF.

Sua tarefa é avaliar a redação segundo a rubrica fornecida e devolver SOMENTE um objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.

Formato exato:
{
  "criterios": [
    { "id": "<id da rubrica>", "valor": <número>, "justificativa": "<até 25 palavras>" }
  ],
  "pontos_fortes": ["<até 15 palavras>", "..."],
  "pontos_desenvolver": ["<até 15 palavras, acionável>", "..."],
  "comentario": "<2 frases de devolutiva geral>",
  "confianca": <número entre 0 e 1>
}

Regras obrigatórias:
- Devolva exatamente um item em "criterios" para cada id da rubrica recebida, na mesma ordem.
- "valor" nunca pode ser negativo nem ultrapassar o máximo do critério.
- Avalie apenas o texto transcrito. Se o texto estiver incompleto, avalie o que existe e registre isso em "pontos_desenvolver".
- Não invente dados que não estão na redação.
- Escreva em português do Brasil, tratando o estudante por "você".
- "pontos_fortes" e "pontos_desenvolver": no mínimo 2 e no máximo 3 itens cada.
- Todo item precisa citar ou parafrasear um trecho concreto da redação. Exemplo bom: 'Explica
  corretamente por que a prevalência muda o VPP, ao citar o teste de triagem'. Exemplo ruim:
  'Redação entregue dentro das instruções', 'Bom domínio do conteúdo', 'Continue assim'.
- Frases genéricas são proibidas: se não houver como apontar o trecho, descreva a ideia que está
  no texto, sem elogio vazio.
- Em "pontos_desenvolver", comece com um verbo de ação (Explique, Justifique, Diferencie, Traga,
  Corrija) e diga o que fazer na próxima redação.
- Não repita a mesma ideia em "pontos_fortes" e em "pontos_desenvolver".
- Seja breve: cada frase com no máximo 25 palavras. Respostas curtas são melhores que longas.
- Seja criterioso e justo: a nota deve refletir o que o estudante demonstrou, não o esforço.`

function montarUsuario(entrada: EntradaCorrecao, texto: string): string {
  const rubrica = entrada.rubrica
    .map((c, i) => `${i + 1}. id="${c.id}" | ${c.nome} | máximo ${c.valor} pts | ${c.descricao}`)
    .join('\n')

  return `## Avaliação
Título: ${entrada.titulo}
Tema: ${entrada.tema}
Instruções dadas ao estudante: ${entrada.instrucoes}
Valor total: ${entrada.valor_total} pontos

## Rubrica (pontue cada item, respeitando o máximo)
${rubrica}

## Redação do estudante (transcrição)
"""
${texto}
"""

Avalie agora e responda apenas com o JSON.`
}

function normalizarBase(base: string): string {
  return base.replace(/\/+$/, '')
}

/** Índice onde começa a última string aberta (ou -1 se todas fecharam). */
function stringAberta(texto: string): number {
  let emString = false
  let escape = false
  let inicio = -1
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (emString) {
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') emString = false
      continue
    }
    if (c === '"') {
      emString = true
      inicio = i
    }
  }
  return emString ? inicio : -1
}

/** Fecha { e [ pendentes respeitando strings; descarta fechamentos órfãos. */
function fecharEstruturas(texto: string): string {
  const pilha: string[] = []
  let saida = ''
  let emString = false
  let escape = false

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (emString) {
      saida += c
      if (escape) escape = false
      else if (c === '\\') escape = true
      else if (c === '"') emString = false
      continue
    }
    if (c === '"') {
      emString = true
      saida += c
      continue
    }
    if (c === '{' || c === '[') {
      pilha.push(c)
      saida += c
      continue
    }
    if (c === '}' || c === ']') {
      if (pilha.length === 0) continue
      while (pilha.length > 0 && (pilha[pilha.length - 1] === '{') !== (c === '}')) {
        saida += pilha.pop() === '{' ? '}' : ']'
      }
      if (pilha.length > 0) pilha.pop()
      saida += c
      continue
    }
    saida += c
  }

  while (pilha.length > 0) saida += pilha.pop() === '{' ? '}' : ']'
  return saida
}

/** Remove restos de chave/valor sem conteúdo deixados por um corte. */
function limparCauda(texto: string): string {
  return texto
    .replace(/,\s*$/, '')
    .replace(/,\s*"[^"]*"\s*:\s*$/, '')
    .replace(/,\s*"[^"]*"\s*$/, '')
    .replace(/"[^"]*"\s*:\s*$/, '')
    .replace(/"[^"]*"\s*$/, '')
    .replace(/[,\s]+$/, '')
}

/**
 * Modelos pequenos erram a mão no JSON: esquecem uma chave de fechamento, deixam
 * uma vírgula pendente ou cortam a resposta no meio. Em vez de perder a correção,
 * reconstruímos o texto respeitando strings e a pilha de { [ — e testamos o parse
 * a cada tentativa, devolvendo o primeiro candidato válido.
 */
export function repararJson(texto: string): string {
  const inicio = stringAberta(texto)
  let atual = inicio >= 0 ? texto.slice(0, inicio) : texto
  atual = fecharEstruturas(limparCauda(atual))

  for (let tentativa = 0; tentativa < 6; tentativa++) {
    try {
      JSON.parse(atual)
      return atual
    } catch {
      const proximo = fecharEstruturas(limparCauda(atual))
      if (proximo === atual) break
      atual = proximo
    }
  }
  return atual
}

export function decodificarJson(bruto: string): { json: unknown; reparado: boolean } {
  const limpo = bruto.replace(/```(?:json)?/gi, '').trim()
  const inicio = limpo.indexOf('{')
  if (inicio === -1) {
    throw new ErroHttp(502, 'RESPOSTA_INVALIDA', 'O modelo não devolveu um JSON reconhecível.', bruto.slice(0, 600))
  }
  const texto = limpo.slice(inicio)

  const validar = (valor: unknown): Record<string, unknown> => {
    if (!valor || typeof valor !== 'object' || !Array.isArray((valor as { criterios?: unknown }).criterios)) {
      throw new Error('sem criterios')
    }
    return valor as Record<string, unknown>
  }

  const fim = texto.lastIndexOf('}')
  if (fim > 0) {
    try {
      return { json: validar(JSON.parse(texto.slice(0, fim + 1))), reparado: false }
    } catch {
      /* tenta reparar abaixo */
    }
  }

  try {
    const json = validar(JSON.parse(repararJson(texto)))
    console.warn('[correcao] JSON do modelo estava malformado e foi reparado.')
    return { json, reparado: true }
  } catch {
    throw new ErroHttp(
      502,
      'RESPOSTA_INVALIDA',
      'O modelo devolveu um JSON que não consegui interpretar. Tente corrigir de novo ou use a correção manual.',
      bruto.slice(0, 600),
    )
  }
}

const arredondar = (n: number) => Math.round(n * 10) / 10
const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

function listaDeTextos(valor: unknown, padrao: string[]): string[] {
  if (!Array.isArray(valor)) return padrao
  const textos = valor.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => v.trim())
  return textos.length ? textos.slice(0, 5) : padrao
}

export async function corrigirRedacao(entrada: EntradaCorrecao): Promise<SaidaCorrecao> {
  const base = normalizarBase(env('LLM_BASE_URL'))
  const modelo = env('LLM_MODEL')
  const chave = envOpcional('LLM_API_KEY')
  const limite = Number(envOpcional('LLM_MAX_PALAVRAS') ?? entrada.limitePalavras ?? 1200)

  const palavras = entrada.texto.trim().split(/\s+/)
  const texto = palavras.length > limite ? `${palavras.slice(0, limite).join(' ')} [… texto truncado]` : entrada.texto

  const corpo: Record<string, unknown> = {
    model: modelo,
    temperature: 0.1,
    max_tokens: Number(envOpcional('LLM_MAX_TOKENS') ?? 1400),
    messages: [
      { role: 'system', content: SISTEMA },
      { role: 'user', content: montarUsuario(entrada, texto) },
    ],
  }
  // Alguns servidores (llama.cpp, vLLM, OpenRouter) aceitam modo JSON estrito.
  if (envOpcional('LLM_JSON_MODE') === '1') corpo.response_format = { type: 'json_object' }

  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`

  // Sem prazo, um modelo travado fica até a hospedagem matar a função — e aí o
  // professor vê só um 504 sem explicação. O padrão de 55 s cabe no limite de
  // 60 s do plano Hobby da Vercel; o lote fora da Vercel pode esperar mais.
  const limiteMs = Number(envOpcional('LLM_TIMEOUT_MS') ?? 55_000)
  let resposta: Response
  try {
    resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(chave ? { Authorization: `Bearer ${chave}` } : {}),
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(limiteMs),
    })
  } catch (erro) {
    const abortou = erro instanceof Error && (erro.name === 'TimeoutError' || erro.name === 'AbortError')
    if (abortou) {
      throw new ErroHttp(
        504,
        'LLM_DEMOROU',
        `O modelo passou de ${Math.round(limiteMs / 1000)} s e a correção foi interrompida. ` +
          'Tente de novo com uma redação por vez, corrija à mão — ou rode o lote no servidor do modelo ' +
          '(pnpm corrigir:lote), que espera mais tempo.',
      )
    }
    throw new ErroHttp(
      502,
      'LLM_INALCANCAVEL',
      'Não consegui falar com o modelo. Confira LLM_BASE_URL e se o serviço no Coolify está no ar.',
      erro instanceof Error ? erro.message : String(erro),
    )
  }

  const bruto = await resposta.text()
  if (!resposta.ok) {
    throw new ErroHttp(
      502,
      'LLM_FALHOU',
      `O modelo respondeu ${resposta.status}. Verifique LLM_BASE_URL/LLM_MODEL e se o serviço está de pé.`,
      bruto.slice(0, 600),
    )
  }

  const dados = JSON.parse(bruto) as {
    choices?: { message?: { content?: string }; finish_reason?: string }[]
  }
  const escolha = dados.choices?.[0]
  const conteudo = escolha?.message?.content ?? ''
  if (escolha?.finish_reason === 'length') {
    throw new ErroHttp(
      502,
      'RESPOSTA_TRUNCADA',
      'O modelo atingiu o limite de tokens e cortou a correção. Aumente LLM_MAX_TOKENS (ou peça justificativas mais curtas) e corrija de novo.',
      conteudo.slice(-400),
    )
  }
  const { json } = decodificarJson(conteudo) as {
    json: {
      criterios?: { id?: string; valor?: unknown; justificativa?: unknown }[]
      pontos_fortes?: unknown
      pontos_desenvolver?: unknown
      comentario?: unknown
      confianca?: unknown
    }
  }

  return montarCorrecao(json, entrada.rubrica, modelo)
}

/**
 * Converte o JSON cru do modelo na correção final, com limites e valores padrão.
 * Separado da chamada HTTP para poder ser testado sem rede (scripts/testar-rubrica.mjs).
 */
export function montarCorrecao(
  json: {
    criterios?: { id?: string; valor?: unknown; justificativa?: unknown }[]
    pontos_fortes?: unknown
    pontos_desenvolver?: unknown
    comentario?: unknown
    confianca?: unknown
  },
  rubrica: CriterioRubrica[],
  modelo: string,
): SaidaCorrecao {
  const recebidos = Array.isArray(json.criterios) ? json.criterios : []

  // Correção parcial é pior que correção nenhuma: o aluno receberia 0 em critérios
  // que o modelo simplesmente não chegou a avaliar. Exige todos os critérios.
  const faltando = rubrica.filter((c, indice) => !recebidos.some((r) => r?.id === c.id) && !recebidos[indice])
  if (faltando.length > 0) {
    throw new ErroHttp(
      502,
      'RESPOSTA_INCOMPLETA',
      `O modelo avaliou ${rubrica.length - faltando.length} de ${rubrica.length} critérios. Aumente LLM_MAX_TOKENS e corrija de novo, ou use a correção manual.`,
    )
  }
  const criterios: CriterioAvaliado[] = rubrica.map((c) => {
    const achado = recebidos.find((r) => r.id === c.id) ?? recebidos[rubrica.findIndex((x) => x.id === c.id)]
    const valorNumerico = typeof achado?.valor === 'number' ? achado.valor : Number(String(achado?.valor ?? '').replace(',', '.'))
    const valor = Number.isFinite(valorNumerico) ? arredondar(limitar(valorNumerico, 0, c.valor)) : 0
    const justificativa =
      typeof achado?.justificativa === 'string' && achado.justificativa.trim()
        ? achado.justificativa.trim()
        : 'Sem justificativa do modelo para este critério.'
    return { id: c.id, nome: c.nome, valor, justificativa }
  })

  const notaBruta = arredondar(criterios.reduce((t, c) => t + c.valor, 0))
  const valorTotal = rubrica.reduce((t, c) => t + c.valor, 0)
  const notaFinal = Math.round((notaBruta / (valorTotal || 1)) * 100) / 10

  const confianca =
    typeof json.confianca === 'number' && Number.isFinite(json.confianca) ? limitar(json.confianca, 0, 1) : null

  return {
    criterios,
    nota_bruta: notaBruta,
    nota_final: limitar(notaFinal, 0, 10),
    pontos_fortes: listaDeTextos(json.pontos_fortes, ['Redação entregue dentro das instruções.']),
    pontos_desenvolver: listaDeTextos(json.pontos_desenvolver, ['Detalhe melhor o raciocínio estatístico na próxima.']),
    comentario:
      typeof json.comentario === 'string' && json.comentario.trim()
        ? json.comentario.trim()
        : 'Devolutiva gerada automaticamente a partir da rubrica.',
    confianca,
    modelo,
    prompt_versao: VERSAO_PROMPT,
  }
}

export function llmConfigurado(): boolean {
  return Boolean(envOpcional('LLM_BASE_URL') && envOpcional('LLM_MODEL'))
}
