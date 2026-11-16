/**
 * Comparação entre a avaliação daqui e a do SIGA.
 *
 * O SIGA não recebe fração: recebe a nota na escala da avaliação, definida pelo
 * peso dela lá. Se o peso marcado no app for outro, a nota chega multiplicada
 * ou dividida — um trabalho que vale 15/20 chegaria como 7,5 — e ninguém
 * percebe olhando a tela, porque os dois números são plausíveis.
 *
 * Estas funções são puras de propósito: a regra que decide "está divergente"
 * fica testável sem navegador.
 */
import type { AvaliacaoSiga } from './types'

function normalizar(texto: string | null | undefined): string {
  return (texto ?? '').trim().toLowerCase()
}

/** Acha a avaliação do SIGA com a mesma descrição (sem diferenciar caixa/espaços). */
export function acharAvaliacaoSiga(
  lista: AvaliacaoSiga[] | null | undefined,
  descricao: string | null | undefined,
): AvaliacaoSiga | null {
  const alvo = normalizar(descricao)
  if (!alvo) return null
  return (lista ?? []).find((a) => normalizar(a.descricao) === alvo) ?? null
}

export interface DivergenciaDePeso {
  pesoSiga: number
  pesoApp: number
}

/**
 * Devolve a divergência quando os dois pesos são números válidos e diferentes.
 *
 * Peso ausente ou zero não é divergência: significa "não sei o peso do SIGA", e
 * alarme falso em cima de dado faltante ensina o professor a ignorar o alarme.
 */
export function divergenciaDePeso(
  noSiga: Pick<AvaliacaoSiga, 'peso'> | null | undefined,
  pesoApp: number | null | undefined,
): DivergenciaDePeso | null {
  const pesoSiga = Number(noSiga?.peso)
  const pesoDoApp = Number(pesoApp)
  if (!Number.isFinite(pesoSiga) || pesoSiga <= 0) return null
  if (!Number.isFinite(pesoDoApp) || pesoDoApp <= 0) return null
  if (Math.abs(pesoSiga - pesoDoApp) < 0.001) return null
  return { pesoSiga, pesoApp: pesoDoApp }
}
