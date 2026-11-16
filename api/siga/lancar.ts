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
} from '../_lib/http.js'
import { escalaDaNota, lancarNotas } from '../_lib/siga.js'

interface CorrecaoServidor {
  id: string
  submissao_id: string
  decisao: string
  nota_final: number
  nota_bruta: number
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
  valor_total: number
  peso_siga: number
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
    `id=eq.${encodeURIComponent(correcaoId)}&select=id,submissao_id,decisao,nota_final,nota_bruta`,
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
    `id=eq.${encodeURIComponent(submissao.avaliacao_id)}&select=id,turma_id,descricao_siga,titulo,valor_total,peso_siga`,
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

  // A devolutiva do aluno é sempre 0 a 10; o número que vai ao SIGA depende da escala
  // configurada em SIGA_ESCALA (ver escalaDaNota em _lib/siga.ts).
  //
  // No SIGA as notas são em PONTOS, até o peso de cada avaliação (dados reais de
  // 2026/3: "Prova 1" tem peso 20 e há notas 16, 12, 17). Quando a rubrica vale
  // um total diferente do peso, convertemos proporcionalmente — senão uma rubrica
  // de 10 pontos lançada numa avaliação de peso 20 valeria metade.
  const escala = escalaDaNota()
  const bruta = Number(correcao.nota_bruta)
  const total = Number(avaliacao.valor_total) || 0
  const peso = Number(avaliacao.peso_siga) || total
  const nota =
    escala === 'pontos'
      ? Math.round((total > 0 ? (bruta / total) * peso : 0) * 100) / 100
      : Number(correcao.nota_final)
  const base = {
    correcao_id: correcao.id,
    submissao_id: submissao.id,
    matricula: aluno.matricula,
    turma_siga: turma.codigo_siga,
    periodo: turma.periodo,
    descricao_avaliacao: avaliacao.descricao_siga,
    nota,
    escala,
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
      payload: {
        turma: turma.codigo_siga,
        descricao_avaliacao: avaliacao.descricao_siga,
        notas_json: { [aluno.matricula]: nota },
        periodo: turma.periodo,
        calculo: { escala, nota_bruta: bruta, valor_total: total, peso_siga: peso },
      },
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
      payload: {
        turma: turma.codigo_siga,
        descricao_avaliacao: avaliacao.descricao_siga,
        notas_json: { [aluno.matricula]: nota },
        periodo: turma.periodo,
        calculo: { escala, nota_bruta: bruta, valor_total: total, peso_siga: peso },
      },
      resposta: erro instanceof ErroHttp ? (erro.detalhe ?? null) : null,
      erro: mensagem,
    }).catch(() => {
      /* se nem a auditoria gravar, ainda assim informamos o erro ao professor */
    })

    throw erro
  }
}

export default criarRota(manipulador)
