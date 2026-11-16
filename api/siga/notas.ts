import { ErroHttp, criarRota, exigirProfessor, ok, type Requisicao, type Resposta } from '../_lib/http'
import { consultarNotas } from '../_lib/siga'

async function manipulador(req: Requisicao): Promise<Resposta> {
  if (req.metodo !== 'GET' && req.metodo !== 'POST') throw new ErroHttp(405, 'METODO', 'Use GET.')
  await exigirProfessor(req)

  const corpo = (req.corpo ?? {}) as Record<string, unknown>
  const turma = String(req.query.turma ?? corpo.turma ?? '').trim()
  const periodo = String(req.query.periodo ?? corpo.periodo ?? '').trim()
  if (!turma || !periodo) {
    throw new ErroHttp(400, 'PARAMETROS', 'Informe turma e periodo (ex.: CBV018GV-A e 2026/3).')
  }

  const resultado = await consultarNotas(turma, periodo)
  return ok({ turma, periodo, quadro: resultado.corpo })
}

export default criarRota(manipulador)
