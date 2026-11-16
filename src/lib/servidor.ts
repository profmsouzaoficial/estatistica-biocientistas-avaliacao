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
    throw new ErroApi(obj.erro || `Falha na comunicação (${resposta.status})`, resposta.status, obj.detalhe)
  }
  return json as T
}
