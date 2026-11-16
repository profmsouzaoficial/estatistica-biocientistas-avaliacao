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

export type NivelNota = 'excelente' | 'bom' | 'regular' | 'insuficiente'

export interface CriterioAvaliado {
  id: string
  nome: string
  valor: number
  justificativa: string
  /** Nível declarado pelo modelo; a nota fica dentro da faixa dele. */
  nivel?: NivelNota | null
  /**
   * Quando a justificativa cita um trecho entre aspas, diz se esse trecho existe
   * mesmo na transcrição. `null` quando não há citação para conferir.
   */
  citacao_conferida?: boolean | null
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

/**
 * Versão do prompt gravada em cada correção (`correcoes.prompt_versao`).
 *
 * É registro de auditoria: "por que esta nota?" precisa poder voltar ao texto
 * que pediu a nota. **Suba a versão sempre que mudar algo que altera a nota** —
 * SISTEMA, FAIXAS, montarUsuario ou a normalização de `montarCorrecao` — e
 * escreva aqui o que mudou. Mudança só de comentário não conta.
 *
 * - v1: prompt inicial, pedindo uma nota de 0 ao máximo de cada critério.
 * - v2: devolutiva presa ao texto da redação (proíbe elogio genérico).
 * - v3: nível categórico ancorando a nota numa faixa (FAIXAS) e conferência
 *   das citações do modelo contra o texto do aluno (`citacao_conferida`).
 */
const VERSAO_PROMPT = 'rubrica-v3'

const SISTEMA = `Você é um professor universitário de bioestatística corrigindo redações de estudantes de graduação da UFJF.

Sua tarefa é avaliar a redação segundo a rubrica fornecida e devolver SOMENTE um objeto JSON válido, sem markdown, sem comentários e sem texto fora do JSON.

Formato exato:
{
  "criterios": [
    { "id": "<id da rubrica>", "nivel": "excelente|bom|regular|insuficiente", "valor": <número>, "justificativa": "<até 25 palavras>" }
  ],
  "pontos_fortes": ["<até 15 palavras>", "..."],
  "pontos_desenvolver": ["<até 15 palavras, acionável>", "..."],
  "comentario": "<2 frases de devolutiva geral>",
  "confianca": <número entre 0 e 1>
}

Regras obrigatórias:
- Devolva exatamente um item em "criterios" para cada id da rubrica recebida, na mesma ordem.
- "nivel" ancora a nota: excelente = 90-100% do máximo do critério; bom = 70-89%; regular = 50-69%;
  insuficiente = 0-49%. O "valor" precisa ficar dentro da faixa do nível que você escolheu.
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
- Seja criterioso e justo: a nota deve refletir o que o estudante demonstrou, não o esforço.
- Ancoragem da nota: só chega a 90–100% do máximo o critério em que a redação comprova o que foi pedido
  com definição precisa E exemplo E justificativa. Faltando um desses, o critério fica abaixo de 80%.
- Trocar definições é erro grave: se a redação confunde conceitos (chama o valor preditivo de
  sensibilidade, diz que especificidade é o mesmo que acurácia), o critério de conceitos recebe no
  máximo metade do valor.
- Se a redação não trata de algum elemento pedido no tema (por exemplo, não discute a prevalência),
  o critério correspondente não pode passar de 60%.
- A justificativa e a nota têm de combinar: se você escreveu que faltou algo, a nota não pode ser máxima.
- Em cada justificativa, cite entre aspas um trecho literal da redação que comprove a nota (12 a 100
  caracteres). Se não houver trecho que comprove, abaixe a nota até o nível que o texto sustenta.
- Antes de dar nota máxima, localize o trecho da redação que comprova; sem trecho, reduza a nota.`

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

/**
 * Faixas de cada nível, como fração do máximo do critério.
 *
 * Pedir só um número de 0 ao máximo dá nota inflada: modelos pequenos devolvem
 * 100% para redação mediana. Pedindo o nível e prendendo o número à faixa do nível,
 * o modelo primeiro classifica (tarefa mais fácil e mais estável) e só depois
 * escolhe o valor dentro de uma janela estreita.
 */
const FAIXAS: Record<NivelNota, [number, number]> = {
  excelente: [0.9, 1],
  bom: [0.7, 0.89],
  regular: [0.5, 0.69],
  insuficiente: [0, 0.49],
}

function faixaDoNivel(nivel: unknown, maximo: number): [number, number] | null {
  if (typeof nivel !== 'string') return null
  const chave = nivel.trim().toLowerCase() as NivelNota
  const faixa = FAIXAS[chave]
  if (!faixa) return null
  return [arredondar(maximo * faixa[0]), arredondar(maximo * faixa[1])]
}
const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

/** Compara texto sem acento, sem pontuação e sem caixa. */
function achatar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Confere se os trechos entre aspas da justificativa existem na redação.
 *
 * Modelos pequenos inventam citações para justificar uma nota alta — na redação
 * de teste, o llama3 escreveu "com números coerentes" num texto sem nenhum número.
 * Não dá para impedir a invenção por prompt, mas dá para mostrá-la ao professor.
 */
function conferirCitacoes(justificativa: string, texto: string | undefined): boolean | null {
  if (!texto) return null
  const citacoes = [
    ...justificativa.matchAll(/"([^"]{12,400})"|“([^”]{12,400})”|«([^»]{12,400})»|'([^']{12,400})'/g),
  ]
    .map((m) => m[1] ?? m[2] ?? m[3] ?? m[4])
    .filter(Boolean)
    .map((c) => c.trim())
  if (citacoes.length === 0) return null
  const alvo = achatar(texto)
  // O modelo costuma cortar a citação com "...": cada pedaço com 12+ letras
  // precisa existir no texto; pedaços curtos não permitem conferência.
  return citacoes.every((citacao) => {
    const pedacos = citacao
      .split(/\.\.\.|…/)
      .map((p) => p.trim())
      .filter((p) => p.length >= 12)
    return pedacos.length > 0 && pedacos.every((p) => alvo.includes(achatar(p)))
  })
}

