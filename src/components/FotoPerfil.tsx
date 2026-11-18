import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import { prepararAvatar } from '../lib/imagem'
import { usarSessao } from '../lib/sessao'
import { Avatar } from './Avatar'
import { Botao, Cartao } from './ui'

/** Cartão de foto do perfil: envia ao bucket privado e mostra a imagem assinada. */
export function FotoPerfil() {
  const { d, perfil, recarregar } = usarSessao()
  const entrada = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    if (!d || !perfil?.foto_path) {
      setUrl(null)
      return
    }
    void d.urlDaFotoPerfil(perfil.foto_path).then((u) => {
      if (ativo) setUrl(u)
    })
    return () => {
      ativo = false
    }
  }, [d, perfil?.foto_path])

  if (!perfil) return null

  async function escolher(arquivos: FileList | null) {
    const arquivo = arquivos?.[0]
    if (!arquivo) return
    if (!d) return
    setErro(null)
    setAviso(null)
    setEnviando(true)
    try {
      const preparada = await prepararAvatar(arquivo)
      await d.enviarFotoPerfil(preparada.blob)
      await recarregar()
      setAviso('Foto atualizada.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar a foto.')
    } finally {
      setEnviando(false)
      if (entrada.current) entrada.current.value = ''
    }
  }

  async function remover() {
    if (!d) return
    setErro(null)
    setAviso(null)
    setRemovendo(true)
    try {
      await d.removerFotoPerfil()
      await recarregar()
      setAviso('Foto removida.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível remover a foto.')
    } finally {
      setRemovendo(false)
    }
  }

  return (
    <Cartao className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar nome={perfil.nome_completo} url={url} tamanho={76} />
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-medium text-tinta">Foto do perfil</h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-tinta-suave">
            Ajuda o professor a reconhecer você na chamada. Fica em armazenamento privado.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              ref={entrada}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Escolher foto do perfil"
              onChange={(e) => void escolher(e.target.files)}
            />
            <Botao
              type="button"
              variante="secundario"
              className="px-3 py-2 text-[13px]"
              carregando={enviando}
              disabled={removendo}
              onClick={() => entrada.current?.click()}
              icone={<Camera className="size-4" />}
            >
              {perfil.foto_path ? 'Trocar foto' : 'Escolher foto'}
            </Botao>
            {perfil.foto_path ? (
              <button
                type="button"
                onClick={() => void remover()}
                disabled={removendo || enviando}
                className="inline-flex min-h-10 items-center gap-1 rounded-lg px-1.5 py-2 text-[12.5px] font-medium text-vermelho underline-offset-2 hover:underline disabled:opacity-50"
              >
                <Trash2 className="size-3.5" aria-hidden />
                Remover
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-tinta-fraca">
        JPG, PNG ou WEBP. A imagem é recortada em quadrado e reduzida para 640 px antes de subir; o arquivo original não
        é guardado.
      </p>
      {aviso ? (
        <p className="text-[12.5px] text-marinho" role="status">
          {aviso}
        </p>
      ) : null}
      {erro ? (
        <p className="text-[12.5px] text-vermelho" role="alert">
          {erro}
        </p>
      ) : null}
    </Cartao>
  )
}
