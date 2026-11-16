import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, FileText, Sparkles } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { Link } from '../lib/router'
import { Alerta, AppBar, Carregando, Cartao, Selo } from '../components/ui'
import { formatarDataHora, formatarNota, formatarPontos } from '../lib/formato'
import type { AvaliacaoDoAluno } from '../lib/types'

/**
 * Transparência sobre a correção: o aluno precisa saber quando a sugestão veio
 * de um modelo e que a nota final é do professor (LGPD art. 20 e bom senso).
 */
function origemDaCorrecao(modelo: string | null, decisao: string): string {
  if (!modelo || modelo === 'manual') {
    return 'Correção feita pelo professor, critério por critério.'
  }
  // O nome técnico do modelo fica na tela do professor; ao aluno basta saber que
  // houve sugestão automática e que a decisão final é humana.
  const revisada = decisao === 'ajustada' ? 'ajustada' : 'conferida e aprovada'
  return `Nota sugerida por um modelo de linguagem e ${revisada} pelo professor — a nota final é dele.`
}

export function Devolutiva({ id }: { id: string }) {
  const { d } = usarSessao()
  const [a, setA] = useState<AvaliacaoDoAluno | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [verTexto, setVerTexto] = useState(false)

  useEffect(() => {
    if (!d) return
    d.avaliacoesDoAluno()
      .then((lista) => {
        const achada = lista.find((x) => x.id === id) ?? null
        setA(achada)
        if (!achada?.correcao) setErro('A devolutiva desta avaliação ainda não foi liberada.')
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'))
  }, [d, id])

  if (erro) {
    return (
      <>
        <AppBar titulo="Devolutiva" />
        <main className="mx-auto max-w-2xl px-4 py-4">
          <Alerta tom="ambar" titulo="Ainda não disponível">
            {erro}
          </Alerta>
          <Link href="/" className="mt-4 inline-block text-[13.5px] text-verde underline-offset-2 hover:underline">
            ← Voltar para as avaliações
          </Link>
        </main>
      </>
    )
  }
  if (!a || !a.correcao) return <Carregando />

  const c = a.correcao
  const pct = Math.round((c.nota_bruta / a.valor_total) * 100)

  return (
    <>
      <AppBar titulo="Devolutiva" subtitulo={a.titulo} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-24">
        <Link href="/" className="text-[13px] text-tinta-suave hover:text-verde">
          ← Todas as avaliações
        </Link>

        <Cartao className="!p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[12px] uppercase tracking-wide text-tinta-fraca">Nota</p>
              <p className="mt-1 font-serif text-[46px] leading-none text-verde">{formatarNota(c.nota_final)}</p>
              <p className="mt-1 text-[13px] text-tinta-suave">de 10,0 no SIGA</p>
            </div>
            <div className="text-right">
              <p className="font-serif text-[22px] leading-none text-tinta">{formatarPontos(c.nota_bruta)}</p>
              <p className="mt-1 text-[12.5px] text-tinta-suave">de {formatarPontos(a.valor_total)} pontos</p>
            </div>
          </div>
          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-papel-fundo">
            <div className="h-full rounded-full bg-verde transition-all" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Selo tom="verde">{c.decisao === 'ajustada' ? 'Revisada pelo professor' : 'Aprovada pelo professor'}</Selo>
            {c.revisado_em ? <Selo>Liberada em {formatarDataHora(c.revisado_em)}</Selo> : null}
          </div>
          <p className="mt-3 border-t border-borda pt-2.5 text-[12px] leading-snug text-tinta-fraca">
            {origemDaCorrecao(c.modelo, c.decisao)}
          </p>
        </Cartao>

        <Cartao>
          <h2 className="font-serif text-[17px] text-tinta">Critério a critério</h2>
          <ul className="mt-3 space-y-4">
            {c.criterios.map((crit) => {
              const max = a.rubrica.find((r) => r.id === crit.id)?.valor ?? 1
              const fracao = Math.max(0, Math.min(1, crit.valor / max))
              return (
                <li key={crit.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[14.5px] font-medium text-tinta">{crit.nome}</p>
                    <p className="shrink-0 text-[13px] tabular-nums text-tinta-suave">
                      <span className="font-medium text-tinta">{formatarPontos(crit.valor)}</span> / {formatarPontos(max)}
                    </p>
                  </div>
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-papel-fundo">
                    <div
                      className={`h-full rounded-full ${fracao >= 0.7 ? 'bg-verde' : fracao >= 0.4 ? 'bg-ambar' : 'bg-vermelho'}`}
                      style={{ width: `${fracao * 100}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[13.5px] leading-snug text-tinta-suave">{crit.justificativa}</p>
                </li>
              )
            })}
          </ul>
        </Cartao>

        <Cartao>
          <h2 className="flex items-center gap-1.5 font-serif text-[17px] text-tinta">
            <Sparkles className="size-4 text-verde" aria-hidden /> Pontos fortes
          </h2>
          <ul className="mt-2.5 space-y-2">
            {c.pontos_fortes.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] leading-snug text-tinta">
                <Check className="mt-0.5 size-4 shrink-0 text-verde" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Cartao>

        <Cartao>
          <h2 className="flex items-center gap-1.5 font-serif text-[17px] text-tinta">
            <ArrowUpRight className="size-4 text-ambar" aria-hidden /> Pontos a desenvolver
          </h2>
          <ul className="mt-2.5 space-y-2">
            {c.pontos_desenvolver.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[14px] leading-snug text-tinta">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ambar" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Cartao>

        {c.comentario_professor ? (
          <Cartao className="!bg-verde-claro/60">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-verde-escuro">Comentário do professor</h2>
            <p className="mt-1.5 texto-corrido">{c.comentario_professor}</p>
          </Cartao>
        ) : null}

        <Cartao>
          <button
            type="button"
            onClick={() => setVerTexto((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2 text-[14px] font-medium text-tinta">
              <FileText className="size-4 text-tinta-suave" aria-hidden />
              Texto que foi avaliado
            </span>
            <span className="text-[12.5px] text-verde">{verTexto ? 'ocultar' : 'ver'}</span>
          </button>
          {verTexto ? (
            <div className="mt-3 border-t border-borda pt-3">
              <p className="texto-corrido whitespace-pre-wrap text-[14px]">{a.submissao?.transcrito}</p>
            </div>
          ) : null}
        </Cartao>
      </main>
    </>
  )
}
