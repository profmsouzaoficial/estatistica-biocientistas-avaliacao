import { PAPEIS, infoDoTipo, resultadoValido } from '../lib/personalidade'
import type { ResultadoPersonalidade } from '../lib/types'

/** Selo compacto com o código do tipo; a cor identifica o grupo de personalidade. */
export function SeloPersonalidade({
  resultado,
  compacto = false,
  className = '',
}: {
  resultado: ResultadoPersonalidade | null | undefined
  compacto?: boolean
  className?: string
}) {
  if (!resultadoValido(resultado)) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border border-borda bg-papel-fundo px-2 py-0.5 text-[11px] font-medium text-tinta-fraca ${className}`}
      >
        Teste não feito
      </span>
    )
  }

  const papel = PAPEIS[resultado.papel]
  const info = infoDoTipo(resultado.tipo)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}
      style={{ backgroundColor: papel.fundo, borderColor: papel.borda, color: papel.texto }}
      title={`${papel.nome} · ${info?.nome ?? resultado.tipo}`}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: papel.forte }} />
      {resultado.tipo}
      {!compacto && info ? <span className="font-normal">· {info.nome}</span> : null}
    </span>
  )
}

/** Legenda das cores usadas na lista de frequência. */
export function LegendaPersonalidades() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {Object.values(PAPEIS).map((p) => (
        <span key={p.codigo} className="inline-flex items-center gap-1.5 text-[11.5px] text-tinta-suave">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: p.forte }} />
          {p.nome}
        </span>
      ))}
    </div>
  )
}
