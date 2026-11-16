import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  Download,
  Eye,
  ImageOff,
  Loader2,
  Lock,
  Pencil,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  Undo2,
  Unlock,
  UploadCloud,
} from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { Link, usarRota } from '../lib/router'
import { Alerta, AppBar, BarraIndeterminada, Botao, Campo, Carregando, Cartao, Selo } from '../components/ui'
import { atrasoDeEntrega, formatarData, formatarDataHora, formatarNota, formatarPontos, plural } from '../lib/formato'
import { notaParaSiga } from '../lib/types'
import type {
  Avaliacao,
  AvaliacaoSiga,
  CriterioNota,
  Esperado,
  QuadroNotasSiga,
  SubmissaoDoProfessor,
  Turma,
} from '../lib/types'
import { api } from '../lib/servidor'
import { acharAvaliacaoSiga, divergenciaDePeso } from '../lib/siga'

/**
 * Escala em que o SIGA recebe a nota. Quem manda é o servidor (SIGA_ESCALA, em
 * `api/_lib/siga.ts`): 'nota10' converte para 0–10 e 'pontos' manda a nota bruta da
 * rubrica. A tela mostra exatamente o número que será gravado.
 */
function usarEscalaSiga(d: ReturnType<typeof usarSessao>['d']): 'nota10' | 'pontos' {
  const [escala, setEscala] = useState<'nota10' | 'pontos'>('nota10')
  useEffect(() => {
    if (!d) return
    d.saude()
      .then((s) => {
        if (s?.siga.escala) setEscala(s.siga.escala)
      })
      .catch(() => {})
  }, [d])
  return escala
}

/**
 * Número que vai ao SIGA. Em pontos, a nota é proporcional ao PESO da avaliação
 * no SIGA — é a mesma conta que o servidor faz em api/siga/lancar.ts.
 */
