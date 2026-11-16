/**
 * Base das funções de API (Vercel) e do servidor espelho usado em desenvolvimento.
 *
 * A assinatura é a do runtime Node da Vercel: `(req, res)` do node:http. O mesmo
 * arquivo roda em `scripts/dev.mjs` — não existe caminho "só em produção".
 *
 * Toda função devolve `Resposta` e o adaptador cuida de serializar. Segredos vêm
 * de variáveis de ambiente do servidor e nunca chegam ao navegador.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

export interface Requisicao {
  metodo: string
  caminho: string
  query: Record<string, string>
  cabecalhos: Record<string, string>
  corpo: unknown
}

export interface Resposta {
  status: number
  corpo: unknown
  cabecalhos?: Record<string, string>
}

export type Manipulador = (req: Requisicao) => Promise<Resposta>

/** Erro com status HTTP — vira resposta JSON previsível para a interface. */
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
    readonly detalhe?: unknown,
  ) {
    super(mensagem)
  }
}

export const ok = (corpo: unknown): Resposta => ({ status: 200, corpo })
export const criado = (corpo: unknown): Resposta => ({ status: 201, corpo })
export const semConteudo = (): Resposta => ({ status: 204, corpo: null })

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

export function env(nome: string, padrao?: string): string {
  const valor = process.env[nome]
  if (valor && valor.trim() !== '') return valor.trim()
  if (padrao !== undefined) return padrao
  throw new ErroHttp(503, 'CONFIGURACAO_AUSENTE', `A variável de ambiente ${nome} não está configurada.`)
}

/**
 * `fetch` com prazo — para toda chamada que sai do app.
 *
 * Sem prazo, um serviço que não responde não gera erro: gera espera. A função da
 * Vercel é morta pela plataforma (~10 s no plano Hobby), o navegador recebe um
 * 504 sem corpo e a tela mostra "erro de rede" — o professor não sabe se o banco,
 * o SIGA ou o modelo caiu, e tentar de novo parece a única saída.
 *
 * Com prazo, o app responde antes da plataforma, com código e instrução. O
 * tempo total conta desde o pedido até o último byte do corpo: o mesmo sinal
 * aborta a leitura, então um servidor que manda cabeçalho e trava no corpo também
 * é interrompido.
 *
 * Só a correção por modelo tinha prazo; banco, Storage, login, SIGA e OCR não
 * tinham — todos ficavam pendurados no mesmo lugar.
 */
export async function buscar(
  url: string,
  opcoes: RequestInit,
  config: {
    servico: string
    dica?: string
    prazoMs?: number
    codigoRede?: string
    codigoTempo?: string
  },
): Promise<Response> {
  const padrao = Number(envOpcional('HTTP_TIMEOUT_MS') ?? 8_000)
  const prazoMs = config.prazoMs ?? (Number.isFinite(padrao) && padrao > 0 ? padrao : 8_000)
  const inicio = Date.now()

  try {
    const resposta = await fetch(url, { ...opcoes, signal: opcoes.signal ?? AbortSignal.timeout(prazoMs) })
    // O corpo é lido AQUI, dentro do prazo. Fora daqui, um servidor que manda o
    // cabeçalho 200 e trava no meio do corpo escapa do `timeout`: o fetch já
    // resolveu. Foi assim que a foto do aluno "não tinha texto legível" quando o
    // OCR estava só demorando — o texto vazio era o corpo abortado.
    const corpo = await resposta.arrayBuffer()
    const semCorpo = corpo.byteLength === 0 || resposta.status === 204 || resposta.status === 304
    return new Response(semCorpo ? null : corpo, {
      status: resposta.status,
      statusText: resposta.statusText,
      headers: resposta.headers,
    })
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : ''
    const abortou = nome === 'TimeoutError' || nome === 'AbortError'
    const segundos = Math.max(1, Math.round(prazoMs / 1000))
    const detalhe = `${Date.now() - inicio} ms · ${erro instanceof Error ? erro.message : String(erro)}`

    if (abortou) {
      throw new ErroHttp(
        504,
        config.codigoTempo ?? 'TEMPO_ESGOTADO',
        `O ${config.servico} não respondeu em ${segundos} s e a operação foi interrompida. ` +
          (config.dica ?? 'Tente de novo em instantes.'),
        detalhe,
      )
    }
    throw new ErroHttp(
      502,
      config.codigoRede ?? 'INALCANCAVEL',
      `Não consegui falar com ${config.servico}. ` + (config.dica ?? 'Confira a conexão e o endereço configurado.'),
      detalhe,
    )
  }
}

