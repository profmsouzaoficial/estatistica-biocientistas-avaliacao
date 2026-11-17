import {
  ErroHttp,
  atualizar,
  campoTexto,
  criarRota,
  exigirProfessor,
  inserir,
  ok,
  selecionarUm,
  type Requisicao,
  type Resposta,
} from '../_lib/http.js'
import { ErroSiga, criarAvaliacao, dataBr, numeroTvc } from '../_lib/siga.js'

/**
 * Cria a avaliação no SIGA — uma vez só.
 *
 * Esta é a única chamada do app que cria estrutura no SIGA (as demais só lançam
 * nota). Não há rota de exclusão: se o clique duplo criar duas "Trabalho sobre
 * Probabilidades", o professor fica com uma avaliação fantasma lá dentro. Por
 * isso a rota é idempotente e tudo o que sai daqui fica na auditoria:
 *
 *   - pedido idêntico ao último bem-sucedido → não chama o SIGA (repetido);
 *   - pedido diferente → 409, porque criar de novo DUPLICA; quem decide é o
 *     professor, com `forcar: true`;
 *   - requisição em andamento (até 2 min) → 409, para o duplo clique não passar;
 *   - falha → fica gravada como falha e pode ser tentada de novo.
 */

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

interface AuditoriaServidor {
  id: number
  criado_em: string
  detalhe: Record<string, unknown> | null
}

interface Pedido {
  turma: string
  num_tvc: number
  peso: number
  data: string
  descricao: string
  periodo: string | null
}

const ACAO = 'siga.criar-avaliacao'
/** Depois disso, um registro "em andamento" é considerado abandonado. */
const EM_ANDAMENTO_MS = 120_000

function lerForcar(corpo: unknown): boolean {
  if (!corpo || typeof corpo !== 'object') return false
  return (corpo as { forcar?: unknown }).forcar === true
}

/** Compara só o que muda o que o SIGA recebe. */
function mesmoPedido(a: unknown, b: Pedido): boolean {
  if (!a || typeof a !== 'object') return false
  const p = a as Partial<Pedido>
  return (
    p.turma === b.turma &&
    Number(p.num_tvc) === b.num_tvc &&
    Number(p.peso) === b.peso &&
    p.data === b.data &&
    p.descricao === b.descricao &&
    (p.periodo ?? null) === b.periodo
  )
}

function descreverPedido(p: Pedido): string {
  return `“${p.descricao}” (TVC ${p.num_tvc}, peso ${p.peso}, ${p.data})`
}

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use POST.')
  const { usuario } = await exigirProfessor(req)
  const avaliacaoId = campoTexto(req.corpo, 'avaliacao_id')
  const forcar = lerForcar(req.corpo)

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

  const pedido: Pedido = {
    turma: turma.codigo_siga,
    num_tvc: numTvc,
    peso: Number(avaliacao.peso_siga) || 10,
    data: dataBr(avaliacao.data_siga),
    descricao: descricao || avaliacao.titulo,
    periodo: turma.periodo,
  }

  // O que já aconteceu para esta avaliação?
  const anterior = await selecionarUm<AuditoriaServidor>(
    'auditoria',
    `acao=eq.${ACAO}&entidade_id=eq.${encodeURIComponent(avaliacaoId)}` +
      `&select=id,criado_em,detalhe&order=criado_em.desc,id.desc&limit=1`,
  )
  const detalhe = (anterior?.detalhe ?? {}) as Record<string, unknown>
  const estado = typeof detalhe.estado === 'string' ? detalhe.estado : ''
  const idade = anterior ? Date.now() - new Date(anterior.criado_em).getTime() : Infinity

  if (estado === 'andamento' && idade < EM_ANDAMENTO_MS) {
    throw new ErroHttp(
      409,
      'SIGA_EM_ANDAMENTO',
      'Já estou criando esta avaliação no SIGA. Aguarde alguns segundos e recarregue a página antes de tentar de novo.',
    )
  }

  if (estado === 'ok' && !forcar) {
    if (mesmoPedido(detalhe.pedido, pedido)) {
      return ok({
        repetido: true,
        criada_em: anterior?.criado_em ?? null,
        siga: detalhe.resposta ?? null,
        request: pedido,
      })
    }
    const antes = detalhe.pedido as Partial<Pedido> | undefined
    const comoFoi =
      antes && antes.descricao
        ? `como ${descreverPedido(antes as Pedido)}, em ${new Date(anterior!.criado_em).toLocaleString('pt-BR')}`
        : `em ${new Date(anterior!.criado_em).toLocaleString('pt-BR')}`
    throw new ErroHttp(
      409,
      'SIGA_JA_CRIADA',
      `Esta avaliação já foi criada no SIGA ${comoFoi}. ` +
        `Criar de novo vai DUPLICAR a avaliação e o SIGA não tem rota para apagar. ` +
        `Se for mesmo isso, confirme em “Criar de novo”.`,
      { criada_em: anterior?.criado_em ?? null, pedido, pedido_anterior: detalhe.pedido ?? null },
    )
  }

  // Marca antes de chamar o SIGA: se outra requisição chegar agora, ela vê
  // "andamento" e não cria a segunda. O registro é atualizado no fim, com o
  // resultado — e é ele que a tela mostra.
  const registro = await inserir<AuditoriaServidor>('auditoria', {
    ator: usuario.id,
    acao: ACAO,
    entidade: 'avaliacoes',
    entidade_id: avaliacaoId,
    detalhe: { estado: 'andamento', pedido: { ...pedido }, forcar },
  })

  try {
    const resultado = await criarAvaliacao(pedido)
    await atualizar('auditoria', `id=eq.${registro.id}`, {
      detalhe: {
        estado: 'ok',
        pedido: { ...pedido },
        forcar,
        http_status: resultado.status,
        resposta: resultado.corpo,
      },
    })
    return ok({
      siga: resultado.corpo,
      request: pedido,
      criada_em: new Date().toISOString(),
      repetido: false,
    })
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : 'Falha ao criar a avaliação no SIGA.'
    await atualizar('auditoria', `id=eq.${registro.id}`, {
      detalhe: {
        estado: 'falha',
        pedido: { ...pedido },
        forcar,
        http_status: erro instanceof ErroSiga ? erro.statusSiga : null,
        resposta: erro instanceof ErroHttp ? (erro.detalhe ?? null) : null,
        erro: mensagem,
      },
    }).catch(() => {
      /* se nem a auditoria gravar, o erro original ainda chega ao professor */
    })
    throw erro
  }
}

export default criarRota(manipulador)
