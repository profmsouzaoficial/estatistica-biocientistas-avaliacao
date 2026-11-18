/**
 * Regras da data de referência e do recebimento de entregas.
 *
 * **A data não abre nem fecha o envio.** Ela é uma referência temporal: serve
 * para marcar como "fora do prazo" quem entregar depois dela. Quem decide se a
 * avaliação aceita entregas é o status escolhido pelo professor:
 *
 *   - `publicada` → recebendo trabalhos;
 *   - `encerrada` → não recebe mais;
 *   - `rascunho` → ainda não apareceu para o aluno.
 *
 * Duas coisas dão errado com data digitada à mão:
 *
 *   1. encurtar a data de uma avaliação que já recebeu entregas — quem entregou
 *      antes passa a aparecer como atrasado, retroativamente;
 *   2. datas passadas digitadas por engano ou de propósito (lançamento
 *      retroativo), que precisam ser aceitas sem criar uma avaliação impossível
 *      de abrir.
 *
 * As funções aqui são puras (recebem as datas e o "agora", não leem relógio nem
 * banco) para que o teste cubra os casos sem esperar o tempo passar.
 */
import type { StatusAvaliacao, Submissao } from './types'

export interface ResultadoValidacaoPrazo {
  ok: boolean
  mensagem?: string
}

/** Interpreta o valor de um `datetime-local` ou ISO. `null` quando inválido. */
export function lerData(valor: string | null | undefined): Date | null {
  if (!valor) return null
  const data = new Date(valor)
  return Number.isNaN(data.getTime()) ? null : data
}

/** O professor está recebendo entregas desta avaliação? Só o status decide. */
export function recebendoTrabalhos(status: StatusAvaliacao): boolean {
  return status === 'publicada'
}

/**
 * O aluno pode abrir o envio agora?
 *
 * A data de referência não entra nesta conta: uma avaliação publicada aceita
 * entrega mesmo com a data no passado. O status `encerrada` bloqueia inclusive
 * quem deixou um rascunho pela metade — reabrir é uma decisão do professor.
 */
export function podeEnviarRedacao(avaliacao: {
  status: StatusAvaliacao
  submissao?: Pick<Submissao, 'status'> | null
}): boolean {
  if (!recebendoTrabalhos(avaliacao.status)) return false
  const situacao = avaliacao.submissao?.status
  return !situacao || situacao === 'rascunho' || situacao === 'devolvida'
}

/**
 * Valida a data de referência no momento de **criar** a avaliação.
 *
 * Data vazia é permitida (nenhuma entrega será marcada como atrasada). Datas no
 * passado também são aceitas de propósito: servem para lançamentos retroativos.
 * A abertura é recuada para antes da data em `aberturaDaAvaliacao`, então o
 * banco (trigger `trg_avaliacao_prazo`, só no INSERT) continua satisfeito.
 * A data só precisa ser interpretável.
 */
export function validarPrazoCriacao(
  prazo: string | null | undefined,
  _agora: Date = new Date(),
): ResultadoValidacaoPrazo {
  if (!prazo) return { ok: true }
  const data = lerData(prazo)
  if (!data) return { ok: false, mensagem: 'A data de referência não é válida. Confira dia, mês, hora e minuto.' }
  return { ok: true }
}

/**
 * Quando a avaliação deve constar como aberta no banco.
 *
 * Para data futura, abre agora. Para data passada (retroativa), abre um dia
 * antes dela: a avaliação nasce coerente e o trigger do banco não recusa o
 * INSERT. Isso é só coerência de cadastro — não é o que permite ou impede o
 * aluno de enviar. Se a data não existir ou for inválida, abre agora.
 */
export function aberturaDaAvaliacao(
  prazo: string | null | undefined,
  agora: Date = new Date(),
): Date {
  const data = lerData(prazo)
  if (!data || data.getTime() > agora.getTime()) return agora
  return new Date(data.getTime() - 24 * 60 * 60 * 1000)
}

export interface EfeitoDoPrazo {
  /** Entregas que já estavam fora do prazo atual. */
  atrasadosAntes: number
  /** Entregas que ficariam fora do prazo novo. */
  atrasadosDepois: number
  /** Entregas dentro do prazo que passariam a ser marcadas como atrasadas. */
  pioram: number
}

/**
 * O que acontece com as entregas já feitas se o prazo mudar.
 *
 * `pioram` é o número que importa: são alunos que entregaram no prazo e, com a
 * data nova, apareceriam como atrasados. A tela usa isso para pedir confirmação
 * — encurtar prazo é legítimo, mas não pode ser silencioso.
 *
 * Remover o prazo (`prazoNovo` vazio) zera tudo: ninguém fica atrasado.
 */
export function efeitoDaMudanca({
  enviados,
  prazoAtual,
  prazoNovo,
}: {
  enviados: (string | null | undefined)[]
  prazoAtual: string | null | undefined
  prazoNovo: string | null | undefined
}): EfeitoDoPrazo {
  const atual = lerData(prazoAtual)
  const novo = lerData(prazoNovo)
  if (!novo) return { atrasadosAntes: 0, atrasadosDepois: 0, pioram: 0 }
  let atrasadosAntes = 0
  let atrasadosDepois = 0
  let pioram = 0
  for (const enviado of enviados) {
    const data = lerData(enviado)
    if (!data) continue
    const antes = atual ? data.getTime() > atual.getTime() : false
    const depois = data.getTime() > novo.getTime()
    if (antes) atrasadosAntes++
    if (depois) atrasadosDepois++
    if (depois && !antes) pioram++
  }
  return { atrasadosAntes, atrasadosDepois, pioram }
}

/**
 * Texto da confirmação mostrada ao professor antes de mudar a data.
 * `null` quando a mudança não tem efeito colateral: não há o que confirmar.
 *
 * Data no passado, sozinha, não é motivo para confirmação: ela não fecha o
 * envio. O aviso existe apenas quando entregas já feitas passariam a aparecer
 * como atrasadas.
 */
export function avisoDaMudanca(
  efeito: EfeitoDoPrazo,
  prazoNovo: string | null | undefined,
  _agora: Date = new Date(),
): string | null {
  if (!prazoNovo || !lerData(prazoNovo)) return null
  if (efeito.pioram > 0) {
    const alunos = efeito.pioram === 1 ? '1 entrega já feita' : `${efeito.pioram} entregas já feitas`
    return `${alunos} passaria(m) a ser marcada(s) como fora do prazo. A redação e a nota não mudam; o aviso de atraso sim.`
  }
  return null
}
