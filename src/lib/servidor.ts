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

let obterToken: (() => Promise<string | null>) | null = null

export function configurarToken(fn: () => Promise<string | null>) {
  obterToken = fn
}

export async function api<T>(caminho: string, corpo?: unknown, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = obterToken ? await obterToken() : null
  if (token) headers.Authorization = `Bearer ${token}`

  const resposta = await fetch(`/api${caminho}`, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
    ...init,
  })

  const texto = await resposta.text()
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
