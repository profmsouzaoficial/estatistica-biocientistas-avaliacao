/**
 * O envio da foto, do lado do navegador: prazo e mensagem que se entende.
 *
 * O aluno entrega a redação no celular, muitas vezes no 4G do corredor. O
 * upload vai direto do navegador para o Storage do Supabase — e o SDK não aceita
 * `AbortSignal`. Sem prazo, a tela fica em “Enviando a foto…” até o navegador
 * desistir sozinho (às vezes minutos), sem dizer nada.
 *
 * Aqui a espera tem teto. O upload pode até terminar depois (o caminho é fixo e
 * o envio usa `upsert`), mas a pessoa recebe uma resposta e um botão — e a foto
 * continua no aparelho.
 */
export type CodigoDeEnvio = 'tempo' | 'rede' | 'tamanho' | 'sessao' | 'outro'

export class ErroDeEnvio extends Error {
  constructor(
    readonly codigo: CodigoDeEnvio,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = 'ErroDeEnvio'
  }
}

/** 60 s: foto comprimida (~300–600 KB) em rede móvel ruim costuma levar 5–20 s. */
export const PRAZO_ENVIO_MS = 60_000

export function mensagemDeDemoraNoEnvio(ms: number): string {
  const segundos = Math.max(1, Math.round(ms / 1000))
  return (
    `O envio da foto passou de ${segundos} s e eu parei de esperar. ` +
    'A foto continua no aparelho: confira o sinal (Wi-Fi ou dados) e toque em “Enviar” de novo.'
  )
}

/**
 * Traduz o erro do Storage para o que o aluno pode fazer.
 *
 * O SDK devolve mensagens de infraestrutura ("Failed to fetch", "new row
 * violates row-level security policy") — verdadeiras para quem programa, inúteis
 * para quem está com o celular na mão. O texto original não se perde: vai no
 * console, para o professor ver no diagnóstico.
 */
export function mensagemDeFalhaNoEnvio(detalhe: string): string {
  const d = (detalhe ?? '').toLowerCase()
  if (/failed to fetch|load failed|network|fetch failed|err_internet|offline/.test(d)) {
    return 'Não consegui falar com o servidor. Confira a conexão (Wi-Fi ou dados) e toque em “Enviar” de novo.'
  }
  if (/maximum allowed size|payload too large|entity too large|exceeded.*size|too large/.test(d)) {
    return 'A foto ficou grande demais para o envio. Tire outra um pouco mais longe da folha — ou digite o texto.'
  }
  if (/row-level security|jwt|unauthorized|401|invalid.*token|expired/.test(d)) {
    return 'Sua sessão expirou. Entre de novo — a foto continua no aparelho e o envio recomeça do zero.'
  }
  return 'Não consegui enviar a foto. Tente de novo em instantes; se continuar, digite o texto da redação.'
}

/** Erro do Storage (ou qualquer falha) no formato que a tela sabe mostrar. */
export function erroDeEnvio(detalhe: string): ErroDeEnvio {
  const d = (detalhe ?? '').toLowerCase()
  const codigo: CodigoDeEnvio = /maximum allowed size|payload too large|entity too large|exceeded.*size|too large/.test(
    d,
  )
    ? 'tamanho'
    : /row-level security|jwt|unauthorized|401|invalid.*token|expired/.test(d)
      ? 'sessao'
      : /failed to fetch|load failed|network|fetch failed|err_internet|offline/.test(d)
        ? 'rede'
        : 'outro'
  return new ErroDeEnvio(codigo, mensagemDeFalhaNoEnvio(detalhe))
}

/**
 * Corre uma promessa com prazo. Rejeita com `ErroDeEnvio('tempo')` se passar.
 *
 * Não cancela a promessa original (o SDK do Storage não aceita sinal): o envio
 * pode terminar em segundo plano. Como o caminho é o mesmo e o upload é `upsert`,
 * tentar de novo não duplica nem corrompe nada.
 */
export function comPrazo<T>(promessa: Promise<T>, ms: number, mensagem = mensagemDeDemoraNoEnvio(ms)): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    const relogio = setTimeout(() => rejeitar(new ErroDeEnvio('tempo', mensagem)), ms)
    promessa.then(
      (valor) => {
        clearTimeout(relogio)
        resolver(valor)
      },
      (erro) => {
        clearTimeout(relogio)
        rejeitar(erro)
      },
    )
  })
}
