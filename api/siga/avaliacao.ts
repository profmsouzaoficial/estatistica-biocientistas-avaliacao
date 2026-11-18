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
import {
  ErroSiga,
  consultarNotas,
  criarAvaliacao,
  dataBr,
  proximoNumeroTvc,
} from '../_lib/siga.js'

/**
 * Cria a avaliação no SIGA — uma vez só.
 *
 * Esta é a única chamada do app que cria estrutura no SIGA (as demais só lançam
 * nota). Não há rota de exclusão: se o clique duplo criar duas "Trabalho sobre
 * Probabilidades", o professor fica com uma avaliação fantasma lá dentro. Por
 * isso a rota é idempotente e tudo o que sai daqui fica na auditoria:
 *
 *   - `num_tvc` = quantidade de avaliações da turma no SIGA + 1, lida na hora;
 *   - pedido idêntico ao último bem-sucedido → não chama o SIGA (repetido);
 *   - descrição já existente na turma → 409, para não duplicar;
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

type ConteudoPedido = Omit<Pedido, 'num_tvc'>

interface QuadroSiga {
  avaliacoes?: unknown[]
}

const ACAO = 'siga.criar-avaliacao'
/** Depois disso, um registro "em andamento" é considerado abandonado. */
const EM_ANDAMENTO_MS = 120_000

function lerForcar(corpo: unknown): boolean {
  if (!corpo || typeof corpo !== 'object') return false
  return (corpo as { forcar?: unknown }).forcar === true
}

/**
 * Compara o conteúdo que o professor controla.
 *
 * `num_tvc` fica de fora de propósito: ele é calculado no momento da criação e
 * muda quando outra avaliação é cadastrada no SIGA. Um clique duplo depois de
 * um sucesso continua sendo o mesmo pedido, mesmo que a lista já tenha
 * crescido; o número efetivamente usado está guardado na auditoria.
 */
function mesmoPedido(a: unknown, b: ConteudoPedido): boolean {
  if (!a || typeof a !== 'object') return false
  const p = a as Partial<Pedido>
  return (
    p.turma === b.turma &&
    Number(p.peso) === b.peso &&
    p.data === b.data &&
    p.descricao === b.descricao &&
    (p.periodo ?? null) === b.periodo
  )
}

function normalizarDescricao(texto: string): string {
  return texto.trim().toLowerCase()
}

function descricaoJaExiste(avaliacoes: unknown[], descricao: string): boolean {
  const alvo = normalizarDescricao(descricao)
  return avaliacoes.some((a) => {
    if (!a || typeof a !== 'object') return false
    const d = (a as { descricao?: unknown }).descricao
    return typeof d === 'string' && normalizarDescricao(d) === alvo
  })
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

  const descricao = (avaliacao.descricao_siga?.trim() || avaliacao.titulo.trim())
  if (!descricao) {
    throw new ErroHttp(422, 'DESCRICAO', 'Informe a descrição da avaliação no SIGA.')
  }

  const conteudo: ConteudoPedido = {
    turma: turma.codigo_siga,
    peso: Number(avaliacao.peso_siga) || 10,
    data: dataBr(avaliacao.data_siga),
    descricao,
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
    if (mesmoPedido(detalhe.pedido, conteudo)) {
      return ok({
        repetido: true,
        criada_em: anterior?.criado_em ?? null,
        siga: detalhe.resposta ?? null,
        request: detalhe.pedido ?? null,
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
      { criada_em: anterior?.criado_em ?? null, pedido_anterior: detalhe.pedido ?? null },
    )
  }

  // Reserva antes de consultar o SIGA: se outra requisição chegar agora, ela vê
  // "andamento" e não cria a segunda. O pedido definitivo (com num_tvc) é
  // gravado no mesmo registro depois da leitura do quadro.
  const registro = await inserir<AuditoriaServidor>('auditoria', {
    ator: usuario.id,
    acao: ACAO,
    entidade: 'avaliacoes',
    entidade_id: avaliacaoId,
    detalhe: { estado: 'andamento', pedido: null, forcar },
  })

  let pedido: Pedido | null = null
  try {
    const quadro = await consultarNotas(turma.codigo_siga, turma.periodo)
    const corpoQuadro = quadro.corpo as QuadroSiga | null
    if (!corpoQuadro || !Array.isArray(corpoQuadro.avaliacoes)) {
      throw new ErroHttp(
        502,
        'SIGA_RESPOSTA_INVALIDA',
        'O SIGA respondeu sem a lista de avaliações da turma. Não criei nada, para não usar um número de TVC errado. Tente de novo em instantes.',
        { turma: turma.codigo_siga, periodo: turma.periodo },
      )
    }
    const avaliacoes = corpoQuadro.avaliacoes

    if (!forcar && descricaoJaExiste(avaliacoes, conteudo.descricao)) {
      throw new ErroHttp(
        409,
        'SIGA_JA_EXISTE',
        `Já existe uma avaliação “${conteudo.descricao}” no SIGA da turma ${turma.codigo_siga}. ` +
          `Não criei outra: use “Buscar” para selecioná-la ou escolha outra descrição.`,
        { descricao: conteudo.descricao, turma: turma.codigo_siga },
      )
    }

    pedido = { ...conteudo, num_tvc: proximoNumeroTvc(avaliacoes) }
    await atualizar('auditoria', `id=eq.${registro.id}`, {
      detalhe: { estado: 'andamento', pedido: { ...pedido }, forcar },
    })

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
        pedido: pedido ? { ...pedido } : null,
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
