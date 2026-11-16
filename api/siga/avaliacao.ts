import {
  ErroHttp,
  campoTexto,
  criarRota,
  exigirProfessor,
  ok,
  selecionarUm,
  type Requisicao,
  type Resposta,
} from '../_lib/http'
import { criarAvaliacao, dataBr, numeroTvc } from '../_lib/siga'

interface AvaliacaoServidor {
  id: string
  turma_id: string
  titulo: string
  descricao_siga: string | null
  peso_siga: number
  data_siga: string | null
}

interface TurmaServidor {
  id: string
  codigo_siga: string
  periodo: string
}

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use POST.')
  await exigirProfessor(req)
  const avaliacaoId = campoTexto(req.corpo, 'avaliacao_id')

  const avaliacao = await selecionarUm<AvaliacaoServidor>(
    'avaliacoes',
    `id=eq.${encodeURIComponent(avaliacaoId)}&select=id,turma_id,titulo,descricao_siga,peso_siga,data_siga`,
  )
  if (!avaliacao) throw new ErroHttp(404, 'NAO_ENCONTRADA', 'Avaliação não encontrada.')

  const turma = await selecionarUm<TurmaServidor>(
    'turmas',
    `id=eq.${encodeURIComponent(avaliacao.turma_id)}&select=id,codigo_siga,periodo`,
  )
  if (!turma) throw new ErroHttp(404, 'TURMA', 'Turma não encontrada.')

  const descricao = avaliacao.descricao_siga?.trim() || ''
  const numTvc = numeroTvc(descricao)
  if (!numTvc) {
    throw new ErroHttp(
      422,
      'SEM_NUMERO_TVC',
      'Não consegui identificar o número da TVC. Use uma descrição como "TVC 3" na avaliação.',
    )
  }

  const resultado = await criarAvaliacao({
    turma: turma.codigo_siga,
    num_tvc: numTvc,
    peso: Number(avaliacao.peso_siga) || 10,
    data: dataBr(avaliacao.data_siga),
    descricao: descricao || avaliacao.titulo,
    periodo: turma.periodo,
  })

  return ok({ siga: resultado.corpo, request: { turma: turma.codigo_siga, num_tvc: numTvc } })
}

export default criarRota(manipulador)
