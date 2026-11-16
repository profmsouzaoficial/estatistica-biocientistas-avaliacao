/**
 * Cliente da API AUTO-SIGA UFJF (https://siga-api.sparklingtech.com.br).
 *
 * Contrato conferido no openapi.json do serviço (versão 1.1.2):
 *   POST /api/lancar-notas      {turma, descricao_avaliacao, notas_json, periodo}
 *   POST /api/criar-avaliacao   {turma, num_tvc, peso, data: DD/MM/AAAA, descricao, periodo}
 *   GET  /api/notas?turma&periodo
 * Autenticação: cabeçalho X-API-Key em todas as rotas /api/*.
 */
import { ErroHttp, env, envOpcional } from './http.js'

export interface ResultadoSiga {
  status: number
  corpo: unknown
}

function base(): string {
  return (envOpcional('SIGA_API_BASE') ?? 'https://siga-api.sparklingtech.com.br').replace(/\/+$/, '')
}

function chave(): string {
  return env('SIGA_API_KEY')
}

export function sigaConfigurado(): boolean {
  return Boolean(envOpcional('SIGA_API_KEY'))
}

async function chamar(caminho: string, init: RequestInit): Promise<ResultadoSiga> {
  let resposta: Response
  try {
    resposta = await fetch(`${base()}${caminho}`, {
      ...init,
      headers: {
        'X-API-Key': chave(),
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
  } catch (erro) {
    throw new ErroHttp(
      502,
      'SIGA_INALCANCAVEL',
      'Não consegui falar com a API do SIGA. Verifique a conexão e o endereço configurado.',
      erro instanceof Error ? erro.message : String(erro),
    )
  }

  const texto = await resposta.text()
  let corpo: unknown = texto
  try {
    corpo = texto ? JSON.parse(texto) : null
  } catch {
    /* mantém texto puro */
  }
  return { status: resposta.status, corpo }
}

export interface PedidoLancamento {
  turma: string
  descricao_avaliacao: string
  notas: Record<string, number>
  periodo?: string | null
}

export async function lancarNotas(pedido: PedidoLancamento): Promise<ResultadoSiga> {
  const resultado = await chamar('/api/lancar-notas', {
    method: 'POST',
    body: JSON.stringify({
      turma: pedido.turma,
      descricao_avaliacao: pedido.descricao_avaliacao,
      notas_json: pedido.notas,
      periodo: pedido.periodo ?? undefined,
    }),
  })

  if (resultado.status < 200 || resultado.status >= 300) {
    throw new ErroHttp(502, 'SIGA_RECUSOU', mensagemSiga(resultado), resultado.corpo)
  }
  return resultado
}

export async function consultarNotas(turma: string, periodo: string): Promise<ResultadoSiga> {
  const query = new URLSearchParams({ turma, periodo })
  const resultado = await chamar(`/api/notas?${query.toString()}`, { method: 'GET' })
  if (resultado.status < 200 || resultado.status >= 300) {
    throw new ErroHttp(502, 'SIGA_RECUSOU', mensagemSiga(resultado), resultado.corpo)
  }
  return resultado
}

export interface PedidoAvaliacao {
  turma: string
  num_tvc: number
  peso: number
  /** DD/MM/AAAA */
  data: string
  descricao: string
  periodo?: string | null
}

export async function criarAvaliacao(pedido: PedidoAvaliacao): Promise<ResultadoSiga> {
  const resultado = await chamar('/api/criar-avaliacao', {
    method: 'POST',
    body: JSON.stringify({
      turma: pedido.turma,
      num_tvc: pedido.num_tvc,
      peso: pedido.peso,
      data: pedido.data,
      descricao: pedido.descricao,
      periodo: pedido.periodo ?? undefined,
    }),
  })
  if (resultado.status < 200 || resultado.status >= 300) {
    throw new ErroHttp(502, 'SIGA_RECUSOU', mensagemSiga(resultado), resultado.corpo)
  }
  return resultado
}

function mensagemSiga(resultado: ResultadoSiga): string {
  const corpo = resultado.corpo
  const detalhe =
    corpo && typeof corpo === 'object' && 'detail' in corpo
      ? typeof (corpo as { detail: unknown }).detail === 'string'
        ? (corpo as { detail: string }).detail
        : JSON.stringify((corpo as { detail: unknown }).detail)
      : typeof corpo === 'string'
        ? corpo.slice(0, 300)
        : ''
  if (resultado.status === 403) return 'A chave da API do SIGA foi recusada (X-API-Key inválida).'
  if (resultado.status === 404) return 'Turma, período ou avaliação não encontrados no SIGA.'
  return `O SIGA respondeu ${resultado.status}${detalhe ? `: ${detalhe}` : ''}`
}

/** Converte 2026-03-14 em 14/03/2026. */
export function dataBr(iso: string | null | undefined): string {
  if (iso) {
    const soData = iso.slice(0, 10)
    const [ano, mes, dia] = soData.split('-')
    if (ano && mes && dia) return `${dia}/${mes}/${ano}`
  }
  const hoje = new Date()
  const dia = String(hoje.getDate()).padStart(2, '0')
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  return `${dia}/${mes}/${hoje.getFullYear()}`
}

/** Extrai o número da TVC a partir de "TVC 4", "4ª TVC", "TVC4". */
export function numeroTvc(descricao: string): number | null {
  const achado = descricao.match(/(\d{1,2})/)
  if (!achado) return null
  const n = Number(achado[1])
  return Number.isFinite(n) && n > 0 ? n : null
}
