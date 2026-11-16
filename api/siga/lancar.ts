import {
  ErroHttp,
  campoTexto,
  criarRota,
  exigirProfessor,
  inserir,
  ok,
  selecionarUm,
  type Requisicao,
  type Resposta,
} from '../_lib/http'
import { lancarNotas } from '../_lib/siga'

interface CorrecaoServidor {
  id: string
  submissao_id: string
  decisao: 'pendente' | 'aprovada' | 'ajustada' | 'rejeitada'
  nota_final: number
}

interface SubmissaoServidor {
  id: string
  aluno_id: string
  avaliacao_id: string
  status: string
}

interface PerfilServidor {
  id: string
  matricula: string | null
  nome_completo: string
}

interface AvaliacaoServidor {
  id: string
  turma_id: string
  descricao_siga: string | null
  titulo: string
}

interface TurmaServidor {
  id: string
  codigo_siga: string
  periodo: string
}

interface LancamentoServidor {
  id: string
  correcao_id: string | null
  submissao_id: string | null
  matricula: string
  turma_siga: string
  periodo: string | null
  descricao_avaliacao: string
  nota: number
  sucesso: boolean
  http_status: number | null
  erro: string | null
  criado_em: string
}

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use POST.')
  await exigirProfessor(req)
  const correcaoId = campoTexto(req.corpo, 'correcao_id')

  const correcao = await selecionarUm<CorrecaoServidor>(
    'correcoes',
    `id=eq.${encodeURIComponent(correcaoId)}&select=id,submissao_id,decisao,nota_final`,
  )
  if (!correcao) throw new ErroHttp(404, 'NAO_ENCONTRADA', 'Correção não encontrada.')
  if (correcao.decisao !== 'aprovada' && correcao.decisao !== 'ajustada') {
    throw new ErroHttp(409, 'NAO_APROVADA', 'Só é possível lançar notas aprovadas pelo professor.')
  }

  const submissao = await selecionarUm<SubmissaoServidor>(
    'submissoes',
    `id=eq.${encodeURIComponent(correcao.submissao_id)}&select=id,aluno_id,avaliacao_id,status`,
  )
  if (!submissao) throw new ErroHttp(404, 'SUBMISSAO', 'Submissão não encontrada.')

  const aluno = await selecionarUm<PerfilServidor>(
    'profiles',
    `id=eq.${encodeURIComponent(submissao.aluno_id)}&select=id,matricula,nome_completo`,
  )
  if (!aluno?.matricula) {
    throw new ErroHttp(422, 'SEM_MATRICULA', 'O aluno não tem matrícula cadastrada — o SIGA precisa dela.')
  }

  const avaliacao = await selecionarUm<AvaliacaoServidor>(
    'avaliacoes',
    `id=eq.${encodeURIComponent(submissao.avaliacao_id)}&select=id,turma_id,descricao_siga,titulo`,
  )
  if (!avaliacao) throw new ErroHttp(404, 'AVALIACAO', 'Avaliação não encontrada.')
  if (!avaliacao.descricao_siga) {
    throw new ErroHttp(422, 'SEM_DESCRICAO_SIGA', 'Defina a descrição da avaliação no SIGA antes de lançar.')
  }

  const turma = await selecionarUm<TurmaServidor>(
    'turmas',
    `id=eq.${encodeURIComponent(avaliacao.turma_id)}&select=id,codigo_siga,periodo`,
  )
  if (!turma) throw new ErroHttp(404, 'TURMA', 'Turma não encontrada.')

  const nota = Number(correcao.nota_final)
  const base = {
    correcao_id: correcao.id,
    submissao_id: submissao.id,
    matricula: aluno.matricula,
    turma_siga: turma.codigo_siga,
    periodo: turma.periodo,
    descricao_avaliacao: avaliacao.descricao_siga,
    nota,
  }

  try {
    const resultado = await lancarNotas({
      turma: turma.codigo_siga,
      descricao_avaliacao: avaliacao.descricao_siga,
      notas: { [aluno.matricula]: nota },
      periodo: turma.periodo,
    })

    const lancamento = await inserir<LancamentoServidor>('lancamentos_siga', {
      ...base,
      sucesso: true,
      http_status: resultado.status,
      payload: { turma: turma.codigo_siga, descricao_avaliacao: avaliacao.descricao_siga, notas_json: { [aluno.matricula]: nota }, periodo: turma.periodo },
      resposta: resultado.corpo,
      erro: null,
    })

    return ok({ lancamento })
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha ao lançar no SIGA.'

    await inserir<LancamentoServidor>('lancamentos_siga', {
      ...base,
      sucesso: false,
      http_status: null,
      payload: { turma: turma.codigo_siga, descricao_avaliacao: avaliacao.descricao_siga, notas_json: { [aluno.matricula]: nota }, periodo: turma.periodo },
      resposta: erro instanceof ErroHttp ? (erro.detalhe ?? null) : null,
      erro: mensagem,
    }).catch(() => {
      /* se nem a auditoria gravar, ainda assim informamos o erro ao professor */
    })

    throw erro
  }
}

export default criarRota(manipulador)
