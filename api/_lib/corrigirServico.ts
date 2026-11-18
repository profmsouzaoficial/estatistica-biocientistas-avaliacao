/**
 * Serviço de correção — usado pela rota /api/corrigir e pelo script de lote.
 * Manter a regra num só lugar evita divergência entre a correção avulsa e o lote.
 */
import { ErroHttp, atualizar, selecionarUm, supabase } from './http.js'
import { corrigirRedacao, type CriterioRubrica } from './rubrica.js'

export interface SubmissaoServidor {
  id: string
  avaliacao_id: string
  aluno_id: string
  transcrito: string | null
}

export interface AvaliacaoServidor {
  id: string
  turma_id: string
  titulo: string
  tema: string
  instrucoes: string
  instrucoes_correcao: string | null
  valor_total: number
  rubrica: CriterioRubrica[]
}

export interface CorrecaoServidor {
  id: string
  submissao_id: string
  criterios: { id: string; nome: string; valor: number; justificativa: string }[]
  nota_bruta: number
  nota_final: number
  pontos_fortes: string[]
  pontos_desenvolver: string[]
  comentario_ia: string | null
  modelo: string | null
  confianca: number | null
  decisao: 'pendente' | 'aprovada' | 'ajustada' | 'rejeitada'
  revisado_em: string | null
  criado_em: string
}

export async function carregarSubmissao(submissaoId: string): Promise<SubmissaoServidor> {
  const submissao = await selecionarUm<SubmissaoServidor>(
    'submissoes',
    `id=eq.${encodeURIComponent(submissaoId)}&select=id,avaliacao_id,aluno_id,transcrito`,
  )
  if (!submissao) throw new ErroHttp(404, 'NAO_ENCONTRADA', 'Submissão não encontrada.')
  return submissao
}

export async function carregarAvaliacao(avaliacaoId: string): Promise<AvaliacaoServidor> {
  const avaliacao = await selecionarUm<AvaliacaoServidor>(
    'avaliacoes',
    `id=eq.${encodeURIComponent(avaliacaoId)}&select=id,turma_id,titulo,tema,instrucoes,instrucoes_correcao,valor_total,rubrica`,
  )
  if (!avaliacao) throw new ErroHttp(404, 'AVALIACAO', 'Avaliação não encontrada.')
  if (!Array.isArray(avaliacao.rubrica) || avaliacao.rubrica.length === 0) {
    throw new ErroHttp(422, 'RUBRICA_VAZIA', 'A avaliação está sem rubrica.')
  }
  return avaliacao
}

export interface ResultadoCorrecao {
  correcao: CorrecaoServidor
  avaliacao: AvaliacaoServidor
  submissao: SubmissaoServidor
}

export async function corrigirSubmissao(submissaoId: string): Promise<ResultadoCorrecao> {
  const submissao = await carregarSubmissao(submissaoId)
  if (!submissao.transcrito || submissao.transcrito.trim().length < 20) {
    throw new ErroHttp(409, 'SEM_TEXTO', 'A redação ainda não foi transcrita.')
  }
  const avaliacao = await carregarAvaliacao(submissao.avaliacao_id)

  const saida = await corrigirRedacao({
    titulo: avaliacao.titulo,
    tema: avaliacao.tema,
    instrucoes: avaliacao.instrucoes,
    instrucoes_correcao: avaliacao.instrucoes_correcao,
    valor_total: Number(avaliacao.valor_total),
    rubrica: avaliacao.rubrica.map((c) => ({ ...c, valor: Number(c.valor) })),
    texto: submissao.transcrito,
  })

  const registro = {
    submissao_id: submissaoId,
    modelo: saida.modelo,
    prompt_versao: saida.prompt_versao,
    criterios: saida.criterios,
    nota_bruta: saida.nota_bruta,
    nota_final: saida.nota_final,
    pontos_fortes: saida.pontos_fortes,
    pontos_desenvolver: saida.pontos_desenvolver,
    comentario_ia: saida.comentario,
    comentario_professor: null,
    confianca: saida.confianca,
    decisao: 'pendente',
    revisado_por: null,
    revisado_em: null,
  }

  const lista = await supabase<CorrecaoServidor[]>('correcoes?on_conflict=submissao_id&select=*', {
    metodo: 'POST',
    corpo: registro,
    prefer: 'resolution=merge-duplicates,return=representation',
  })
  const correcao = Array.isArray(lista) ? lista[0] : (lista as unknown as CorrecaoServidor)
  if (!correcao) throw new ErroHttp(502, 'SUPABASE_FALHOU', 'A correção não foi gravada.')

  await atualizar('submissoes', `id=eq.${encodeURIComponent(submissaoId)}`, { status: 'corrigida' })

  return { correcao, avaliacao, submissao }
}