export function envOpcional(nome: string): string | undefined {
  const valor = process.env[nome]
  return valor && valor.trim() !== '' ? valor.trim() : undefined
}

const urlSupabase = () => env('SUPABASE_URL', envOpcional('VITE_SUPABASE_URL'))
const chaveServico = () => env('SUPABASE_SERVICE_ROLE_KEY')
const chaveAnon = () => env('SUPABASE_ANON_KEY', envOpcional('VITE_SUPABASE_ANON_KEY'))

// ---------------------------------------------------------------------------
// REST do Supabase com a chave de serviço (só no servidor)
// ---------------------------------------------------------------------------

export interface OpcoesSupabase {
  metodo?: string
  corpo?: unknown
  prefer?: string
  cabecalhos?: Record<string, string>
}

export async function supabase<T = unknown>(caminho: string, opcoes: OpcoesSupabase = {}): Promise<T> {
  const url = `${urlSupabase()}/rest/v1/${caminho}`
  const resposta = await buscar(
    url,
    {
      method: opcoes.metodo ?? 'GET',
      headers: {
        apikey: chaveServico(),
        Authorization: `Bearer ${chaveServico()}`,
        'Content-Type': 'application/json',
        ...(opcoes.prefer ? { Prefer: opcoes.prefer } : {}),
        ...opcoes.cabecalhos,
      },
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
    },
    {
      servico: 'banco (Supabase)',
      dica: 'Confira SUPABASE_URL e se o projeto está de pé (status.supabase.com).',
      codigoRede: 'SUPABASE_INALCANCAVEL',
      codigoTempo: 'SUPABASE_DEMOROU',
    },
  )

  const texto = await resposta.text()
  let dados: unknown = null
  if (texto) {
    try {
      dados = JSON.parse(texto)
    } catch {
      dados = texto
    }
  }

  if (!resposta.ok) {
    let mensagem = `Supabase respondeu ${resposta.status}`
    if (dados && typeof dados === 'object' && 'message' in dados) {
      mensagem = String((dados as { message: unknown }).message)
    }
    throw new ErroHttp(502, 'SUPABASE_FALHOU', mensagem, dados)
  }
  return dados as T
}

export async function selecionar<T>(tabela: string, filtros: string): Promise<T[]> {
  return supabase<T[]>(`${tabela}?${filtros}`)
}

export async function selecionarUm<T>(tabela: string, filtros: string): Promise<T | null> {
  const lista = await selecionar<T>(tabela, filtros)
  return lista[0] ?? null
}

export async function inserir<T>(tabela: string, valores: unknown, select = '*'): Promise<T> {
  const lista = await supabase<T[]>(`${tabela}?select=${select}`, {
    metodo: 'POST',
    corpo: valores,
    prefer: 'return=representation',
  })
  return (Array.isArray(lista) ? lista[0] : lista) as T
}

export async function atualizar<T>(tabela: string, filtros: string, valores: unknown, select = '*'): Promise<T> {
  const lista = await supabase<T[]>(`${tabela}?${filtros}&select=${select}`, {
    metodo: 'PATCH',
    corpo: valores,
    prefer: 'return=representation',
  })
  return (Array.isArray(lista) ? lista[0] : lista) as T
}

/**
 * Chama uma função do banco em nome do usuário logado.
 *
 * Algumas funções SQL decidem o que fazer com base em `auth.uid()` (é o caso de
 * `apagar_turma`, que só o professor pode rodar). Com a chave de serviço o
 * `auth.uid()` fica nulo e a função recusaria; por isso repassamos o token do
 * próprio usuário.
 */
export async function rpcComoUsuario<T>(req: Requisicao, funcao: string, corpo: unknown): Promise<T> {
  const cabecalho = req.cabecalhos.authorization ?? req.cabecalhos.Authorization ?? ''
  const token = cabecalho.toLowerCase().startsWith('bearer ') ? cabecalho.slice(7).trim() : ''
  if (!token) throw new ErroHttp(401, 'SEM_TOKEN', 'Faça login para continuar.')

  const resposta = await buscar(
    `${urlSupabase()}/rest/v1/rpc/${funcao}`,
    {
      method: 'POST',
      headers: { apikey: chaveAnon(), Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    },
    {
      servico: 'banco (Supabase)',
      dica: 'Se o erro persistir, confira o status do projeto no Supabase.',
      codigoRede: 'SUPABASE_INALCANCAVEL',
      codigoTempo: 'SUPABASE_DEMOROU',
    },
  )
  const texto = await resposta.text()
  let dados: unknown = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }
  if (!resposta.ok) {
    const mensagem =
      dados && typeof dados === 'object' && 'message' in dados
        ? String((dados as { message: unknown }).message)
        : `O banco recusou a operação (${resposta.status}).`
    throw new ErroHttp(502, 'RPC_FALHOU', mensagem, dados)
  }
  return dados as T
}

