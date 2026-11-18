import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { Turma } from '../lib/types'

/**
 * Seleção de várias turmas sem `select multiple` (que no celular vira uma
 * lista cinza em que ninguém acerta o toque). O botão abre um painel de
 * caixas de seleção; cada opção mostra o curso, o `codigo_siga` — a mesma chave
 * que o SIGA usa —, o período e o nome da turma como apoio.
 */
export function SelecaoTurmas({
  turmas,
  selecionadas,
  onChange,
}: {
  turmas: Turma[]
  selecionadas: string[]
  onChange: (ids: string[]) => void
}) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const painel = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const rotuloId = useId()
  const listaId = useId()
  const resumoId = useId()
  const valorId = useId()

  function fechar() {
    setAberto(false)
    botao.current?.focus()
  }

  useEffect(() => {
    if (!aberto) return
    painel.current?.focus()
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
      }
    }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const escolhidas = turmas.filter((t) => selecionadas.includes(t.id))
  const rotuloCurso = (t: Turma) => t.curso?.trim() || 'Curso não informado'

  function alternar(id: string) {
    onChange(selecionadas.includes(id) ? selecionadas.filter((x) => x !== id) : [...selecionadas, id])
  }

  return (
    <div ref={caixa} className="relative">
      <span id={rotuloId} className="rotulo">
        Turmas
      </span>
      <span id={resumoId} className="sr-only">
        {escolhidas.length === 0
          ? 'Nenhuma turma selecionada.'
          : `Selecionadas: ${escolhidas.map((t) => `${rotuloCurso(t)}, ${t.codigo_siga}, ${t.periodo}`).join('; ')}.`}
      </span>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={listaId}
        aria-labelledby={`${rotuloId} ${valorId}`}
        aria-describedby={resumoId}
        onClick={() => setAberto((v) => !v)}
        className="campo flex min-h-11 items-center justify-between gap-2 text-left"
      >
        <span id={valorId} className={escolhidas.length ? 'text-tinta' : 'text-tinta-fraca'}>
          {escolhidas.length === 0
            ? 'Escolha uma ou mais turmas…'
            : escolhidas.length === 1
              ? `1 turma: ${rotuloCurso(escolhidas[0])} · ${escolhidas[0].codigo_siga} · ${escolhidas[0].periodo}`
              : `${escolhidas.length} turmas selecionadas`}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-tinta-fraca transition-transform ${aberto ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {aberto ? (
        <div
          ref={painel}
          id={listaId}
          tabIndex={-1}
          role="group"
          aria-label="Turmas disponíveis"
          className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-xl border border-borda bg-white p-1.5 shadow-xl focus:outline-none"
        >
          <div className="flex items-center justify-between gap-2 border-b border-borda px-2 pb-1.5">
            <span className="text-[12px] text-tinta-suave">Marque uma ou mais</span>
            <div className="flex items-center">
              <button
                type="button"
                className="alvo-toque px-2 text-[12px] font-medium text-marinho hover:underline"
                onClick={() => onChange(turmas.map((t) => t.id))}
              >
                Todas
              </button>
              <button
                type="button"
                className="alvo-toque px-2 text-[12px] font-medium text-tinta-suave hover:underline"
                onClick={() => onChange([])}
              >
                Limpar
              </button>
            </div>
          </div>
          {turmas.map((t) => (
            <label
              key={t.id}
              className="flex min-h-12 cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-papel"
            >
              <input
                type="checkbox"
                checked={selecionadas.includes(t.id)}
                onChange={() => alternar(t.id)}
                className="mt-0.5 size-5 shrink-0 accent-marinho"
              />
              <span className="min-w-0">
                <span className="block text-[14px] font-medium text-tinta">
                  {rotuloCurso(t)} · {t.codigo_siga} · {t.periodo}
                </span>
                <span className="block truncate text-[12px] text-tinta-suave">{t.nome}</span>
              </span>
            </label>
          ))}
          <div className="border-t border-borda px-2 pt-1.5">
            <button
              type="button"
              className="alvo-toque w-full text-[12.5px] font-medium text-marinho hover:underline"
              onClick={fechar}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {escolhidas.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {escolhidas.map((t) => (
            <span
              key={t.id}
              className="rounded-full border border-borda bg-white px-2.5 py-1 text-[12px] text-tinta-suave"
            >
              {rotuloCurso(t)} · {t.codigo_siga} · {t.periodo}
            </span>
          ))}
        </div>
      ) : null}
      <p className="dica">A avaliação será criada em cada turma marcada.</p>
    </div>
  )
}
