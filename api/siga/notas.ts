/**
 * Quadro de notas da turma no SIGA (leitura).
 *
 * Serve para o professor conferir, depois de lançar, se a nota realmente chegou ao
 * SIGA e com o mesmo valor — e para ver o que já está lá antes de lançar de novo.
 * É só leitura: nenhuma nota é criada ou alterada por esta rota.
 *
 * Devolve nomes e notas dos alunos porque a conferência é justamente essa. A rota
 * exige sessão de professor e usa a chave do SIGA guardada no servidor.
 */
import { ErroHttp, criarRota, exigirProfessor, ok, type Requisicao, type Resposta } from '../_lib/http.js'
import { consultarNotas, sigaConfigurado } from '../_lib/siga.js'

interface QuadroSiga {
  consulta?: { turma?: string; periodo?: string; id_turma?: string; id_periodo?: string; gerado_em?: string }
  avaliacoes?: { id?: string; descricao?: string; peso?: number; data?: string }[]
  alunos?: {
    matricula?: string
    nome?: string
    notas?: Record<string, number | null>
    nota_final?: number | null
    frequencia?: string | null
    situacao?: string | null
  }[]
  resumo?: Record<string, unknown> | null
  avisos?: string[]
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
    alunos: (quadro.alunos ?? []).map((a) => ({
      matricula: String(a.matricula ?? ''),
      nome: a.nome ?? '',
      notas: a.notas ?? {},
      nota_final: a.nota_final ?? null,
      frequencia: a.frequencia ?? null,
      situacao: a.situacao ?? null,
    })),
    resumo: quadro.resumo ?? null,
    avisos: Array.isArray(quadro.avisos) ? quadro.avisos.slice(0, 5).map(String) : [],
  })
}

export default criarRota(manipulador)
