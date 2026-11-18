import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Link } from '../lib/router'

// ---------------------------------------------------------------------------

type Variante = 'primario' | 'secundario' | 'fantasma' | 'perigo' | 'suave'

const variantes: Record<Variante, string> = {
  // Desativado continua legível: o rótulo diz o que falta (“Corrigir 0 pendente(s)”)
  // e precisa ser lido. Antes era verde a 50% com texto branco — 1.09:1.
  primario:
    'bg-marinho text-white hover:bg-marinho-escuro active:bg-marinho-escuro disabled:bg-tinta-fraca/25 disabled:text-tinta-suave',
  secundario: 'bg-white text-tinta border border-borda hover:bg-papel-fundo disabled:bg-papel-fundo disabled:text-tinta-fraca',
  fantasma: 'bg-transparent text-marinho hover:bg-marinho-claro',
  perigo: 'bg-vermelho text-white hover:bg-vermelho/90',
  suave: 'bg-marinho-claro text-marinho-escuro hover:bg-marinho/15',
}

export interface PropsBotao extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante
  carregando?: boolean
  largo?: boolean
  icone?: ReactNode
}

export const Botao = forwardRef<HTMLButtonElement, PropsBotao>(function Botao(
  { variante = 'primario', carregando, largo, icone, className = '', children, disabled, ...resto },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || carregando}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[15px] font-medium
        transition-colors disabled:cursor-not-allowed ${variantes[variante]} ${largo ? 'w-full' : ''} ${className}`}
      {...resto}
    >
      {carregando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  )
})

// ---------------------------------------------------------------------------

export function Cartao({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`cartao p-4 ${className}`}>{children}</div>
}

// ---------------------------------------------------------------------------

interface PropsCampo extends InputHTMLAttributes<HTMLInputElement> {
  rotulo: string
  erro?: string | null
  dica?: string
}

export const Campo = forwardRef<HTMLInputElement, PropsCampo>(function Campo(
  { rotulo, erro, dica, id, className = '', ...resto },
  ref,
) {
  const nomeId = id ?? `campo-${rotulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div>
      <label htmlFor={nomeId} className="rotulo">
        {rotulo}
      </label>
      <input
        ref={ref}
        id={nomeId}
        className={`campo ${erro ? 'border-vermelho focus:border-vermelho focus:ring-vermelho/20' : ''} ${className}`}
        aria-invalid={erro ? true : undefined}
        {...resto}
      />
      {erro ? (
        <p className="mt-1.5 text-[13px] text-vermelho">{erro}</p>
      ) : dica ? (
        <p className="dica">{dica}</p>
      ) : null}
    </div>
  )
})

interface PropsArea extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  rotulo: string
  erro?: string | null
  dica?: string
}

