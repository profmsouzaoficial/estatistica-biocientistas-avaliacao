/**
 * Regras de prazo de entrega.
 *
 * O prazo é a única configuração da avaliação que pode **tirar** o direito de
 * entregar de quem ainda não entregou — e ele é digitado à mão, num campo
 * `datetime-local` que aceita qualquer data. Duas coisas dão errado com
 * facilidade:
 *
 *   1. data no passado por engano (ninguém consegue enviar e o professor não
 *      entende por quê);
 *   2. encurtar o prazo de uma avaliação que já recebeu entregas — quem entregou
 *      no prazo passa a aparecer como atrasado, retroativamente.
 *
 * As funções aqui são puras (recebem as datas e o "agora", não leem relógio nem
 * banco) para que o teste cubra os casos sem esperar o tempo passar.
 */

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

/**
 * Valida o prazo no momento de **criar** a avaliação.
 *
 * Prazo vazio é permitido (entrega sem data limite). Prazo no passado não é: o
 * formulário grava `abre_em = agora`, então um prazo anterior à abertura é uma
 * avaliação que nasce fechada — e o banco recusa (trigger `trg_avaliacao_prazo`,
 * só no INSERT). Melhor explicar antes de tentar.
 */
export function validarPrazoCriacao(
  prazo: string | null | undefined,
  agora: Date = new Date(),
): ResultadoValidacaoPrazo {
  if (!prazo) return { ok: true }
  const data = lerData(prazo)
  if (!data) return { ok: false, mensagem: 'A data do prazo não é válida. Confira dia, mês, hora e minuto.' }
  if (data.getTime() <= agora.getTime()) {
    return {
      ok: false,
      mensagem:
        'Esse prazo já passou — a avaliação nasceria fechada e ninguém conseguiria enviar. ' +
        'Escolha uma data futura; depois de criada, o prazo pode ser mudado no painel da avaliação.',
    }
  }
  return { ok: true }
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
 * Texto da confirmação mostrada ao professor antes de mudar o prazo.
 * `null` quando a mudança não tem efeito colateral: não há o que confirmar.
 */
export function avisoDaMudanca(
  efeito: EfeitoDoPrazo,
  prazoNovo: string | null | undefined,
  agora: Date = new Date(),
): string | null {
  if (!prazoNovo) return null
  const novo = lerData(prazoNovo)
  if (!novo) return null
  if (novo.getTime() <= agora.getTime() && efeito.pioram === 0) {
    return 'A data escolhida já passou: a partir de agora ninguém consegue enviar. Quem já enviou continua enviado.'
  }
  if (efeito.pioram > 0) {
    const alunos = efeito.pioram === 1 ? '1 entrega já feita' : `${efeito.pioram} entregas já feitas`
    return `${alunos} passaria(m) a ser marcada(s) como fora do prazo. A redação e a nota não mudam; o aviso de atraso sim.`
  }
  return null
}