/**
 * Devolutiva mínima quando o modelo esquece "pontos_fortes" ou "pontos_desenvolver".
 *
 * Antes o padrão era uma frase genérica ("Redação entregue dentro das instruções") —
 * justamente o tipo de frase que o prompt proíbe. Modelos pequenos frequentemente
 * devolvem a lista vazia; em vez de elogio vazio, usamos o que a própria correção
 * já diz: os critérios em que o aluno foi melhor e os em que foi pior, com a
 * justificativa dada a cada um.
 */
function devolutivaDerivada(criterios: CriterioAvaliado[], rubrica: CriterioRubrica[]) {
  const comMaximo = criterios.map((c) => ({ ...c, maximo: rubrica.find((r) => r.id === c.id)?.valor ?? 0 }))
  const proporcao = (c: { valor: number; maximo: number }) => (c.maximo > 0 ? c.valor / c.maximo : 0)
  const linha = (c: CriterioAvaliado & { maximo: number }) =>
    c.justificativa && !/^Sem justificativa/.test(c.justificativa)
      ? `${c.nome}: ${c.justificativa}`
      : `${c.nome} (${arredondar(c.valor)} de ${arredondar(c.maximo)} pontos).`

  const fortes = comMaximo
    .filter((c) => proporcao(c) >= 0.6)
    .sort((a, b) => proporcao(b) - proporcao(a))
    .slice(0, 3)
  const fracos = comMaximo
    .filter((c) => proporcao(c) < 0.6)
    .sort((a, b) => proporcao(a) - proporcao(b))
    .slice(0, 3)

  return {
    fortes: fortes.length
      ? fortes.map(linha)
      : ['A redação foi entregue; o desempenho ficou parecido entre os critérios — veja a nota por critério.'],
    desenvolver: fracos.length
      ? fracos.map(linha)
      : ['Mantenha o padrão e aplique os mesmos conceitos a um exemplo novo.'],
  }
}

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
  const inicio = Date.now()
  const restante = () => limiteMs - (Date.now() - inicio)

  /** Uma chamada ao modelo, com o orçamento de tempo que ainda sobra. */
  const pedir = async (orcamentoMs: number) => {
    let resposta: Response
    try {
      resposta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(chave ? { Authorization: `Bearer ${chave}` } : {}),
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(orcamentoMs),
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
    return decodificarJson(conteudo).json as Parameters<typeof montarCorrecao>[0]
  }

  // Modelo pequeno às vezes devolve JSON quebrado ou sem todos os critérios.
  // Uma segunda tentativa costuma bastar, e é melhor que mandar o professor
  // corrigir à mão por causa de uma vírgula. Nunca repete erro de rede/tempo.
  let ultimo: unknown = null
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const orcamento = restante()
    if (orcamento < 6_000) {
      // Menos de 6 s não dá para uma chamada útil. Se foi a primeira tentativa
      // (prazo configurado curto demais), o erro precisa dizer isso: antes o
      // laço saía com `throw null` e o professor via "Erro interno" — o pior
      // tipo de mensagem, porque não há o que fazer com ela.
      if (ultimo) throw ultimo
      throw new ErroHttp(
        504,
        'LLM_DEMOROU',
        `O prazo configurado (LLM_TIMEOUT_MS=${limiteMs} ms) é curto demais: sobram menos de 6 s para a ` +
          'primeira tentativa. Use o padrão (55000) ou um valor maior.',
      )
    }
    try {
      const json = await pedir(orcamento)
      return montarCorrecao(json, entrada.rubrica, modelo, texto)
    } catch (erro) {
      const codigo = erro instanceof ErroHttp ? erro.codigo : null
      if (codigo !== 'RESPOSTA_INVALIDA' && codigo !== 'RESPOSTA_INCOMPLETA') throw erro
      ultimo = erro
    }
  }
  throw ultimo ?? new ErroHttp(502, 'LLM_FALHOU', 'A correção automática não completou. Tente de novo.')
}

