import { useRef, useState } from 'react'
import { Camera, Image as ImageIcon, RefreshCw, X } from 'lucide-react'
import { Botao } from './ui'
import { ErroDeImagem, ehHeic, mensagemDeFalha } from '../lib/imagem'

export interface Foto {
  blob: Blob
  url: string
  bytes: number
  largura: number
  altura: number
}

// Uma foto de celular chega com 12 MP e 4 a 8 MB. Reduzir para 1800 px no lado
// maior dá ~154 dpi numa folha A4 — suficiente para o OCR ler letra de caneta e
// deixa o arquivo em menos de 1 MB (o teste `pnpm e2e:foto` mede isso com uma
// foto de 12 MP). Se um dia a transcrição errar letra pequena, este é o número a
// subir: 2200 px (~188 dpi) custa ~50% mais bytes e nada em complexidade.
const LADO_MAXIMO = 1800
const QUALIDADE = 0.85

// Um HEIC de 5 MB num celular lento pode levar segundos para falhar; sem limite,
// o botão fica "processando" e a aluna não sabe se espera ou tenta de novo.
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

async function comprimir(arquivo: File): Promise<Omit<Foto, 'url'>> {
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
      // Nenhum dos dois abriu. HEIC é a causa provável, e a mensagem diz o que
      // fazer em vez de só constatar o problema.
      const codigo = ehHeic(arquivo.name, arquivo.type) ? 'heic' : 'formato'
      throw new ErroDeImagem(codigo, mensagemDeFalha(codigo))
    }
  }

  const larguraOriginal = 'width' in bitmap ? bitmap.width : 0
  const alturaOriginal = 'height' in bitmap ? bitmap.height : 0
  const escala = Math.min(1, LADO_MAXIMO / Math.max(larguraOriginal, alturaOriginal))
  const largura = Math.round(larguraOriginal * escala)
  const altura = Math.round(alturaOriginal * escala)

  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Navegador sem suporte a canvas.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, largura, altura)
  ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, largura, altura)
  if ('close' in bitmap && typeof bitmap.close === 'function') bitmap.close()

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao processar a imagem.'))), 'image/jpeg', QUALIDADE),
  )
  return { blob, bytes: blob.size, largura, altura }
}

export function CapturaDeFoto({
  foto,
  onFoto,
  desabilitado,
}: {
  foto: Foto | null
  onFoto: (f: Foto | null) => void
  desabilitado?: boolean
}) {
  const cameraRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function receber(arquivos: FileList | null) {
    const arquivo = arquivos?.[0]
    if (!arquivo) return
    setErro(null)
    setProcessando(true)
    try {
      const dados = await comprimir(arquivo)
      const url = URL.createObjectURL(dados.blob)
      if (foto) URL.revokeObjectURL(foto.url)
      onFoto({ ...dados, url })
    } catch (e) {
      setErro(
        e instanceof ErroDeImagem
          ? e.message
          : 'Não foi possível abrir esta imagem. Formatos aceitos: JPG, PNG ou WEBP.',
      )
    } finally {
      setProcessando(false)
      if (cameraRef.current) cameraRef.current.value = ''
      if (galeriaRef.current) galeriaRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => receber(e.target.files)}
      />
      <input
        ref={galeriaRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => receber(e.target.files)}
      />

      {foto ? (
        <div className="relative overflow-hidden rounded-2xl border border-borda bg-black">
          <img src={foto.url} alt="Foto da redação enviada" className="max-h-[60vh] w-full object-contain" />
          <button
            type="button"
            onClick={() => {
              URL.revokeObjectURL(foto.url)
              onFoto(null)
            }}
            className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white backdrop-blur"
            aria-label="Remover foto"
          >
            <X className="size-4" />
          </button>
          <div className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] text-white">
            {foto.largura}×{foto.altura} · {(foto.bytes / 1024).toFixed(0)} KB
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-borda bg-white/60 px-4 py-8 text-center">
          <Camera className="mx-auto size-7 text-tinta-fraca" aria-hidden />
          <p className="mt-2 text-[14px] font-medium text-tinta">Fotografe a redação inteira</p>
          <p className="mx-auto mt-1 max-w-xs text-[13px] leading-snug text-tinta-suave">
            Folha apoiada numa superfície plana, luz de cima, sem sombra da mão. Confira se a letra está nítida antes de
            seguir.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Botao
          type="button"
          variante="primario"
          onClick={() => cameraRef.current?.click()}
          disabled={desabilitado || processando}
          carregando={processando}
          icone={foto ? <RefreshCw className="size-4" /> : <Camera className="size-4" />}
        >
          {foto ? 'Trocar foto' : 'Tirar foto'}
        </Botao>
        <Botao
          type="button"
          variante="secundario"
          onClick={() => galeriaRef.current?.click()}
          disabled={desabilitado || processando}
          icone={<ImageIcon className="size-4" />}
        >
          Galeria
        </Botao>
      </div>

      {erro ? <p className="text-[13px] text-vermelho">{erro}</p> : null}
    </div>
  )
}
