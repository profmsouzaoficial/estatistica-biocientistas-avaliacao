/**
 * Cria uma correção vazia (notas zeradas) para o professor preencher à mão.
 *
 * Existe porque a correção automática depende do Llama configurado. Sem ele, o
 * professor ainda precisa conseguir dar a nota — e é isso que este caminho libera:
 * a revisão abre com todos os critérios em 0 e ele ajusta um por um antes de aprovar.
 */
import {
  atualizar,
  campoTexto,
  criado,
  criarRota,
  ErroHttp,
  exigirProfessor,
  inserir,
  selecionarUm,
  supabase,
  type Requisicao,
  type Resposta,
} from './_lib/http.js'
import { carregarAvaliacao, carregarSubmissao, type CorrecaoServidor } from './_lib/corrigirServico.js'

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use POST.')
  const { usuario, perfil } = await exigirProfessor(req)

  const submissaoId = campoTexto(req.corpo ?? {}, 'submissao_id')
  const submissao = await carregarSubmissao(submissaoId)
  const avaliacao = await carregarAvaliacao(submissao.avaliacao_id)

  const existente = await selecionarUm<{ id: string; modelo: string | null }>(
    'correcoes',
    `submissao_id=eq.${encodeURIComponent(submissaoId)}&select=id,modelo`,
  )
  if (existente) {
    throw new ErroHttp(409, 'JA_CORRIGIDA', 'Esta redação já tem correção. Abra a revisão para ajustar as notas.')
  }

  const criterios = avaliacao.rubrica.map((c) => ({
    id: c.id,
    nome: c.nome,
    valor: 0,
    justificativa: 'Nota atribuída manualmente pelo professor.',
  }))

  const correcao = await inserir<CorrecaoServidor>('correcoes', {
    submissao_id: submissaoId,
    modelo: 'manual',
    prompt_versao: null,
    criterios,
    nota_bruta: 0,
    nota_final: 0,
    pontos_fortes: [],
    pontos_desenvolver: [],
    comentario_ia: null,
    comentario_professor: null,
    confianca: null,
    decisao: 'pendente',
    revisado_por: null,
    revisado_em: null,
  })
  if (!correcao) throw new ErroHttp(502, 'SUPABASE_FALHOU', 'A correção manual não foi gravada.')

  await atualizar('submissoes', `id=eq.${encodeURIComponent(submissaoId)}`, { status: 'corrigida' })

  await supabase('auditoria', {
    metodo: 'POST',
    corpo: {
      ator: usuario.id,
      acao: 'correcao_manual',
      entidade: 'submissoes',
      entidade_id: submissaoId,
      detalhe: { avaliacao_id: avaliacao.id, professor: perfil.nome_completo },
    },
    prefer: 'return=minimal',
  }).catch((e) => {
    console.error('auditoria não gravada (correcao_manual):', e instanceof Error ? e.message : e)
  })

  return criado({ correcao })
}

export default criarRota(manipulador)
