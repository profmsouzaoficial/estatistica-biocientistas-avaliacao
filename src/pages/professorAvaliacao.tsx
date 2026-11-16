import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, ImageOff, Loader2, Send, Sparkles, Undo2, UploadCloud } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { Link, usarRota } from '../lib/router'
import { Alerta, AppBar, BarraIndeterminada, Botao, Carregando, Cartao, Selo } from '../components/ui'
import { formatarDataHora, formatarNota, formatarPontos } from '../lib/formato'
import { notaParaSiga } from '../lib/types'
import type { Avaliacao, CriterioNota, SubmissaoDoProfessor } from '../lib/types'

function estadoDaSubmissao(item: SubmissaoDoProfessor) {
  const { submissao: s, correcao: c, lancamento: l } = item
  if (!s) return { texto: 'não enviou', tom: 'neutro' as const }
  if (l?.sucesso) return { texto: 'no SIGA', tom: 'verde' as const }
  if (s.status === 'devolvida') return { texto: 'devolvida', tom: 'vermelho' as const }
  if (!c) return { texto: 'a corrigir', tom: 'azul' as const }
  if (c.decisao === 'pendente') return { texto: 'a revisar', tom: 'ambar' as const }
  return { texto: 'a lançar', tom: 'verde' as const }
}

// ---------------------------------------------------------------------------

