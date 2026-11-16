/**
 * O que pode dar errado ao abrir a foto que o aluno escolheu.
 *
 * O caminho feliz é a foto da câmera do celular: JPEG, o navegador decodifica,
 * o canvas reduz e pronto. O caminho que ninguém testava é o do **arquivo que o
 * navegador não consegue abrir** — e ele tem uma causa dominante: HEIC, o
 * formato padrão do iPhone, que Chrome, Firefox e Android não decodificam.
 *
 * Antes, os dois casos caíam na mesma frase ("Não foi possível abrir a
 * imagem."), sem dizer o que fazer. A aluna ficava sem saber se era a foto, o
 * celular, a internet ou o app. Aqui cada falha tem um código e uma instrução.
 */

export type CodigoDeFalha = 'heic' | 'formato' | 'tempo' | 'vazio'

export class ErroDeImagem extends Error {
  constructor(readonly codigo: CodigoDeFalha, mensagem: string) {
    super(mensagem)
    this.name = 'ErroDeImagem'
  }
}

/**
 * O arquivo é HEIC/HEIF? Olha o tipo MIME **e** a extensão: a câmera do iPhone
 * às vezes entrega `application/octet-stream` ou string vazia, e o nome é a
 * única pista. Não decide nada sozinho — só escolhe qual mensagem mostrar
 * quando a decodificação falha.
 */
export function ehHeic(nome: string | undefined, tipo: string | undefined): boolean {
  const t = (tipo ?? '').toLowerCase()
  if (t === 'image/heic' || t === 'image/heif' || t === 'image/heic-sequence' || t === 'image/heif-sequence') {
    return true
  }
  const n = (nome ?? '').toLowerCase()
  return n.endsWith('.heic') || n.endsWith('.heif') || n.endsWith('.hif')
}

/** Texto mostrado abaixo dos botões, no lugar do erro genérico. */
export function mensagemDeFalha(codigo: CodigoDeFalha): string {
  switch (codigo) {
    case 'heic':
      return (
        'Esta foto está em HEIC, o formato padrão do iPhone, e este navegador não consegue abri-la. ' +
        'Toque em “Tirar foto” — a câmera do navegador entrega JPEG. ' +
        'Se preferir usar a galeria, mude o iPhone em Ajustes → Câmera → Formatos para “Mais compatível”.'
      )
    case 'tempo':
      return 'A imagem demorou demais para abrir. Tente de novo ou escolha uma foto menor.'
    case 'vazio':
      return 'O arquivo chegou vazio. Escolha a foto de novo.'
    case 'formato':
      return 'Não foi possível abrir esta imagem. Formatos aceitos: JPG, PNG ou WEBP. Se ela veio do iPhone, toque em “Tirar foto”.'
  }
}
