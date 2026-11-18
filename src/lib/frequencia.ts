import type { Frequencia, MinhaFrequencia } from './types'

/**
 * Regra do semestre informada pelo professor: 5 faltas equivalem a 15 horas
 * (cada aula vale 3 h). Fica em um lugar só para a tela do aluno, a do
 * professor e os testes usarem o mesmo número.
 */
export const LIMITE_FALTAS = 5
export const HORAS_POR_FALTA = 3
export const HORAS_LIMITE = LIMITE_FALTAS * HORAS_POR_FALTA

export function rotuloFaltas(n: number): string {
  return `${n} ${n === 1 ? 'falta' : 'faltas'}`
}

/** Soma as faltas de cada matrícula; presenças não entram no mapa. */
export function faltasPorMatricula(
  registros: Pick<Frequencia, 'matricula' | 'presente'>[],
): Record<string, number> {
  const mapa: Record<string, number> = {}
  for (const registro of registros) {
    if (!registro.presente) mapa[registro.matricula] = (mapa[registro.matricula] ?? 0) + 1
  }
  return mapa
}

/** Contagem usada no cartão do aluno; cada data de aula conta uma vez. */
export function resumirFrequencia(
  registros: Pick<Frequencia, 'presente' | 'data_aula'>[],
): Pick<MinhaFrequencia, 'faltas' | 'presencas' | 'aulas'> {
  const datas = new Set<string>()
  let faltas = 0
  let presencas = 0
  for (const registro of registros) {
    datas.add(registro.data_aula)
    if (registro.presente) presencas += 1
    else faltas += 1
  }
  return { faltas, presencas, aulas: datas.size }
}

export function faltasEmHoras(faltas: number): number {
  return faltas * HORAS_POR_FALTA
}

export type SituacaoFaltas = 'sem-faltas' | 'dentro' | 'atencao' | 'limite'

export function situacaoFaltas(faltas: number, limite = LIMITE_FALTAS): SituacaoFaltas {
  if (faltas <= 0) return 'sem-faltas'
  if (faltas >= limite) return 'limite'
  if (faltas >= limite - 2) return 'atencao'
  return 'dentro'
}
