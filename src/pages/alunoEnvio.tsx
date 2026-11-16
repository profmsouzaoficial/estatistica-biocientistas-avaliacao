import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Keyboard, Send } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { Link, usarRota } from '../lib/router'
import { Alerta, AppBar, BarraIndeterminada, Botao, Carregando, Cartao, AreaTexto } from '../components/ui'
import { CapturaDeFoto, type Foto } from '../components/Camera'
import { ErroApi } from '../lib/servidor'
import type { Avaliacao, Submissao } from '../lib/types'

type Etapa = 'foto' | 'enviando-foto' | 'conferir' | 'enviado'

export function AlunoEnvio({ id }: { id: string }) {
  const { d } = usarSessao()
  const { navegar } = usarRota()

  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null)
  const [submissao, setSubmissao] = useState<Submissao | null>(null)
  const [foto, setFoto] = useState<Foto | null>(null)
  const [etapa, setEtapa] = useState<Etapa>('foto')
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [manual, setManual] = useState(false)
  const [confirmado, setConfirmado] = useState(false)
  const [progresso, setProgresso] = useState('')
  const inicio = useRef(false)

  useEffect(() => {
    if (!d || !id || inicio.current) return
    inicio.current = true
    Promise.all([d.avaliacao(id), d.obterOuCriarSubmissao(id)])
      .then(([av, sub]) => {
        setAvaliacao(av)
        setSubmissao(sub)
        if (sub.transcrito) {
          setTexto(sub.transcrito)
          setEtapa('conferir')
        }
        if (sub.status === 'enviada' || sub.status === 'corrigida') {
          setEtapa('enviado')
        }
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao abrir a avaliação.'))
  }, [d, id])

  async function transcreverEFoto() {
    if (!d || !submissao || !foto) return
    setErro(null)
    setAviso(null)
    setEtapa('enviando-foto')

    try {
      setProgresso('Enviando a foto…')
      await d.enviarFoto(submissao.id, foto.blob)

      if (d.modo === 'demo') {
        setManual(true)
        setAviso(
          'Modo demonstração: a transcrição automática não roda no navegador. Digite ou cole o texto da sua redação para simular o envio.',
        )
        setEtapa('conferir')
        return
      }

      setProgresso('Lendo a letra e transcrevendo… isso leva alguns segundos')
      const atualizada = await d.transcrever(submissao.id)
      setSubmissao(atualizada)
      if (atualizada.transcrito) setTexto(atualizada.transcrito)
      else {
        setManual(true)
        setAviso('A transcrição voltou vazia. Digite o texto abaixo.')
      }
      setEtapa('conferir')
    } catch (e) {
      if (e instanceof ErroApi && e.status === 503) {
        setManual(true)
        setAviso(
          'A transcrição automática ainda não está configurada neste servidor. Digite o texto da sua redação abaixo — a foto já foi guardada como comprovante.',
        )
        setEtapa('conferir')
      } else {
        setErro(e instanceof Error ? e.message : 'Falha ao processar a foto.')
        setEtapa('foto')
      }
    } finally {
      setProgresso('')
    }
  }

  async function enviar() {
    if (!d || !submissao) return
    setErro(null)
    if (texto.trim().length < 80) {
      setErro('O texto parece curto demais. Confira se a redação inteira foi transcrita.')
      return
    }
    if (!confirmado) {
      setErro('Marque a confirmação de que o texto corresponde à sua redação.')
      return
    }
    setEtapa('enviando-foto')
    setProgresso('Registrando a entrega…')
    try {
      await d.salvarTranscricao(submissao.id, texto.trim())
      await d.enviarRedacao(submissao.id)
      setEtapa('enviado')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar.')
      setEtapa('conferir')
    } finally {
      setProgresso('')
    }
  }

  if (!avaliacao || !submissao) {
    return (
      <>
        <AppBar titulo="Enviar redação" />
        <main className="mx-auto max-w-2xl px-4 py-4">
          {erro ? <Alerta tom="vermelho" titulo="Ops">{erro}</Alerta> : <Carregando />}
        </main>
      </>
    )
  }

  const palavras = texto.trim() ? texto.trim().split(/\s+/).length : 0

  return (
    <>
      <AppBar titulo="Enviar redação" subtitulo={avaliacao.titulo} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
        <Link href={`/avaliacoes/${id}`} className="text-[13px] text-tinta-suave hover:text-verde">
          ← Voltar para a avaliação
        </Link>

        {erro ? (
          <Alerta tom="vermelho" titulo="Atenção">
            {erro}
          </Alerta>
        ) : null}

        {etapa === 'enviado' ? (
          <Cartao className="text-center">
            <CheckCircle2 className="mx-auto size-10 text-verde" aria-hidden />
            <h2 className="mt-3 font-serif text-[20px] text-tinta">Redação enviada</h2>
            <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-snug text-tinta-suave">
              Sua entrega foi registrada. A correção entra na fila e a devolutiva aparece aqui assim que o professor
              aprovar.
            </p>
            <Botao largo className="mt-4" onClick={() => navegar(`/avaliacoes/${id}`)}>
              Voltar para a avaliação
            </Botao>
          </Cartao>
        ) : etapa === 'foto' ? (
          <>
            <Cartao>
              <h2 className="font-serif text-[17px] text-tinta">{avaliacao.titulo}</h2>
              <p className="mt-1 text-[13.5px] leading-snug text-tinta-suave">{avaliacao.tema}</p>
            </Cartao>

            <CapturaDeFoto foto={foto} onFoto={setFoto} />

            {foto ? (
              <Botao largo onClick={transcreverEFoto} icone={<Send className="size-4" />}>
                Usar esta foto
              </Botao>
            ) : null}

            <p className="px-1 text-[12.5px] leading-snug text-tinta-fraca">
              A foto é guardada em área privada, visível apenas para você e para o professor. Ela serve de comprovante da
              sua redação manuscrita.
            </p>
          </>
        ) : etapa === 'enviando-foto' ? (
          <Cartao>
            <BarraIndeterminada>{progresso || 'Processando…'}</BarraIndeterminada>
            {foto ? (
              <img src={foto.url} alt="" className="mt-4 max-h-64 w-full rounded-xl object-contain opacity-60" />
            ) : null}
          </Cartao>
        ) : (
          <>
            <div className="flex items-start gap-2.5 rounded-xl border border-azul/20 bg-azul-claro px-3.5 py-3 text-[13.5px] leading-snug text-azul">
              <Keyboard className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div>
                <p className="font-medium">{manual ? 'Transcrição digitada' : 'Confira a transcrição'}</p>
                <p className="mt-0.5">
                  {manual
                    ? 'A correção usa o texto abaixo. Digite exatamente o que está na sua folha.'
                    : 'A correção usa o texto abaixo, não a foto. Corrija qualquer palavra que o sistema tenha lido errado.'}
                </p>
              </div>
            </div>

            {aviso ? <Alerta tom="ambar">{aviso}</Alerta> : null}

            <AreaTexto
              rotulo="Texto da sua redação"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              className="min-h-72"
              dica={`${palavras} palavras · ${texto.length} caracteres`}
            />

            <label className="flex items-start gap-2.5 rounded-xl border border-borda bg-white px-3.5 py-3">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-verde"
              />
              <span className="text-[13.5px] leading-snug text-tinta">
                Confirmo que este texto corresponde à minha redação manuscrita e que não há trechos de outra pessoa.
              </span>
            </label>

            {foto ? (
              <details className="rounded-xl border border-borda bg-white">
                <summary className="cursor-pointer px-3.5 py-2.5 text-[13px] text-tinta-suave">Ver a foto enviada</summary>
                <img src={foto.url} alt="Foto da redação" className="w-full rounded-b-xl object-contain" />
              </details>
            ) : null}

            <div className="space-y-2">
              <Botao largo onClick={enviar} carregando={progresso !== ''} icone={<Send className="size-4" />}>
                Enviar redação
              </Botao>
              <Botao
                largo
                variante="secundario"
                onClick={() => {
                  setEtapa('foto')
                  setAviso(null)
                }}
                disabled={progresso !== ''}
              >
                Trocar a foto
              </Botao>
            </div>

            <p className="flex items-start gap-2 px-1 text-[12px] leading-snug text-tinta-fraca">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Enquanto não enviar, o texto fica salvo como rascunho.
            </p>
          </>
        )}
      </main>
    </>
  )
}
