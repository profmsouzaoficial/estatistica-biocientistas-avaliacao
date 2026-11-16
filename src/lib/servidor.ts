/**
 * Chamadas às funções de servidor (/api/*). O token do Supabase vai no header
 * Authorization e é o único jeito de o servidor saber quem está pedindo.
 */
export interface RespostaErro {
  erro: string
  detalhe?: string
}

export class ErroApi extends Error {
  status: number
  detalhe?: string
  constructor(mensagem: string, status: number, detalhe?: string) {
    super(mensagem)
    this.status = status
    this.detalhe = detalhe
  }
}

/** Mensagens para falhas que não vêm do nosso código, e sim da hospedagem. */
const MENSAGENS_DA_PLATAFORMA: Record<number, string> = {
  504:
    'A hospedagem cortou a conexão por tempo (a correção com o modelo em CPU pode passar do limite). ' +
    'Tente de novo com uma redação por vez — ou use a correção manual.',
  502: 'O serviço respondeu com erro interno (502). Se foi uma correção, confira a IA no diagnóstico do painel.',
  503: 'O serviço está temporariamente indisponível (503). Tente de novo em instantes.',
}

/**
 * Prazo de cada chamada. O padrão cobre leitura e escrita comuns; as rotas que
 * legitimamente demoram (OCR, correção pelo modelo, SIGA) passam o seu.
 *
 * O limite da função na Vercel é 60 s: a correção já desiste no servidor antes
 * (LLM_TIMEOUT_MS), e este prazo é a rede de segurança do lado do navegador.
 * Sem ele, uma conexão que cai no meio deixa o botão “Corrigir” girando para
 * sempre.
 */
export const PRAZO_PADRAO_MS = 30_000
export const PRAZO_CORRECAO_MS = 65_000
export const PRAZO_OCR_MS = 40_000
export const PRAZO_SIGA_MS = 25_000

let obterToken: (() => Promise<string | null>) | null = null

export function configurarToken(fn: () => Promise<string | null>) {
  obterToken = fn
}

export async function api<T>(
  caminho: string,
  corpo?: unknown,
  init?: RequestInit,
  prazoMs = PRAZO_PADRAO_MS,
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = obterToken ? await obterToken() : null
  if (token) headers.Authorization = `Bearer ${token}`

  let resposta: Response
  let texto: string
  try {
    resposta = await fetch(`/api${caminho}`, {
      method: corpo === undefined ? 'GET' : 'POST',
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      ...init,
      // O sinal cobre cabeçalho E corpo: a leitura do texto fica dentro do try.
      signal: init?.signal ?? AbortSignal.timeout(prazoMs),
    })
    texto = await resposta.text()
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : ''
    const segundos = Math.max(1, Math.round(prazoMs / 1000))
    if (nome === 'TimeoutError' || nome === 'AbortError') {
      throw new ErroApi(
        `O servidor não respondeu em ${segundos} s. ` +
          (caminho.includes('corrigir')
            ? 'Se foi a correção automática, o modelo em CPU pode estar sobrecarregado — tente de novo ou faça a correção manual.'
            : 'Confira sua conexão e tente de novo em instantes.'),
        0,
      )
    }
    throw new ErroApi('Não consegui falar com o servidor. Confira sua conexão e tente de novo.', 0)
  }

  let json: unknown = null
  try {
    json = texto ? JSON.parse(texto) : null
  } catch {
    json = null
  }

  if (!resposta.ok) {
    const obj = (json ?? {}) as RespostaErro
    // erro nosso vem sempre em JSON com `erro`; quando a plataforma corta a
    // requisição, o corpo é HTML e o status é 504/502 — vale explicar melhor
    const mensagem = obj.erro || MENSAGENS_DA_PLATAFORMA[resposta.status] || `Falha na comunicação (${resposta.status})`
    throw new ErroApi(mensagem, resposta.status, obj.detalhe)
  }
  return json as T
}
