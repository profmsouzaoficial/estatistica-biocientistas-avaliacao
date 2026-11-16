/**
 * O link de recuperação de senha, quando dá errado.
 *
 * O Supabase manda o aluno para `https://app/#access_token=...&type=recovery`
 * quando o link vale, e para `https://app/#error=access_denied&error_code=...`
 * quando expirou ou já foi usado. Sem tratar o segundo caso, a pessoa clica,
 * cai na tela de login **sem explicação** e clica de novo — no link que já não
 * funciona. Este arquivo lê o hash, traduz o erro e guarda o recado para a tela
 * de recuperação mostrar.
 *
 * Fora do componente para poder ser testado sem navegador (`pnpm test:recuperacao`).
 */

const CHAVE_AVISO = 'aviso-link-recuperacao'

/** Textos do Supabase (em inglês) traduzidos para o que a pessoa precisa fazer. */
const TRADUCOES: { contem: string; texto: string }[] = [
  {
    contem: 'expired',
    texto: 'Este link expirou. Os links de recuperação valem por uma hora — peça outro abaixo.',
  },
  {
    contem: 'invalid',
    texto: 'Este link não vale mais. Ele pode já ter sido usado — peça um novo abaixo.',
  },
  {
    contem: 'access_denied',
    texto: 'Não consegui validar este link. Peça um novo abaixo.',
  },
]

export interface ErroDoLink {
  /** Mensagem pronta para a tela, em português. */
  mensagem: string
  /** Código cru do Supabase, para diagnóstico. */
  codigo: string | null
}

/** Lê `#error=...` ou `?error=...` (o Supabase usa os dois, conforme o fluxo). */
export function lerErroDoLink(hash: string, busca = ''): ErroDoLink | null {
  const limpar = (v: string) => v.replace(/^#/, '').replace(/^\?/, '')
  const parametros = new URLSearchParams(limpar(hash))
  const daBusca = new URLSearchParams(limpar(busca))
  const pegar = (chave: string) => parametros.get(chave) ?? daBusca.get(chave)

  const codigo = pegar('error_code') ?? pegar('error')
  const descricao = pegar('error_description') ?? ''
  if (!codigo && !descricao) return null

  const alvo = `${codigo ?? ''} ${descricao}`.toLowerCase().replace(/\+/g, ' ')
  const traducao = TRADUCOES.find((t) => alvo.includes(t.contem))
  return {
    mensagem:
      traducao?.texto ??
      'Não foi possível usar este link de recuperação. Peça um novo abaixo.',
    codigo: codigo ?? descricao ?? null,
  }
}

/** Guarda o recado para a próxima tela (o hash é limpo logo depois). */
export function guardarAvisoDoLink(erro: ErroDoLink): void {
  try {
    sessionStorage.setItem(CHAVE_AVISO, JSON.stringify(erro))
  } catch {
    /* navegador sem sessionStorage (modo privado antigo): só não mostra */
  }
}

export function lerAvisoDoLink(): ErroDoLink | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE_AVISO)
    if (!bruto) return null
    const dado = JSON.parse(bruto) as ErroDoLink
    return dado?.mensagem ? dado : null
  } catch {
    return null
  }
}

export function limparAvisoDoLink(): void {
  try {
    sessionStorage.removeItem(CHAVE_AVISO)
  } catch {
    /* idem */
  }
}
