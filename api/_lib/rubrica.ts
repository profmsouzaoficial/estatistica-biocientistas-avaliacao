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

const VERSAO_PROMPT = 'rubrica-v1'

const SISTEMA = `Você é um professor universitário de bioestatística corrigindo redações de estudantes de graduação da UFJF.

Sua tarefa é avaliar a redação segundo a rubrica fornecida e devolver SOMENTE um objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.

Formato exato:
{
  "criterios": [
    { "id": "<id da rubrica>", "valor": <número>, "justificativa": "<1 a 2 frases>" }
  ],
  "pontos_fortes": ["<frase curta>", "..."],
  "pontos_desenvolver": ["<frase curta e acionável>", "..."],
  "comentario": "<2 a 3 frases de devolutiva geral>",
  "confianca": <número entre 0 e 1>
}

Regras obrigatórias:
- Devolva exatamente um item em "criterios" para cada id da rubrica recebida, na mesma ordem.
- "valor" nunca pode ser negativo nem ultrapassar o máximo do critério.
- Avalie apenas o texto transcrito. Se o texto estiver incompleto, avalie o que existe e registre isso em "pontos_desenvolver".
- Não invente dados que não estão na redação.
- Escreva em português do Brasil, tratando o estudante por "você".
- "pontos_fortes" e "pontos_desenvolver": de 2 a 4 itens cada, específicos para esta redação.
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

function decodificarJson(bruto: string): unknown {
  const limpo = bruto
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  const inicio = limpo.indexOf('{')
  const fim = limpo.lastIndexOf('}')
  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new ErroHttp(502, 'RESPOSTA_INVALIDA', 'O modelo não devolveu um JSON reconhecível.', bruto.slice(0, 600))
  }
  try {
    return JSON.parse(limpo.slice(inicio, fim + 1))
  } catch {
    throw new ErroHttp(502, 'RESPOSTA_INVALIDA', 'O JSON devolvido pelo modelo está malformado.', bruto.slice(0, 600))
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
    max_tokens: 1400,
    messages: [
      { role: 'system', content: SISTEMA },
      { role: 'user', content: montarUsuario(entrada, texto) },
    ],
  }
  // Alguns servidores (llama.cpp, vLLM, OpenRouter) aceitam modo JSON estrito.
  if (envOpcional('LLM_JSON_MODE') === '1') corpo.response_format = { type: 'json_object' }

  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const resposta = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(chave ? { Authorization: `Bearer ${chave}` } : {}),
    },
    body: JSON.stringify(corpo),
  })

  const bruto = await resposta.text()
  if (!resposta.ok) {
    throw new ErroHttp(
      502,
      'LLM_FALHOU',
      `O modelo respondeu ${resposta.status}. Verifique LLM_BASE_URL/LLM_MODEL e se o serviço está de pé.`,
      bruto.slice(0, 600),
    )
  }

  const dados = JSON.parse(bruto) as { choices?: { message?: { content?: string } }[] }
  const conteudo = dados.choices?.[0]?.message?.content ?? ''
  const json = decodificarJson(conteudo) as {
    criterios?: { id?: string; valor?: unknown; justificativa?: unknown }[]
    pontos_fortes?: unknown
    pontos_desenvolver?: unknown
    comentario?: unknown
    confianca?: unknown
  }

  const recebidos = Array.isArray(json.criterios) ? json.criterios : []
  const criterios: CriterioAvaliado[] = entrada.rubrica.map((c) => {
    const achado = recebidos.find((r) => r.id === c.id) ?? recebidos[entrada.rubrica.findIndex((x) => x.id === c.id)]
    const valorNumerico = typeof achado?.valor === 'number' ? achado.valor : Number(String(achado?.valor ?? '').replace(',', '.'))
    const valor = Number.isFinite(valorNumerico) ? arredondar(limitar(valorNumerico, 0, c.valor)) : 0
    const justificativa =
      typeof achado?.justificativa === 'string' && achado.justificativa.trim()
        ? achado.justificativa.trim()
        : 'Sem justificativa do modelo para este critério.'
    return { id: c.id, nome: c.nome, valor, justificativa }
  })

  const notaBruta = arredondar(criterios.reduce((t, c) => t + c.valor, 0))
  const valorTotal = entrada.rubrica.reduce((t, c) => t + c.valor, 0)
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
