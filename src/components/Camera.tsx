import { useRef, useState } from 'react'
import { Camera, Image as ImageIcon, RefreshCw, X } from 'lucide-react'
import { Botao } from './ui'
import { ErroDeImagem, prepararImagem } from '../lib/imagem'

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
async function comprimir(arquivo: File) {
  return prepararImagem(arquivo, { ladoMaximo: 1800, qualidade: 0.85 })
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