/**
 * Converte o JSON cru do modelo na correção final, com limites e valores padrão.
 * Separado da chamada HTTP para poder ser testado sem rede (scripts/testar-rubrica.mjs).
 */
export function montarCorrecao(
  json: {
    criterios?: { id?: string; nivel?: unknown; valor?: unknown; justificativa?: unknown }[]
    pontos_fortes?: unknown
    pontos_desenvolver?: unknown
    comentario?: unknown
    confianca?: unknown
  },
  rubrica: CriterioRubrica[],
  modelo: string,
  textoOriginal?: string,
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
    let valor = Number.isFinite(valorNumerico) ? arredondar(limitar(valorNumerico, 0, c.valor)) : 0
    const faixa = faixaDoNivel(achado?.nivel, c.valor)
    const nivel = faixa && Number.isFinite(valorNumerico) ? (String(achado?.nivel).trim().toLowerCase() as NivelNota) : null
    if (faixa && nivel) valor = arredondar(limitar(valor, faixa[0], Math.max(faixa[0], faixa[1])))
    const justificativa =
      typeof achado?.justificativa === 'string' && achado.justificativa.trim()
        ? achado.justificativa.trim()
        : 'Sem justificativa do modelo para este critério.'
    return {
      id: c.id,
      nome: c.nome,
      valor,
      justificativa,
      nivel,
      citacao_conferida: conferirCitacoes(justificativa, textoOriginal),
    }
  })

  const notaBruta = arredondar(criterios.reduce((t, c) => t + c.valor, 0))
  const valorTotal = rubrica.reduce((t, c) => t + c.valor, 0)
  const notaFinal = Math.round((notaBruta / (valorTotal || 1)) * 100) / 10

  const confianca =
    typeof json.confianca === 'number' && Number.isFinite(json.confianca) ? limitar(json.confianca, 0, 1) : null

  const derivada = devolutivaDerivada(criterios, rubrica)

  return {
    criterios,
    nota_bruta: notaBruta,
    nota_final: limitar(notaFinal, 0, 10),
    pontos_fortes: listaDeTextos(json.pontos_fortes, derivada.fortes),
    pontos_desenvolver: listaDeTextos(json.pontos_desenvolver, derivada.desenvolver),
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
