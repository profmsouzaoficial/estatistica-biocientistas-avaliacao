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

// -----------------------------------------------------------------------------
// Preparação da imagem (redação e avatar)
// -----------------------------------------------------------------------------

export interface ImagemPreparada {
  blob: Blob
  bytes: number
  largura: number
  altura: number
}

export interface OpcoesDeImagem {
  /** Maior lado da imagem final, em pixels. */
  ladoMaximo: number
  /** Qualidade do JPEG, de 0 a 1. */
  qualidade: number
  /** Recorta o centro em quadrado antes de reduzir (para avatares). */
  recorteQuadrado?: boolean
}

// Um HEIC de 5 MB num celular lento pode levar segundos para falhar; sem limite,
// o botão fica "processando" e a pessoa não sabe se espera ou tenta de novo.
const TEMPO_MAXIMO_DECODE = 20_000

function comLimite<T>(promessa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const relogio = setTimeout(() => reject(new ErroDeImagem('tempo', mensagemDeFalha('tempo'))), ms)
    promessa.then(
      (valor) => {
        clearTimeout(relogio)
        resolve(valor)
      },
      (erro) => {
        clearTimeout(relogio)
        reject(erro)
      },
    )
  })
}

/** Segunda tentativa de decodificação: a tag <img>, que aceita formatos que o
 * `createImageBitmap` recusa. Revoga o object URL nos dois caminhos. */
function decodificarComTag(arquivo: File): Promise<ImageBitmap> {
  return new Promise<ImageBitmap>((resolve, reject) => {
    const url = URL.createObjectURL(arquivo)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img as unknown as ImageBitmap)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('formato não suportado'))
    }
    img.src = url
  })
}

/**
 * Decodifica, corrige a orientação, recorta (se pedido), reduz e comprime em
 * JPEG. É usada pela foto da redação (1800 px) e pelo avatar (640 px). O HEIC
 * do iPhone ganha uma mensagem que diz o que fazer, não só "erro".
 */
export async function prepararImagem(arquivo: File, opcoes: OpcoesDeImagem): Promise<ImagemPreparada> {
  if (!arquivo.size) throw new ErroDeImagem('vazio', mensagemDeFalha('vazio'))

  let bitmap: ImageBitmap
  try {
    bitmap = await comLimite(createImageBitmap(arquivo, { imageOrientation: 'from-image' }), TEMPO_MAXIMO_DECODE)
  } catch (primeiro) {
    if (primeiro instanceof ErroDeImagem) throw primeiro
    try {
      bitmap = await comLimite(decodificarComTag(arquivo), TEMPO_MAXIMO_DECODE)
    } catch (segundo) {
      if (segundo instanceof ErroDeImagem) throw segundo
      const codigo = ehHeic(arquivo.name, arquivo.type) ? 'heic' : 'formato'
      throw new ErroDeImagem(codigo, mensagemDeFalha(codigo))
    }
  }

  const larguraOriginal = 'width' in bitmap ? bitmap.width : 0
  const alturaOriginal = 'height' in bitmap ? bitmap.height : 0
  if (!larguraOriginal || !alturaOriginal) throw new ErroDeImagem('formato', mensagemDeFalha('formato'))

  const origemLado = opcoes.recorteQuadrado ? Math.min(larguraOriginal, alturaOriginal) : null
  const origemX = origemLado ? Math.round((larguraOriginal - origemLado) / 2) : 0
  const origemY = origemLado ? Math.round((alturaOriginal - origemLado) / 2) : 0
  const baseLargura = origemLado ?? larguraOriginal
  const baseAltura = origemLado ?? alturaOriginal
  const escala = Math.min(1, opcoes.ladoMaximo / Math.max(baseLargura, baseAltura))
  const largura = Math.max(1, Math.round(baseLargura * escala))
  const altura = Math.max(1, Math.round(baseAltura * escala))

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Navegador sem suporte a canvas.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, largura, altura)
  if (origemLado) {
    ctx.drawImage(bitmap as unknown as CanvasImageSource, origemX, origemY, origemLado, origemLado, 0, 0, largura, altura)
  } else {
    ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, largura, altura)
  }
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao processar a imagem.'))), 'image/jpeg', opcoes.qualidade),
  )
  return { blob, bytes: blob.size, largura, altura }
}

/** Avatar: recorte quadrado, 640 px e JPEG. Suficiente para 56 px em tela 3x. */
export async function prepararAvatar(arquivo: File): Promise<ImagemPreparada> {
  return prepararImagem(arquivo, { ladoMaximo: 640, qualidade: 0.86, recorteQuadrado: true })
}