export const AreaTexto = forwardRef<HTMLTextAreaElement, PropsArea>(function AreaTexto(
  { rotulo, erro, dica, id, className = '', ...resto },
  ref,
) {
  const nomeId = id ?? `area-${rotulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div>
      <label htmlFor={nomeId} className="rotulo">
        {rotulo}
      </label>
      <textarea
        ref={ref}
        id={nomeId}
        className={`campo min-h-28 resize-y leading-relaxed ${erro ? 'border-vermelho' : ''} ${className}`}
        {...resto}
      />
      {erro ? (
        <p className="mt-1.5 text-[13px] text-vermelho">{erro}</p>
      ) : dica ? (
        <p className="dica">{dica}</p>
      ) : null}
    </div>
  )
})

interface PropsSelecao extends SelectHTMLAttributes<HTMLSelectElement> {
  rotulo: string
  erro?: string | null
  dica?: string
}

export function Selecao({ rotulo, erro, dica, id, className = '', children, ...resto }: PropsSelecao) {
  const nomeId = id ?? `sel-${rotulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <div>
      <label htmlFor={nomeId} className="rotulo">
        {rotulo}
      </label>
      <select id={nomeId} className={`campo appearance-none ${className}`} {...resto}>
        {children}
      </select>
      {erro ? <p className="mt-1.5 text-[13px] text-vermelho">{erro}</p> : dica ? <p className="dica">{dica}</p> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

type Tom = 'neutro' | 'marinho' | 'dourado' | 'vermelho' | 'azul'

const tons: Record<Tom, string> = {
  neutro: 'bg-papel-fundo text-tinta-suave border-borda',
  marinho: 'bg-marinho-claro text-marinho-escuro border-marinho/20',
  dourado: 'bg-dourado-claro text-dourado border-dourado/25',
  vermelho: 'bg-vermelho-claro text-vermelho border-vermelho/20',
  azul: 'bg-azul-claro text-azul border-azul/20',
}

export function Selo({ children, tom = 'neutro', className = '' }: { children: ReactNode; tom?: Tom; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${tons[tom]} ${className}`}
    >
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------

export function Alerta({
  children,
  tom = 'dourado',
  titulo,
}: {
  children?: ReactNode
  tom?: Tom
  titulo?: string
}) {
  return (
    <div className={`rounded-xl border px-3.5 py-3 text-[14px] leading-snug ${tons[tom]}`} role="status">
      {titulo ? <p className="font-semibold">{titulo}</p> : null}
      {children ? <div className={titulo ? 'mt-1' : ''}>{children}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-tinta-suave">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      <span className="text-sm">{texto}</span>
    </div>
  )
}

export function BarraIndeterminada({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="relative h-1.5 overflow-hidden rounded-full bg-marinho/15 text-marinho barra-indeterminada" />
      <p className="text-center text-[13px] text-tinta-suave">{children}</p>
    </div>
  )
}

export function Vazio({
  titulo,
  children,
  icone,
}: {
  titulo: string
  children?: ReactNode
  icone?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-borda px-6 py-10 text-center">
      {icone ? <div className="text-tinta-fraca">{icone}</div> : null}
      <p className="font-medium text-tinta">{titulo}</p>
      {children ? <div className="max-w-sm text-[14px] leading-snug text-tinta-suave">{children}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------

// O brasão é a âncora visual do app: aparece nas telas de entrada e no topo de
// todas as telas internas. O PNG tem fundo transparente (recortado do oficial).
export function BrasaoUFJF({ className = 'h-10', alt = '' }: { className?: string; alt?: string }) {
  return (
    <img
      src="/brasao-ufjf.png"
      alt={alt}
      width={320}
      height={358}
      className={`w-auto shrink-0 object-contain ${className}`}
    />
  )
}

export function AppBar({ titulo, subtitulo }: { titulo: string; subtitulo?: string }) {
  return (
    <header className="safe-top sticky top-0 z-20 border-b border-borda bg-papel/90 backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
        <BrasaoUFJF className="h-10" />
        <div className="min-w-0 border-l border-borda pl-3">
          <h1 className="truncate font-serif text-[19px] leading-tight text-tinta">{titulo}</h1>
          {subtitulo ? <p className="truncate text-[12.5px] text-tinta-suave">{subtitulo}</p> : null}
        </div>
      </div>
    </header>
  )
}

export function BarraVoltar({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 text-[13.5px] font-medium text-tinta-suave hover:text-marinho">
      <ArrowLeft className="size-4" aria-hidden />
      {children ?? 'Voltar'}
    </a>
  )
}

export function LinhaLista({
  titulo,
  descricao,
  direita,
  href,
  onClick,
}: {
  titulo: ReactNode
  descricao?: ReactNode
  direita?: ReactNode
  href?: string
  onClick?: () => void
}) {
  const conteudo = (
    <>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-medium text-tinta">{titulo}</div>
        {descricao ? <div className="mt-0.5 text-[13px] leading-snug text-tinta-suave">{descricao}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-tinta-fraca">
        {direita}
        {href || onClick ? <ChevronRight className="size-4" aria-hidden /> : null}
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-papel-fundo">
        {conteudo}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-papel-fundo">
      {conteudo}
    </button>
  )
}