export function ProfessorAvaliacao({ id }: { id: string }) {
  const { d } = usarSessao()
  const { navegar } = usarRota()

  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null)
  const [itens, setItens] = useState<SubmissaoDoProfessor[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!d) return
    const [av, subs] = await Promise.all([d.avaliacao(id), d.submissoesDaAvaliacao(id)])
    setAvaliacao(av)
    setItens(subs)
  }, [d, id])

  useEffect(() => {
    Promise.resolve()
      .then(carregar)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'))
  }, [carregar])

  const pendentes = useMemo(() => (itens ?? []).filter((i) => !i.correcao), [itens])
  const aRevisar = useMemo(
    () => (itens ?? []).filter((i) => i.correcao && i.correcao.decisao === 'pendente'),
    [itens],
  )
  const aLancar = useMemo(
    () => (itens ?? []).filter((i) => i.correcao && i.correcao.decisao !== 'pendente' && !i.lancamento?.sucesso),
    [itens],
  )

  async function corrigirPendentes() {
    if (!d || pendentes.length === 0) return
    setErro(null)
    setResultado(null)
    let ok = 0
    const falhas: string[] = []
    for (let i = 0; i < pendentes.length; i++) {
      const item = pendentes[i]
      setProgresso(`Corrigindo ${i + 1} de ${pendentes.length} — ${item.aluno.nome_completo.split(' ')[0]}…`)
      try {
        await d.corrigir(item.submissao.id)
        ok++
      } catch (e) {
        falhas.push(`${item.aluno.nome_completo.split(' ')[0]}: ${e instanceof Error ? e.message : 'erro'}`)
      }
    }
    setProgresso(null)
    await carregar()
    setResultado(
      ok > 0
        ? `${ok} correção(ões) geradas${falhas.length ? `; ${falhas.length} falharam` : ''}. Revise antes de liberar.`
        : 'Nenhuma correção foi gerada.',
    )
    if (falhas.length) setErro(falhas.join(' · '))
  }

  async function lancarAprovadas() {
    if (!d || aLancar.length === 0) return
    setErro(null)
    setResultado(null)
    let ok = 0
    const falhas: string[] = []
    for (let i = 0; i < aLancar.length; i++) {
      const item = aLancar[i]
      setProgresso(`Lançando ${i + 1} de ${aLancar.length} no SIGA…`)
      try {
        await d.lancarNoSiga(item.correcao!.id)
        ok++
      } catch (e) {
        falhas.push(`${item.aluno.nome_completo.split(' ')[0]}: ${e instanceof Error ? e.message : 'erro'}`)
      }
    }
    setProgresso(null)
    await carregar()
    setResultado(`${ok} nota(s) lançadas no SIGA${falhas.length ? `; ${falhas.length} falharam` : ''}.`)
    if (falhas.length) setErro(falhas.join(' · '))
  }

  function exportarCsv() {
    if (!itens || !avaliacao) return
    const linhas = [
      ['matricula', 'nome', 'status', 'nota_bruta', 'nota_siga', 'situacao'],
      ...itens.map((i) => {
        const e = estadoDaSubmissao(i)
        return [
          i.aluno.matricula ?? '',
          i.aluno.nome_completo.replace(/;/g, ','),
          e.texto,
          i.correcao ? formatarPontos(i.correcao.nota_bruta) : '',
          i.correcao ? formatarNota(i.correcao.nota_final) : '',
          i.lancamento?.sucesso ? 'lancada' : 'pendente',
        ]
      }),
    ]
    const csv = linhas.map((l) => l.join(';')).join('\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${avaliacao.titulo.replace(/[^\w\-]+/g, '-').toLowerCase()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (erro && !avaliacao) {
    return (
      <>
        <AppBar titulo="Avaliação" />
        <main className="mx-auto max-w-2xl px-4 py-4">
          <Alerta tom="vermelho">{erro}</Alerta>
        </main>
      </>
    )
  }
  if (!avaliacao || !itens) return <Carregando />

  return (
    <>
      <AppBar titulo={avaliacao.titulo} subtitulo={`${avaliacao.valor_total} pontos · ${avaliacao.rubrica.length} critérios`} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-[13px] text-tinta-suave hover:text-verde">
            ← Painel
          </Link>
          <button onClick={exportarCsv} className="inline-flex items-center gap-1 text-[13px] text-verde">
            <Download className="size-3.5" aria-hidden /> CSV
          </button>
        </div>

        {progresso ? (
          <Cartao>
            <BarraIndeterminada>{progresso}</BarraIndeterminada>
          </Cartao>
        ) : null}

        {resultado ? <Alerta tom="verde">{resultado}</Alerta> : null}
        {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}

        <div className="grid grid-cols-3 gap-2.5">
          <Contador rotulo="Enviadas" valor={itens.length} />
          <Contador rotulo="A revisar" valor={aRevisar.length} />
          <Contador rotulo="A lançar" valor={aLancar.length} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Botao
            onClick={corrigirPendentes}
            disabled={pendentes.length === 0 || !!progresso}
            icone={<Sparkles className="size-4" />}
          >
            Corrigir {pendentes.length} pendente(s)
          </Botao>
          <Botao
            variante="secundario"
            onClick={lancarAprovadas}
            disabled={aLancar.length === 0 || !!progresso}
            icone={<UploadCloud className="size-4" />}
          >
            Lançar {aLancar.length} no SIGA
          </Botao>
        </div>

        {avaliacao.descricao_siga ? (
          <p className="px-1 text-[12.5px] text-tinta-suave">
            SIGA: <strong className="font-medium text-tinta">{avaliacao.descricao_siga}</strong> · peso{' '}
            {avaliacao.peso_siga} · conversão automática para 0–10.
          </p>
        ) : (
          <Alerta tom="ambar">
            Esta avaliação não tem descrição do SIGA configurada. Preencha na criação para poder lançar as notas.
          </Alerta>
        )}

        <div className="cartao divide-y divide-borda overflow-hidden">
          {itens.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-tinta-suave">Nenhuma redação enviada ainda.</p>
          ) : (
            itens.map((item) => {
              const e = estadoDaSubmissao(item)
              return (
                <button
                  key={item.submissao.id}
                  type="button"
                  onClick={() => navegar(`/prof/avaliacoes/${id}/revisao/${item.submissao.id}`)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-papel-fundo"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-medium text-tinta">{item.aluno.nome_completo}</p>
                    <p className="text-[12.5px] text-tinta-suave">
                      {item.aluno.matricula} · enviada {item.submissao.enviado_em ? formatarDataHora(item.submissao.enviado_em) : '—'}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Selo tom={e.tom}>{e.texto}</Selo>
                    {item.correcao ? (
                      <span className="text-[13px] tabular-nums text-tinta-suave">
                        {formatarPontos(item.correcao.nota_bruta)}/{avaliacao.valor_total} ·{' '}
                        <strong className="font-semibold text-tinta">{formatarNota(item.correcao.nota_final)}</strong>
                      </span>
                    ) : null}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </main>
    </>
  )
}

function Contador({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="cartao px-3 py-2.5">
      <p className="text-[11.5px] uppercase tracking-wide text-tinta-fraca">{rotulo}</p>
      <p className="mt-1 font-serif text-[22px] leading-none text-tinta">{valor}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------

export function ProfessorRevisao({ avaliacaoId, submissaoId }: { avaliacaoId: string; submissaoId: string }) {
  const { d } = usarSessao()
  const { voltar } = usarRota()

  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null)
  const [item, setItem] = useState<SubmissaoDoProfessor | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  const [criterios, setCriterios] = useState<CriterioNota[]>([])
  const [comentario, setComentario] = useState('')
  const [aba, setAba] = useState<'texto' | 'foto'>('texto')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)

  const carregar = useCallback(async () => {
    if (!d) return
    const [av, subs] = await Promise.all([d.avaliacao(avaliacaoId), d.submissoesDaAvaliacao(avaliacaoId)])
    const achado = subs.find((s) => s.submissao.id === submissaoId) ?? null
    setAvaliacao(av)
    setItem(achado)
    if (achado?.correcao) {
      setCriterios(achado.correcao.criterios.map((c) => ({ ...c })))
      setComentario(achado.correcao.comentario_professor ?? '')
    }
    if (achado?.submissao.foto_path) {
      d.urlDaFoto(achado.submissao.foto_path).then(setFotoUrl).catch(() => setFotoUrl(null))
    }
  }, [d, avaliacaoId, submissaoId])

  useEffect(() => {
    Promise.resolve().then(carregar).catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'))
  }, [carregar])

  const original = item?.correcao?.criterios ?? []
  const notaBruta = criterios.reduce((t, c) => t + Number(c.valor || 0), 0)
  const notaFinal = avaliacao ? notaParaSiga(notaBruta, avaliacao.valor_total) : 0
  const alterado =
    original.length !== criterios.length ||
    criterios.some((c, i) => Math.abs(c.valor - (original[i]?.valor ?? 0)) > 0.001) ||
    comentario.trim() !== (item?.correcao?.comentario_professor ?? '').trim()

  async function aprovar() {
    if (!d || !item?.correcao) return
    setErro(null)
    setOcupado('aprovando')
    try {
      await d.salvarRevisao(item.correcao.id, {
        criterios,
        comentario_professor: comentario.trim() || null,
        decisao: alterado ? 'ajustada' : 'aprovada',
      })
      await carregar()
      setPronto(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar a revisão.')
    } finally {
      setOcupado(null)
    }
  }

  async function lancar() {
    if (!d || !item?.correcao) return
    setErro(null)
    setOcupado('lancando')
    try {
      await d.lancarNoSiga(item.correcao.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao lançar no SIGA.')
    } finally {
      setOcupado(null)
    }
  }

  async function devolver() {
    if (!d || !item?.correcao) return
    setErro(null)
    setOcupado('devolvendo')
    try {
      await d.salvarRevisao(item.correcao.id, {
        criterios,
        comentario_professor: comentario.trim() || 'Reenviar com os ajustes indicados.',
        decisao: 'rejeitada',
      })
      voltar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao devolver.')
    } finally {
      setOcupado(null)
    }
  }

  if (!item || !avaliacao) return <Carregando />

  const aprovada = item.correcao?.decisao === 'aprovada' || item.correcao?.decisao === 'ajustada'
  const lancada = item.lancamento?.sucesso

  return (
    <>
      <AppBar titulo={item.aluno.nome_completo} subtitulo={`Matrícula ${item.aluno.matricula ?? '—'}`} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-32">
        <button onClick={voltar} className="text-[13px] text-tinta-suave hover:text-verde">
          ← Voltar para a lista
        </button>

        {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}
        {pronto && aprovada ? <Alerta tom="verde">Revisão salva. A devolutiva já aparece para o aluno.</Alerta> : null}
        {lancada ? (
          <Alerta tom="verde" titulo="Lançada no SIGA">
            Nota {formatarNota(item.lancamento!.nota)} registrada em {formatarDataHora(item.lancamento!.criado_em)}.
          </Alerta>
        ) : null}

        <div className="flex gap-1 rounded-xl bg-papel-fundo p-1">
          {(['texto', 'foto'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setAba(t)}
              className={`flex-1 rounded-lg py-1.5 text-[13.5px] font-medium transition-colors ${
                aba === t ? 'bg-white text-tinta shadow-sm' : 'text-tinta-suave'
              }`}
            >
              {t === 'texto' ? 'Transcrição' : 'Foto original'}
            </button>
          ))}
        </div>

        <Cartao>
          {aba === 'texto' ? (
            <p className="texto-corrido max-h-[45vh] overflow-y-auto whitespace-pre-wrap text-[14px]">
              {item.submissao.transcrito}
            </p>
          ) : fotoUrl ? (
            <img src={fotoUrl} alt="Foto da redação" className="w-full rounded-lg" />
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-tinta-fraca">
              <ImageOff className="size-6" aria-hidden />
              <p className="text-[13px]">Foto indisponível.</p>
            </div>
          )}
        </Cartao>

        {!item.correcao ? (
          <Alerta tom="ambar" titulo="Ainda sem correção da IA">
            Gere a correção pela lista da avaliação para ver a sugestão de nota por critério.
          </Alerta>
        ) : (
          <>
            <Cartao>
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-[16px] text-tinta">Nota por critério</h2>
                <p className="text-[13px] text-tinta-suave">
                  <strong className="font-semibold text-tinta">{formatarPontos(notaBruta)}</strong> /{' '}
                  {formatarPontos(avaliacao.valor_total)} · SIGA <strong className="font-semibold text-tinta">{formatarNota(notaFinal)}</strong>
                </p>
              </div>
              <p className="mt-1 text-[12.5px] leading-snug text-tinta-suave">
                Ajuste os valores se discordar da sugestão. A nota final é sempre a soma dos critérios.
              </p>

              <ul className="mt-3 space-y-3">
                {criterios.map((c, i) => {
                  const max = avaliacao.rubrica.find((r) => r.id === c.id)?.valor ?? 0
                  return (
                    <li key={c.id} className="rounded-xl border border-borda p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[14px] font-medium text-tinta">{c.nome}</p>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max={max}
                            step="0.1"
                            value={c.valor}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(max, Number(e.target.value)))
                              setCriterios((atual) => atual.map((x, k) => (k === i ? { ...x, valor: v } : x)))
                            }}
                            className="w-16 rounded-lg border border-borda px-2 py-1 text-center text-[14px] tabular-nums"
                          />
                          <span className="text-[12.5px] text-tinta-suave">/ {formatarPontos(max)}</span>
                        </div>
                      </div>
                      <p className="mt-1 text-[12.5px] leading-snug text-tinta-suave">{c.justificativa}</p>
                    </li>
                  )
                })}
              </ul>
            </Cartao>

            <div className="grid gap-3 sm:grid-cols-2">
              <Cartao>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-verde">Pontos fortes</h3>
                <ul className="mt-1.5 space-y-1.5 text-[13.5px] leading-snug text-tinta">
                  {item.correcao.pontos_fortes.map((p, i) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              </Cartao>
              <Cartao>
                <h3 className="text-[12px] font-semibold uppercase tracking-wide text-ambar">A desenvolver</h3>
                <ul className="mt-1.5 space-y-1.5 text-[13.5px] leading-snug text-tinta">
                  {item.correcao.pontos_desenvolver.map((p, i) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              </Cartao>
            </div>

            {item.correcao.comentario_ia ? (
              <p className="px-1 text-[12.5px] italic leading-snug text-tinta-fraca">
                Gerada por {item.correcao.modelo} · confiança {item.correcao.confianca ?? '—'}
              </p>
            ) : null}

            <Cartao>
              <label className="rotulo" htmlFor="comentario">
                Comentário do professor (aparece para o aluno)
              </label>
              <textarea
                id="comentario"
                className="campo min-h-20"
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Opcional. Use para personalizar a devolutiva."
              />
            </Cartao>

            <div className="space-y-2">
              {!lancada ? (
                <Botao
                  largo
                  onClick={aprovar}
                  carregando={ocupado === 'aprovando'}
                  icone={<CheckCircle2 className="size-4" />}
                >
                  {alterado ? 'Salvar ajustes e liberar' : 'Aprovar e liberar para o aluno'}
                </Botao>
              ) : null}
              {aprovada && !lancada ? (
                <Botao
                  largo
                  variante="secundario"
                  onClick={lancar}
                  carregando={ocupado === 'lancando'}
                  icone={ocupado === 'lancando' ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                >
                  Lançar {formatarNota(notaFinal)} no SIGA
                </Botao>
              ) : null}
              {!aprovada ? (
                <Botao
                  largo
                  variante="fantasma"
                  onClick={devolver}
                  carregando={ocupado === 'devolvendo'}
                  icone={<Undo2 className="size-4" />}
                >
                  Devolver para o aluno reescrever
                </Botao>
              ) : null}
            </div>
          </>
        )}
      </main>
    </>
  )
}