function notaParaSigaNaEscala(
  escala: 'nota10' | 'pontos',
  bruta: number,
  total: number,
  peso: number,
): number {
  if (escala !== 'pontos') return notaParaSiga(bruta, total)
  const denominador = total > 0 ? total : 0
  const alvo = peso > 0 ? peso : total
  return denominador > 0 ? Math.round((bruta / denominador) * alvo * 100) / 100 : 0
}

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
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [prazoNovo, setPrazoNovo] = useState('')
  const [prazoEmEdicao, setPrazoEmEdicao] = useState(false)
  const [confirmandoLancamento, setConfirmandoLancamento] = useState(false)
  const [turma, setTurma] = useState<Turma | null>(null)
  const [sigaTem, setSigaTem] = useState<boolean | null>(null)
  const [avalSiga, setAvalSiga] = useState<AvaliacaoSiga | null>(null)
  const [quadroSiga, setQuadroSiga] = useState<QuadroNotasSiga | null>(null)
  const [conferindo, setConferindo] = useState(false)
  const [erroQuadro, setErroQuadro] = useState<string | null>(null)
  const [lidoEm, setLidoEm] = useState<Date | null>(null)
  const [criandoSiga, setCriandoSiga] = useState(false)
  const [erroSiga, setErroSiga] = useState<string | null>(null)
  // Exclusão da avaliação (só quando ninguém enviou e nada foi ao SIGA)
  const [pedindoExclusao, setPedindoExclusao] = useState(false)
  const [tituloConfirmado, setTituloConfirmado] = useState('')
  const [erroExclusao, setErroExclusao] = useState<string | null>(null)
  // Quem está na lista da turma e ainda não enviou — o professor precisa disso
  // antes de fechar o prazo, não depois.
  const [esperados, setEsperados] = useState<Esperado[]>([])
  // A escala do SIGA vem do servidor (SIGA_ESCALA); 0–10 é o padrão.
  const escalaSiga = usarEscalaSiga(d)

  const carregar = useCallback(async () => {
    if (!d) return
    const [av, subs] = await Promise.all([d.avaliacao(id), d.submissoesDaAvaliacao(id)])
    setAvaliacao(av)
    setItens(subs)
    if (av) {
      d.alunosDaTurma(av.turma_id).then(setEsperados).catch(() => setEsperados([]))
      const turmas = await d.turmasTodas().catch(() => [])
      const achada = turmas.find((t) => t.id === av.turma_id) ?? null
      setTurma(achada)
      // A avaliação precisa existir no SIGA antes de receber notas. Consulta a
      // lista oficial para saber se já existe; sem SIGA configurado, não mostra nada.
      if (achada?.codigo_siga && av.descricao_siga && d.modo === 'supabase') {
        try {
          const r = await api<{ avaliacoes: AvaliacaoSiga[] }>(
            `/siga/avaliacoes?turma=${encodeURIComponent(achada.codigo_siga)}&periodo=${encodeURIComponent(achada.periodo)}`,
          )
          const encontrada = acharAvaliacaoSiga(r.avaliacoes, av.descricao_siga)
          setAvalSiga(encontrada)
          setSigaTem(encontrada ? true : false)
          setErroSiga(null)
        } catch {
          setSigaTem(null)
          setAvalSiga(null)
          setErroSiga(null)
        }
      }
    }
  }, [d, id])

  useEffect(() => {
    Promise.resolve()
      .then(carregar)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'))
  }, [carregar])

  const pesoDivergente = divergenciaDePeso(avalSiga, avaliacao?.peso_siga)

  async function alinharPesoComSiga() {
    if (!d || !avaliacao || !pesoDivergente) return
    setErro(null)
    setResultado(null)
    setOcupado('peso')
    try {
      await d.mudarPesoSigaAvaliacao(avaliacao.id, pesoDivergente.pesoSiga)
      await carregar()
      setResultado(
        `Peso alinhado com o SIGA (${formatarPontos(pesoDivergente.pesoSiga)} pontos). As próximas notas já saem na escala certa.`,
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível mudar o peso.')
    } finally {
      setOcupado(null)
    }
  }

  const pendentes = useMemo(() => (itens ?? []).filter((i) => !i.correcao), [itens])
  const aRevisar = useMemo(
    () => (itens ?? []).filter((i) => i.correcao && i.correcao.decisao === 'pendente'),
    [itens],
  )
  // "A lançar" é só o que o professor aprovou (ou ajustou e aprovou). Uma
  // correção rejeitada — devolvida ao aluno — não pode entrar na fila do SIGA:
  // o servidor recusaria com 409, mas o botão estaria mentindo.
  const aLancar = useMemo(
    () =>
      (itens ?? []).filter(
        (i) =>
          i.correcao &&
          (i.correcao.decisao === 'aprovada' || i.correcao.decisao === 'ajustada') &&
          !i.lancamento?.sucesso,
      ),
    [itens],
  )

  const faltam = useMemo(() => {
    if (!esperados.length) return []
    const entregaram = new Set((itens ?? []).map((i) => i.aluno.matricula).filter(Boolean) as string[])
    return esperados.filter((e) => !entregaram.has(e.matricula))
  }, [esperados, itens])

  async function mudarStatus(novo: 'publicada' | 'encerrada') {
    if (!d) return
    setErro(null)
    setResultado(null)
    setOcupado('status')
    try {
      await d.mudarStatusAvaliacao(id, novo)
      await carregar()
      setResultado(
        novo === 'encerrada'
          ? 'Entregas encerradas. Os alunos continuam vendo a devolutiva; ninguém abre entrega nova.'
          : 'Entregas reabertas: a avaliação voltou a aceitar envios.',
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível mudar o estado da avaliação.')
    } finally {
      setOcupado(null)
    }
  }

  /** Valor do <input datetime-local>: data e hora locais, sem fuso. */
  function paraInputLocal(iso: string | null): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }

  async function salvarPrazo(novo: string) {
    if (!d) return
    setErro(null)
    setResultado(null)
    setOcupado('prazo')
    try {
      await d.mudarPrazoAvaliacao(id, novo ? new Date(novo).toISOString() : null)
      await carregar()
      setPrazoEmEdicao(false)
      setResultado(
        novo
          ? 'Prazo atualizado. Quem já enviou continua enviado; quem não enviou passa a poder entregar até a nova data.'
          : 'Prazo removido: a avaliação passa a aceitar entregas sem data limite.',
      )
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o prazo.')
    } finally {
      setOcupado(null)
    }
  }

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

  async function criarNoSiga() {
    if (!d || !avaliacao) return
    setCriandoSiga(true)
    setErroSiga(null)
    setResultado(null)
    try {
      await api('/siga/avaliacao', { avaliacao_id: avaliacao.id })
      setSigaTem(true)
      setResultado('Avaliação criada no SIGA. Agora as notas podem ser lançadas.')
    } catch (e) {
      setErroSiga(e instanceof Error ? e.message : 'O SIGA não aceitou criar a avaliação.')
    } finally {
      setCriandoSiga(false)
    }
  }

  async function lancarAprovadas() {
    setConfirmandoLancamento(false)
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

  async function conferirNoSiga() {
    if (!turma || !d) return
    setConferindo(true)
    setErroQuadro(null)
    try {
      const q = await d.notasDoSiga(turma.codigo_siga, turma.periodo)
      setQuadroSiga(q)
      setLidoEm(new Date())
    } catch (e) {
      setErroQuadro(e instanceof Error ? e.message : 'Não consegui ler o quadro do SIGA.')
    } finally {
      setConferindo(false)
    }
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
  async function excluirAvaliacao() {
    if (!d || !avaliacao) return
    setOcupado('excluindo')
    setErroExclusao(null)
    try {
      const r = await d.apagarAvaliacao(id)
      if (!r.ok) {
        setErroExclusao(
          r.motivo === 'tem_submissoes'
            ? `Esta avaliação tem ${plural(r.submissoes ?? 0, 'redação enviada', 'redações enviadas')}. Apagar tiraria a entrega do aluno, então o app não deixa — encerre as entregas e crie outra avaliação.`
            : r.motivo === 'tem_lancamentos'
              ? `Esta avaliação já tem ${plural(r.lancadas ?? 0, 'nota lançada', 'notas lançadas')} no SIGA. Apagar apagaria o histórico do lançamento.`
              : r.motivo === 'sem_permissao'
                ? 'Só o professor pode apagar uma avaliação.'
                : 'Esta avaliação não existe mais. Atualize a página.',
        )
        return
      }
      navegar('/')
    } catch (e) {
      setErroExclusao(e instanceof Error ? e.message : 'Falha ao excluir a avaliação.')
    } finally {
      setOcupado(null)
    }
  }

  if (!avaliacao || !itens) return <Carregando />

  /**
   * Compara o que o app enviou (lançamentos) com o que o SIGA mostra na coluna da
   * avaliação. É a conferência que fecha o ciclo: enviado ≠ gravado é o erro que
   * mais dói, porque o aluno fica sem nota e ninguém percebe.
   */
  const conferencia = (() => {
    if (!quadroSiga || !avaliacao.descricao_siga) return []
    const coluna = avaliacao.descricao_siga
    const porMatricula = new Map(quadroSiga.alunos.map((a) => [a.matricula, a]))
    return itens
      .filter((i) => i.submissao)
      .map((i) => {
        const aluno = porMatricula.get(i.aluno.matricula ?? '')
        const noSiga = aluno?.notas?.[coluna] ?? null
        const enviada = i.lancamento?.sucesso ? i.lancamento.nota : null
        const situacao: 'igual' | 'diferente' | 'sumiu' | 'a_lancar' | 'so_no_siga' =
          enviada == null && noSiga == null
            ? 'a_lancar'
            : enviada == null
              ? 'so_no_siga'
              : noSiga == null
                ? 'sumiu'
                : Math.abs(Number(noSiga) - Number(enviada)) <= 0.01
                  ? 'igual'
                  : 'diferente'
        return {
          id: i.submissao!.id,
          nome: i.aluno.nome_completo,
          matricula: i.aluno.matricula ?? '—',
          enviada,
          noSiga: noSiga == null ? null : Number(noSiga),
          situacao,
        }
      })
  })()

  return (
    <>
      <AppBar titulo={avaliacao.titulo} subtitulo={`${avaliacao.valor_total} pontos · ${avaliacao.rubrica.length} critérios`} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-[13px] text-tinta-suave hover:text-verde">
            ← Painel
          </Link>
          <button onClick={exportarCsv} className="alvo-toque gap-1 text-[13px] text-verde">
            <Download className="size-3.5" aria-hidden /> CSV
          </button>
        </div>

        <Cartao className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <div className="flex items-center gap-2">
            <Selo tom={avaliacao.status === 'publicada' ? 'verde' : avaliacao.status === 'encerrada' ? 'neutro' : 'ambar'}>
              {avaliacao.status === 'publicada' ? 'recebendo entregas' : avaliacao.status === 'encerrada' ? 'entregas encerradas' : 'rascunho'}
            </Selo>
            <span className="text-[12.5px] text-tinta-suave">
              {avaliacao.status === 'publicada'
                ? 'O aluno vê o tema e pode enviar.'
                : avaliacao.status === 'encerrada'
                  ? 'O aluno vê a devolutiva, mas não abre entrega nova.'
                  : 'O aluno ainda não vê esta avaliação.'}
            </span>
          </div>
          {avaliacao.status === 'publicada' ? (
            <button
              type="button"
              onClick={() => mudarStatus('encerrada')}
              disabled={ocupado === 'status'}
              className="alvo-toque gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] font-medium text-tinta-suave disabled:opacity-50"
            >
              <Lock className="size-3.5" aria-hidden /> Encerrar entregas
            </button>
          ) : (
            <button
              type="button"
              onClick={() => mudarStatus('publicada')}
              disabled={ocupado === 'status'}
              className="inline-flex items-center gap-1 rounded-lg border border-verde/30 px-2.5 py-1 text-[12.5px] font-medium text-verde disabled:opacity-50"
            >
              {avaliacao.status === 'encerrada' ? <Unlock className="size-3.5" aria-hidden /> : <Eye className="size-3.5" aria-hidden />}
              {avaliacao.status === 'encerrada' ? 'Reabrir entregas' : 'Publicar para os alunos'}
            </button>
          )}
        </Cartao>

        <Cartao className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-tinta-suave" aria-hidden />
              <h2 className="text-[14px] font-medium text-tinta">Prazo de entrega</h2>
            </div>
            <span className="text-[12.5px] text-tinta-suave">
              {avaliacao.prazo_em ? `até ${formatarDataHora(avaliacao.prazo_em)}` : 'sem prazo definido'}
            </span>
          </div>
          {prazoEmEdicao ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-[12.5px] text-tinta-suave">Nova data e hora</span>
                <input
                  type="datetime-local"
                  className="campo"
                  value={prazoNovo}
                  onChange={(e) => setPrazoNovo(e.target.value)}
                />
              </label>
              <Botao
                type="button"
                onClick={() => salvarPrazo(prazoNovo)}
                carregando={ocupado === 'prazo'}
                disabled={!prazoNovo || ocupado === 'prazo'}
              >
                Salvar prazo
              </Botao>
              <button
                type="button"
                onClick={() => setPrazoEmEdicao(false)}
                className="pb-2 text-[12.5px] text-tinta-suave hover:text-tinta"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPrazoNovo(paraInputLocal(avaliacao.prazo_em))
                  setPrazoEmEdicao(true)
                }}
                className="alvo-toque gap-1 rounded-lg border border-borda px-2.5 text-[12.5px] font-medium text-tinta-suave"
              >
                <CalendarClock className="size-3.5" aria-hidden />
                {avaliacao.prazo_em ? 'Estender ou mudar o prazo' : 'Definir um prazo'}
              </button>
              {avaliacao.prazo_em ? (
                <button
                  type="button"
                  onClick={() => salvarPrazo('')}
                  disabled={ocupado === 'prazo'}
                  className="alvo-toque px-1 text-[12.5px] text-tinta-suave underline-offset-2 hover:text-tinta hover:underline disabled:opacity-50"
                >
                  Remover prazo
                </button>
              ) : null}
            </div>
          )}
          <p className="text-[12.5px] leading-snug text-tinta-fraca">
            Depois do prazo o aluno não abre entrega nova. Mudar a data reabre o envio para quem faltou —
            não altera redação já enviada nem nota já lançada.
          </p>
        </Cartao>

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

        {esperados.length > 0 ? (
          <Cartao className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] text-tinta-suave">
                <strong className="font-medium text-tinta">{itens.length}</strong> de {esperados.length} alunos
                da turma entregaram
              </p>
              {faltam.length === 0 ? (
                <span className="rounded-lg bg-verde-claro px-2 py-1 text-[11.5px] font-medium text-verde-escuro">
                  todos entregaram
                </span>
              ) : null}
            </div>
            {faltam.length > 0 ? (
              <details className="group">
                <summary className="alvo-toque cursor-pointer justify-start text-[13px] text-vermelho">
                  Faltam {faltam.length}: {faltam.slice(0, 2).map((e) => e.nome_completo.split(' ')[0]).join(', ')}
                  {faltam.length > 2 ? ` e mais ${faltam.length - 2}` : ''}
                </summary>
                <ul className="mt-2 space-y-1.5">
                  {faltam.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="text-tinta">{e.nome_completo}</span>
                      <span className="shrink-0 font-mono text-[11.5px] text-tinta-fraca">
                        {e.matricula}
                        {e.user_id ? '' : ' · sem cadastro'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[12px] leading-snug text-tinta-fraca">
                  Quem não entregou fica sem nota nesta avaliação. Para abrir uma segunda chance, estenda o
                  prazo abaixo — o aluno vê o botão de envio de novo.
                </p>
              </details>
            ) : null}
          </Cartao>
        ) : null}

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
            onClick={() => setConfirmandoLancamento(true)}
            disabled={aLancar.length === 0 || !!progresso || confirmandoLancamento || !avaliacao.descricao_siga}
            icone={<UploadCloud className="size-4" />}
          >
            Lançar {aLancar.length} no SIGA
          </Botao>
        </div>

        {confirmandoLancamento ? (
          <Alerta tom="ambar" titulo={`Confirmar ${aLancar.length} lançamento(s)?`}>
            <p className="text-[13.5px] leading-snug">
              Vai gravar <strong>{aLancar.length} nota(s)</strong> em{' '}
              <strong>{avaliacao.descricao_siga ?? 'avaliação sem descrição no SIGA'}</strong>
              {turma ? ` · turma ${turma.codigo_siga}` : ''}. Depois do envio, a nota aparece no SIGA
              e não há como desfazer por aqui — confira a lista antes.
            </p>
            {aLancar.length ? (
              <ul className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg bg-white/70 px-2.5 py-2 text-[12.5px] text-tinta">
                {aLancar.slice(0, 10).map((i) => (
                  <li key={i.submissao.id} className="flex items-baseline justify-between gap-3">
                    <span className="truncate">
                      {i.aluno.nome_completo}
                      <span className="text-tinta-fraca"> · {i.aluno.matricula}</span>
                    </span>
                    <strong className="shrink-0 font-semibold tabular-nums">
                      {i.correcao
                        ? formatarNota(
                            notaParaSigaNaEscala(
                              escalaSiga,
                              i.correcao.nota_bruta,
                              avaliacao.valor_total,
                              avaliacao.peso_siga,
                            ),
                          )
                        : '—'}
                    </strong>
                  </li>
                ))}
              </ul>
            ) : null}
            {aLancar.length > 10 ? (
              <p className="mt-1 text-[12px] text-tinta-suave">… e mais {aLancar.length - 10}.</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              <Botao onClick={lancarAprovadas} carregando={!!progresso}>
                Confirmar lançamento
              </Botao>
              <Botao variante="secundario" onClick={() => setConfirmandoLancamento(false)}>
                Cancelar
              </Botao>
            </div>
          </Alerta>
        ) : null}

        {pendentes.length > 0 ? (
          <p className="px-1 text-[12.5px] leading-snug text-tinta-fraca">
            Cada correção com o modelo em CPU leva de 45 a 90 s. Se a conexão cair no meio, a redação
            continua pendente: dá para tentar de novo, corrigir à mão ou rodar o lote no servidor do
            modelo (<code className="rounded bg-papel-fundo px-1">pnpm corrigir:lote</code>), que não depende
            do limite de tempo da hospedagem.
          </p>
        ) : null}

        {avaliacao.descricao_siga ? (
          <div className="space-y-2">
            <p className="px-1 text-[12.5px] text-tinta-suave">
              SIGA: <strong className="font-medium text-tinta">{avaliacao.descricao_siga}</strong> · peso{' '}
              {avaliacao.peso_siga}
              {pesoDivergente ? (
                <span className="text-ambar"> (no SIGA: {formatarPontos(pesoDivergente.pesoSiga)})</span>
              ) : null}{' '}
              ·{' '}
              {escalaSiga === 'pontos'
                ? `nota enviada em pontos (0 a ${formatarPontos(avaliacao.peso_siga)})`
                : 'nota enviada de 0 a 10'}.
            </p>
            {pesoDivergente ? (
              <Alerta tom="ambar" titulo="O peso aqui não é o peso do SIGA">
                <p className="text-[13.5px] leading-snug">
                  No SIGA, <strong>{avaliacao.descricao_siga}</strong> vale{' '}
                  <strong>{formatarPontos(pesoDivergente.pesoSiga)} pontos</strong>; aqui a avaliação está
                  marcada com peso <strong>{formatarPontos(pesoDivergente.pesoApp)}</strong>.{' '}
                  {escalaSiga === 'pontos' ? (
                    <>
                      A nota máxima ({formatarPontos(avaliacao.valor_total)}/
                      {formatarPontos(avaliacao.valor_total)}) seria enviada como{' '}
                      <strong>{formatarPontos(pesoDivergente.pesoApp)}</strong>; com o peso do SIGA, iria como{' '}
                      <strong>{formatarPontos(pesoDivergente.pesoSiga)}</strong>.
                    </>
                  ) : (
                    <>
                      As notas saem daqui de 0 a 10 e o SIGA espera a escala desta avaliação — confira a
                      variável <code className="font-mono text-[12.5px]">SIGA_ESCALA</code> no servidor.
                    </>
                  )}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Botao
                    type="button"
                    onClick={alinharPesoComSiga}
                    carregando={ocupado === 'peso'}
                    disabled={ocupado === 'peso'}
                  >
                    Usar o peso do SIGA ({formatarPontos(pesoDivergente.pesoSiga)})
                  </Botao>
                  <span className="text-[12.5px] text-tinta-suave">não muda nota já lançada</span>
                </div>
              </Alerta>
            ) : null}
            {sigaTem === false ? (
              <Alerta tom="ambar" titulo="Esta avaliação ainda não existe no SIGA">
                <p className="text-[13.5px] leading-snug">
                  Sem ela, o SIGA recusa as notas. Será criada em{' '}
                  <strong>{turma?.codigo_siga ?? 'turma'}</strong> com a descrição{' '}
                  <strong>{avaliacao.descricao_siga}</strong>, peso <strong>{avaliacao.peso_siga}</strong> e data{' '}
                  <strong>{avaliacao.data_siga ? formatarData(avaliacao.data_siga) : 'de hoje'}</strong>.
                </p>
                <div className="mt-2">
                  <Botao onClick={criarNoSiga} carregando={criandoSiga} icone={<UploadCloud className="size-4" />}>
                    Criar no SIGA
                  </Botao>
                </div>
                {erroSiga ? <p className="mt-2 text-[13px] leading-snug">{erroSiga}</p> : null}
              </Alerta>
            ) : null}
          </div>
        ) : (
          <Alerta tom="ambar">
            Esta avaliação não tem descrição do SIGA configurada. Preencha na criação para poder lançar as notas.
          </Alerta>
        )}

        {avaliacao.descricao_siga && turma ? (
          <Cartao>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-verde">O que já está no SIGA</p>
              {lidoEm ? (
                <span className="shrink-0 text-[11.5px] text-tinta-fraca">
                  lido às {lidoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-tinta-suave">
              Lê o quadro de <strong className="font-medium text-tinta">{turma.codigo_siga}</strong> na API do
              SIGA e compara com o que o app enviou. É só leitura — nada é alterado.
            </p>
            {erroQuadro ? (
              <p className="mt-2 text-[13px] leading-snug text-vermelho">{erroQuadro}</p>
            ) : null}
            {!quadroSiga ? (
              <div className="mt-3">
                <Botao
                  variante="secundario"
                  largo
                  onClick={conferirNoSiga}
                  carregando={conferindo}
                  icone={<RefreshCw className="size-4" />}
                >
                  Conferir agora
                </Botao>
              </div>
            ) : conferencia.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-tinta-suave">Nenhuma redação enviada nesta avaliação ainda.</p>
            ) : (
              <>
                <ul className="mt-3 divide-y divide-borda">
                  {conferencia.map((l) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] text-tinta">{l.nome}</p>
                        <p className="text-[11.5px] text-tinta-fraca">
                          {l.matricula} · app {l.enviada == null ? '—' : formatarNota(l.enviada)} · SIGA{' '}
                          {l.noSiga == null ? '—' : formatarNota(l.noSiga)}
                        </p>
                      </div>
                      {l.situacao === 'igual' ? (
                        <Selo tom="verde">
                          <CheckCircle2 className="size-3.5" aria-hidden /> confere
                        </Selo>
                      ) : l.situacao === 'diferente' ? (
                        <Selo tom="ambar">diverge</Selo>
                      ) : l.situacao === 'sumiu' ? (
                        <Selo tom="vermelho">não chegou</Selo>
                      ) : l.situacao === 'so_no_siga' ? (
                        <Selo tom="ambar">só no SIGA</Selo>
                      ) : (
                        <Selo tom="neutro">a lançar</Selo>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-3">
                  <Botao
                    variante="secundario"
                    largo
                    onClick={conferirNoSiga}
                    carregando={conferindo}
                    icone={<RefreshCw className="size-4" />}
                  >
                    Conferir de novo
                  </Botao>
                </div>
              </>
            )}
          </Cartao>
        ) : null}

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
                      {atrasoDeEntrega(item.submissao.enviado_em, avaliacao.prazo_em) ? (
                        <span className="font-medium text-ambar"> · fora do prazo</span>
                      ) : null}
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

        <Cartao>
          <div className="flex items-start gap-2">
            <Trash2 className="mt-0.5 size-4 shrink-0 text-tinta-suave" aria-hidden />
            <div>
              <h2 className="text-[14px] font-medium text-tinta">Excluir esta avaliação</h2>
              <p className="mt-1 text-[12.5px] leading-relaxed text-tinta-suave">
                Apaga a avaliação, as instruções e a rubrica. Não dá para desfazer e não pode ser feito
                se alguém já enviou redação ou se alguma nota já foi ao SIGA.
              </p>
            </div>
          </div>

          {erroExclusao ? <Alerta tom="vermelho">{erroExclusao}</Alerta> : null}

          {itens.length > 0 ? (
            <Alerta tom="ambar">
              Há {plural(itens.length, 'redação enviada', 'redações enviadas')} — a avaliação não pode ser
              excluída.
            </Alerta>
          ) : pedindoExclusao ? (
            <div className="space-y-3">
              <Campo
                rotulo={`Digite "${avaliacao.titulo}" para confirmar`}
                value={tituloConfirmado}
                onChange={(e) => setTituloConfirmado(e.target.value)}
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-2">
                <Botao
                  variante="perigo"
                  onClick={excluirAvaliacao}
                  carregando={ocupado === 'excluindo'}
                  disabled={tituloConfirmado.trim() !== avaliacao.titulo.trim()}
                  icone={<Trash2 className="size-4" />}
                >
                  Excluir definitivamente
                </Botao>
                <Botao
                  variante="secundario"
                  onClick={() => {
                    setPedindoExclusao(false)
                    setTituloConfirmado('')
                    setErroExclusao(null)
                  }}
                >
                  Cancelar
                </Botao>
              </div>
            </div>
          ) : (
            <Botao variante="secundario" onClick={() => setPedindoExclusao(true)} icone={<Trash2 className="size-4" />}>
              Quero excluir…
            </Botao>
          )}
        </Cartao>
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

/** "um por linha" -> lista; aceita marcadores (-, •, *) digitados por hábito. */
function emLinhas(texto: string): string[] {
  return texto
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 6)
}

export function ProfessorRevisao({ avaliacaoId, submissaoId }: { avaliacaoId: string; submissaoId: string }) {
  const { d } = usarSessao()
  const { voltar } = usarRota()

  const [avaliacao, setAvaliacao] = useState<Avaliacao | null>(null)
  const [item, setItem] = useState<SubmissaoDoProfessor | null>(null)
  const [fotoUrl, setFotoUrl] = useState<string | null>(null)
  // A foto vem de uma URL assinada e temporária. Se a rede falhar ou o link
  // vencer, o professor precisa saber a diferença entre "não tem foto",
  // "está abrindo" e "não deu para abrir" — antes disso, os três viravam a
  // mesma tela vazia.
  const [fotoEstado, setFotoEstado] = useState<'carregando' | 'ok' | 'sem-foto' | 'erro'>('carregando')
  const [criterios, setCriterios] = useState<CriterioNota[]>([])
  const [comentario, setComentario] = useState('')
  const [fortes, setFortes] = useState('')
  const [desenvolver, setDesenvolver] = useState('')
  const [aba, setAba] = useState<'texto' | 'foto'>('texto')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const escalaSiga = usarEscalaSiga(d)
  const [pronto, setPronto] = useState(false)


  const abrirFoto = useCallback(
    async (caminho: string | null) => {
      if (!d) return
      if (!caminho) {
        setFotoUrl(null)
        setFotoEstado('sem-foto')
        return
      }
      setFotoEstado('carregando')
      setFotoUrl(null)
      try {
        const url = await d.urlDaFoto(caminho)
        if (!url) {
          setFotoEstado('erro')
          return
        }
        setFotoUrl(url)
        setFotoEstado('ok')
      } catch {
        setFotoEstado('erro')
      }
    },
    [d],
  )

  const carregar = useCallback(async () => {
    if (!d) return
    const [av, subs] = await Promise.all([d.avaliacao(avaliacaoId), d.submissoesDaAvaliacao(avaliacaoId)])
    const achado = subs.find((s) => s.submissao.id === submissaoId) ?? null
    setAvaliacao(av)
    setItem(achado)
    if (achado?.correcao) {
      setCriterios(achado.correcao.criterios.map((c) => ({ ...c })))
      setComentario(achado.correcao.comentario_professor ?? '')
      setFortes(achado.correcao.pontos_fortes.join('\n'))
      setDesenvolver(achado.correcao.pontos_desenvolver.join('\n'))
    }
    await abrirFoto(achado?.submissao.foto_path ?? null)
  }, [d, avaliacaoId, submissaoId, abrirFoto])

  useEffect(() => {
    Promise.resolve().then(carregar).catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'))
  }, [carregar])

  const original = item?.correcao?.criterios ?? []
  const notaBruta = criterios.reduce((t, c) => t + Number(c.valor || 0), 0)
  const notaFinal = avaliacao ? notaParaSiga(notaBruta, avaliacao.valor_total) : 0
  const fortesOriginal = (item?.correcao?.pontos_fortes ?? []).join('\n')
  const desenvolverOriginal = (item?.correcao?.pontos_desenvolver ?? []).join('\n')
  const alterado =
    original.length !== criterios.length ||
    criterios.some((c, i) => Math.abs(c.valor - (original[i]?.valor ?? 0)) > 0.001) ||
    comentario.trim() !== (item?.correcao?.comentario_professor ?? '').trim() ||
    fortes.trim() !== fortesOriginal.trim() ||
    desenvolver.trim() !== desenvolverOriginal.trim()

  async function corrigirAMao() {
    if (!d || !item) return
    setErro(null)
    setOcupado('manual')
    try {
      await d.corrigirManual(submissaoId)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível abrir a correção manual.')
    } finally {
      setOcupado(null)
    }
  }

  async function aprovar() {
    if (!d || !item?.correcao) return
    setErro(null)
    setOcupado('aprovando')
    try {
      await d.salvarRevisao(item.correcao.id, {
        criterios,
        comentario_professor: comentario.trim() || null,
        pontos_fortes: emLinhas(fortes),
        pontos_desenvolver: emLinhas(desenvolver),
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
        <button
          onClick={voltar}
          className="alvo-toque -ml-1 justify-start px-1 text-[13px] text-tinta-suave hover:text-verde"
        >
          ← Voltar para a lista
        </button>

        {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}
        {atrasoDeEntrega(item.submissao.enviado_em, avaliacao?.prazo_em) ? (
          <Alerta tom="ambar" titulo="Entregue fora do prazo">
            Enviada em {formatarDataHora(item.submissao.enviado_em)}
            {avaliacao?.prazo_em ? `, depois do prazo de ${formatarDataHora(avaliacao.prazo_em)}` : ''}. A nota não
            muda por isso — o aviso serve para você decidir.
          </Alerta>
        ) : null}
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
              className={`alvo-toque flex-1 rounded-lg text-[13.5px] font-medium transition-colors ${
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
          ) : fotoEstado === 'ok' && fotoUrl ? (
            <>
              <img
                src={fotoUrl}
                alt="Foto da redação"
                className="w-full rounded-lg"
                // a URL assinada pode vencer com a tela aberta
                onError={() => setFotoEstado('erro')}
              />
              {d?.modo === 'demo' ? (
                <p className="mt-2 text-[12px] leading-snug text-tinta-fraca">
                  Imagem de demonstração. No app em uso, esta aba mostra a foto que o aluno enviou.
                </p>
              ) : null}
            </>

          ) : fotoEstado === 'carregando' ? (
            <div className="flex flex-col items-center gap-2 py-8 text-tinta-fraca" role="status">
              <Loader2 className="size-5 animate-spin" aria-hidden />
              <p className="text-[13px]">Abrindo a foto…</p>
            </div>
          ) : fotoEstado === 'sem-foto' ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-tinta-fraca">
              <ImageOff className="size-6" aria-hidden />
              <p className="text-[13px]">Esta redação foi entregue sem foto.</p>
              <p className="max-w-[34ch] text-[12px] leading-snug">
                O aluno digitou o texto no lugar da foto — a transcrição ao lado é o que ele escreveu.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-tinta-fraca">
              <ImageOff className="size-6" aria-hidden />
              <p className="text-[13px]">Não consegui abrir a foto agora.</p>
              <p className="max-w-[34ch] text-[12px] leading-snug">
                O link da foto é temporário. Tente de novo; a correção pode seguir pela transcrição.
              </p>
              <button
                onClick={() => abrirFoto(item.submissao.foto_path)}
                className="alvo-toque mt-1 text-[13px] font-medium text-verde underline underline-offset-2"
              >
                Tentar de novo
              </button>
            </div>
          )}
        </Cartao>

        {!item.correcao ? (
          <>
            <Alerta tom="ambar" titulo="Ainda sem correção da IA">
              Gere a correção pela lista da avaliação — ou atribua as notas você mesmo, critério por
              critério, e aprove.
            </Alerta>
            <Botao
              largo
              variante="secundario"
              onClick={corrigirAMao}
              carregando={ocupado === 'manual'}
              icone={<Pencil className="size-4" />}
            >
              Corrigir manualmente
            </Botao>
          </>
        ) : (
          <>
            <Cartao>
              <div className="flex items-baseline justify-between">
                <h2 className="font-serif text-[16px] text-tinta">Nota por critério</h2>
                <p className="text-[13px] text-tinta-suave">
                  <strong className="font-semibold text-tinta">{formatarPontos(notaBruta)}</strong> /{' '}
                  {formatarPontos(avaliacao.valor_total)} · SIGA{' '}
                  <strong className="font-semibold text-tinta">
                    {escalaSiga === 'pontos'
                      ? formatarPontos(
                          notaParaSigaNaEscala(escalaSiga, notaBruta, avaliacao.valor_total, avaliacao.peso_siga),
                        )
                      : formatarNota(notaFinal)}
                  </strong>
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
                      {c.citacao_conferida === false ? (
                        <p className="mt-1 text-[11.5px] font-medium text-ambar">
                          A citação entre aspas não aparece na transcrição — confira antes de aprovar.
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </Cartao>

            <div className="grid gap-3 sm:grid-cols-2">
              <Cartao>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-verde" htmlFor="fortes">
                  Pontos fortes
                </label>
                <textarea
                  id="fortes"
                  className="campo mt-1.5 min-h-24 text-[13.5px]"
                  value={fortes}
                  onChange={(e) => setFortes(e.target.value)}
                  placeholder="Um por linha. Ex.: Explicou bem a diferença entre sensibilidade e especificidade."
                />
                <p className="mt-1 text-[11.5px] text-tinta-fraca">Um item por linha.</p>
              </Cartao>
              <Cartao>
                <label className="block text-[12px] font-semibold uppercase tracking-wide text-ambar" htmlFor="desenvolver">
                  A desenvolver
                </label>
                <textarea
                  id="desenvolver"
                  className="campo mt-1.5 min-h-24 text-[13.5px]"
                  value={desenvolver}
                  onChange={(e) => setDesenvolver(e.target.value)}
                  placeholder="Um por linha. Ex.: Aprofundar como a prevalência muda o valor preditivo."
                />
                <p className="mt-1 text-[11.5px] text-tinta-fraca">Um item por linha.</p>
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
