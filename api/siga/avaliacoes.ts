/**
 * Lista as avaliações (TVCs) que já existem no SIGA para uma turma/período.
 *
 * Serve para o professor escolher a descrição certa ao criar a avaliação — um erro de
 * digitação aqui faria a nota cair na avaliação errada (ou em nenhuma).
 * Devolve só o quadro de avaliações; nomes e notas dos alunos nunca saem daqui.
 */
import { ErroHttp, criarRota, exigirProfessor, ok, type Requisicao, type Resposta } from '../_lib/http.js'
import { consultarNotas, sigaConfigurado } from '../_lib/siga.js'

interface QuadroSiga {
  consulta?: { turma?: string; periodo?: string; id_turma?: string; id_periodo?: string; gerado_em?: string }
  avaliacoes?: { id?: string; descricao?: string; peso?: number; data?: string }[]
  resumo?: Record<string, unknown> | null
}

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'GET' && req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use GET.')
  await exigirProfessor(req)

  if (!sigaConfigurado()) {
    throw new ErroHttp(503, 'SIGA_NAO_CONFIGURADO', 'A integração com o SIGA não está configurada no servidor.')
  }

  const corpo = (req.corpo ?? {}) as Record<string, unknown>
  const turma = String(req.query.turma ?? corpo.turma ?? '').trim()
  const periodo = String(req.query.periodo ?? corpo.periodo ?? '').trim()

  if (!turma) throw new ErroHttp(400, 'TURMA', 'Informe o código da turma no SIGA (ex.: CBV018GV-A).')
  if (!periodo) throw new ErroHttp(400, 'PERIODO', 'Informe o período letivo (ex.: 2026/3).')

  const resultado = await consultarNotas(turma, periodo)
  const quadro = (resultado.corpo ?? {}) as QuadroSiga

  return ok({
    consulta: {
      turma: quadro.consulta?.turma ?? turma,
      periodo: quadro.consulta?.periodo ?? periodo,
      id_turma: quadro.consulta?.id_turma ?? null,
      id_periodo: quadro.consulta?.id_periodo ?? null,
      gerado_em: quadro.consulta?.gerado_em ?? null,
    },
    avaliacoes: (quadro.avaliacoes ?? []).map((a) => ({
      id: a.id ?? null,
      descricao: a.descricao ?? '',
      peso: Number(a.peso ?? 0),
      data: a.data ?? null,
    })),
    resumo: quadro.resumo ?? null,
  })
}

export default criarRota(manipulador)