/** Apaga objetos do Storage (sem erro se algum já não existir). */
export async function apagarObjetos(bucket: string, caminhos: string[]): Promise<number> {
  if (caminhos.length === 0) return 0
  const resposta = await buscar(
    `${urlSupabase()}/storage/v1/object/${bucket}`,
    {
      method: 'DELETE',
      headers: {
        apikey: chaveServico(),
        Authorization: `Bearer ${chaveServico()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: caminhos }),
    },
    {
      servico: 'Storage do Supabase',
      dica: 'As fotos continuam lá; apague de novo em instantes.',
      codigoRede: 'STORAGE_INALCANCAVEL',
      codigoTempo: 'STORAGE_DEMOROU',
    },
  )
  if (!resposta.ok) {
    throw new ErroHttp(502, 'STORAGE_FALHOU', `O Storage recusou apagar ${caminhos.length} arquivo(s).`)
  }
  return caminhos.length
}

/** Baixa um objeto do Storage com a chave de serviço. */
export async function baixarObjeto(bucket: string, caminho: string): Promise<{ bytes: ArrayBuffer; tipo: string }> {
  const url = `${urlSupabase()}/storage/v1/object/${bucket}/${encodeURI(caminho)}`
  const resposta = await buscar(
    url,
    { headers: { apikey: chaveServico(), Authorization: `Bearer ${chaveServico()}` } },
    {
      servico: 'Storage do Supabase',
      dica: 'Se a foto demorar assim de novo, tente a correção pela transcrição.',
      prazoMs: Number(envOpcional('STORAGE_TIMEOUT_MS') ?? 15_000),
      codigoRede: 'STORAGE_INALCANCAVEL',
      codigoTempo: 'STORAGE_DEMOROU',
    },
  )
  if (!resposta.ok) {
    throw new ErroHttp(404, 'FOTO_NAO_ENCONTRADA', `Não encontrei a foto em ${bucket}/${caminho}.`)
  }
  return {
    bytes: await resposta.arrayBuffer(),
    tipo: resposta.headers.get('content-type') ?? 'image/jpeg',
  }
}

// ---------------------------------------------------------------------------
// Autenticação
// ---------------------------------------------------------------------------

export interface Usuario {
  id: string
  email: string
}

export interface PerfilServidor {
  id: string
  papel: 'aluno' | 'professor'
  nome_completo: string
  matricula: string | null
  turma_id: string | null
}

export async function exigirUsuario(req: Requisicao): Promise<Usuario> {
  const cabecalho = req.cabecalhos.authorization ?? req.cabecalhos.Authorization ?? ''
  const token = cabecalho.toLowerCase().startsWith('bearer ') ? cabecalho.slice(7).trim() : ''
  if (!token) throw new ErroHttp(401, 'SEM_TOKEN', 'Faça login para continuar.')

  const resposta = await buscar(
    `${urlSupabase()}/auth/v1/user`,
    { headers: { apikey: chaveAnon(), Authorization: `Bearer ${token}` } },
    {
      servico: 'login (Supabase Auth)',
      dica: 'Tente de novo em instantes; se persistir, saia e entre novamente.',
      codigoRede: 'AUTH_INALCANCAVEL',
      codigoTempo: 'AUTH_DEMOROU',
    },
  )
  if (!resposta.ok) throw new ErroHttp(401, 'SESSAO_INVALIDA', 'Sessão expirada. Entre novamente.')

  const dados = (await resposta.json()) as { id?: string; email?: string }
  if (!dados.id) throw new ErroHttp(401, 'SESSAO_INVALIDA', 'Sessão inválida.')
  return { id: dados.id, email: dados.email ?? '' }
}

export async function exigirPerfil(req: Requisicao): Promise<{ usuario: Usuario; perfil: PerfilServidor }> {
  const usuario = await exigirUsuario(req)
  const perfil = await selecionarUm<PerfilServidor>(
    'profiles',
    `id=eq.${usuario.id}&select=id,papel,nome_completo,matricula,turma_id`,
  )
  if (!perfil) throw new ErroHttp(403, 'SEM_PERFIL', 'Seu cadastro não foi concluído.')
  return { usuario, perfil }
}

export async function exigirProfessor(req: Requisicao): Promise<{ usuario: Usuario; perfil: PerfilServidor }> {
  const dados = await exigirPerfil(req)
  if (dados.perfil.papel !== 'professor') {
    throw new ErroHttp(403, 'SOMENTE_PROFESSOR', 'Esta ação é exclusiva do professor.')
  }
  return dados
}

// ---------------------------------------------------------------------------
// Adaptador node:http
// ---------------------------------------------------------------------------

async function lerCorpo(req: IncomingMessage): Promise<unknown> {
  const comCorpo = req as IncomingMessage & { body?: unknown }
  if (comCorpo.body !== undefined && comCorpo.body !== null && typeof comCorpo.body !== 'string') {
    return comCorpo.body
  }
  const pedacos: Buffer[] = []
  for await (const pedaco of req) pedacos.push(Buffer.isBuffer(pedaco) ? pedaco : Buffer.from(pedaco))
  if (!pedacos.length) {
    return typeof comCorpo.body === 'string' && comCorpo.body ? tentarJson(comCorpo.body) : null
  }
  return tentarJson(Buffer.concat(pedacos).toString('utf8'))
}

function tentarJson(texto: string): unknown {
  if (!texto.trim()) return null
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

function converterCabecalhos(req: IncomingMessage): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const [nome, valor] of Object.entries(req.headers)) {
    if (typeof valor === 'string') saida[nome.toLowerCase()] = valor
    else if (Array.isArray(valor)) saida[nome.toLowerCase()] = valor.join(',')
  }
  return saida
}

export async function converterRequisicao(req: IncomingMessage): Promise<Requisicao> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const metodo = (req.method ?? 'GET').toUpperCase()
  return {
    metodo,
    caminho: url.pathname,
    query: Object.fromEntries(url.searchParams),
    cabecalhos: converterCabecalhos(req),
    corpo: metodo === 'GET' || metodo === 'HEAD' ? null : await lerCorpo(req),
  }
}

export function enviarResposta(res: ServerResponse, resposta: Resposta): void {
  res.statusCode = resposta.status
  const cabecalhos: Record<string, string> = {
    'cache-control': 'no-store',
    ...resposta.cabecalhos,
  }
  if (resposta.corpo === null || resposta.status === 204) {
    res.setHeader('cache-control', cabecalhos['cache-control'])
    res.end()
    return
  }
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', cabecalhos['cache-control'])
  for (const [nome, valor] of Object.entries(cabecalhos)) {
    if (nome !== 'cache-control') res.setHeader(nome, valor)
  }
  res.end(JSON.stringify(resposta.corpo))
}

/** Envelopa um manipulador na assinatura aceita pela Vercel e pelo servidor local. */
export function criarRota(manipulador: Manipulador) {
  return async function handler(reqNode: IncomingMessage, resNode: ServerResponse): Promise<void> {
    try {
      const req = await converterRequisicao(reqNode)
      const resposta = await manipulador(req)
      enviarResposta(resNode, resposta)
    } catch (erro) {
      if (erro instanceof ErroHttp) {
        enviarResposta(resNode, {
          status: erro.status,
          corpo: { erro: erro.message, codigo: erro.codigo, detalhe: erro.detalhe ?? null },
        })
        return
      }
      console.error('[api] erro inesperado', erro)
      enviarResposta(resNode, {
        status: 500,
        corpo: { erro: 'Erro interno ao processar a solicitação.', codigo: 'ERRO_INTERNO' },
      })
    }
  }
}

/** Lê um campo do corpo com validação de presença. */
export function campoTexto(corpo: unknown, nome: string): string {
  if (!corpo || typeof corpo !== 'object') throw new ErroHttp(400, 'CORPO_INVALIDO', 'Envie um JSON no corpo.')
  const valor = (corpo as Record<string, unknown>)[nome]
  if (typeof valor !== 'string' || !valor.trim()) {
    throw new ErroHttp(400, 'CAMPO_OBRIGATORIO', `O campo "${nome}" é obrigatório.`)
  }
  return valor.trim()
}
