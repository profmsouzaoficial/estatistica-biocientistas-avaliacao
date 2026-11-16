import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, Clock3, Star } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { Link, usarRota } from '../lib/router'
import { Alerta, AppBar, Botao, Carregando, Cartao, Selo, Vazio } from '../components/ui'
import { formatarDataHora, formatarNota, tempoRelativo, plural, primeiroNome } from '../lib/formato'
import type { Avaliacao, AvaliacaoDoAluno } from '../lib/types'

export function rotuloEstado(a: AvaliacaoDoAluno): { texto: string; tom: 'neutro' | 'verde' | 'ambar' | 'vermelho' | 'azul' } {
  const s = a.submissao
  if (!s) {
    if (a.status === 'encerrada') return { texto: 'Entregas encerradas', tom: 'neutro' }
    const atrasada = a.prazo_em && new Date(a.prazo_em).getTime() < Date.now()
    return atrasada ? { texto: 'Prazo encerrado', tom: 'vermelho' } : { texto: 'A fazer', tom: 'ambar' }
  }
  if (s.status === 'rascunho') return { texto: 'Não enviada', tom: 'ambar' }
  if (s.status === 'devolvida') return { texto: 'Devolvida para ajuste', tom: 'vermelho' }
  if (a.correcao) return { texto: `Corrigida · ${formatarNota(a.correcao.nota_final)}`, tom: 'verde' }
  return { texto: 'Em correção', tom: 'azul' }
}

// ---------------------------------------------------------------------------

export function AlunoInicio() {
  const { d, perfil } = usarSessao()
  const [avaliacoes, setAvaliacoes] = useState<AvaliacaoDoAluno[] | null>(null)
  const [nomeTurma, setNomeTurma] = useState('')
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!d) return
    Promise.all([d.avaliacoesDoAluno(), d.turmas()])
      .then(([avs, turmas]) => {
        setAvaliacoes(avs)
        const t = turmas.find((x) => x.id === perfil?.turma_id)
        setNomeTurma(t ? `${t.nome} · ${t.periodo}` : '')
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'))
  }, [d, perfil?.turma_id])

  const pendentes = (avaliacoes ?? []).filter((a) => !a.submissao || a.submissao.status === 'rascunho').length
  const prontas = (avaliacoes ?? []).filter((a) => a.correcao).length

  return (
    <>
      <AppBar
        titulo={perfil ? `Olá, ${primeiroNome(perfil.nome_completo)}` : 'Avaliações'}
        subtitulo={nomeTurma || perfil?.curso || undefined}
      />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-24">
        {erro ? <Alerta tom="vermelho" titulo="Não foi possível carregar">{erro}</Alerta> : null}

        {avaliacoes === null ? (
          <Carregando />
        ) : avaliacoes.length === 0 ? (
          <Vazio titulo="Nenhuma avaliação publicada" icone={<ClipboardList className="size-7" />}>
            Quando o professor publicar uma redação, ela aparece aqui com o tema, as instruções e o prazo.
          </Vazio>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Cartao className="!p-3.5">
                <p className="text-[12px] uppercase tracking-wide text-tinta-fraca">A fazer</p>
                <p className="mt-1 font-serif text-[26px] leading-none text-ambar">{pendentes}</p>
              </Cartao>
              <Cartao className="!p-3.5">
                <p className="text-[12px] uppercase tracking-wide text-tinta-fraca">Com devolutiva</p>
                <p className="mt-1 font-serif text-[26px] leading-none text-verde">{prontas}</p>
              </Cartao>
            </div>

            <div className="space-y-3">
              {avaliacoes.map((a) => (
                <CardAvaliacao key={a.id} a={a} />
              ))}
            </div>
          </>
        )}

        <p className="px-1 text-center text-[12.5px] text-tinta-fraca">
          Primeira vez? Veja{' '}
          <Link href="/ajuda" className="underline underline-offset-2 hover:text-verde">
            como enviar sua redação
          </Link>
          .
        </p>
      </main>
    </>
  )
}

function CardAvaliacao({ a }: { a: AvaliacaoDoAluno }) {
  const estado = rotuloEstado(a)
  const prazoPassado = a.prazo_em && new Date(a.prazo_em).getTime() < Date.now()
  const destino = a.correcao
    ? `/avaliacoes/${a.id}/devolutiva`
    : a.submissao && (a.submissao.status === 'enviada' || a.submissao.status === 'corrigida')
      ? `/avaliacoes/${a.id}`
      : `/avaliacoes/${a.id}`

  return (
    <Link href={destino} className="block">
      <Cartao className="transition-colors active:bg-papel-fundo">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-serif text-[16.5px] leading-snug text-tinta">{a.titulo}</h2>
          <Selo tom={estado.tom}>{estado.texto}</Selo>
        </div>
        <p className="mt-1.5 line-clamp-2 text-[13.5px] leading-snug text-tinta-suave">{a.tema}</p>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-tinta-suave">
          <span className="inline-flex items-center gap-1">
            <Star className="size-3.5" aria-hidden /> {a.valor_total} pontos
          </span>
          {a.prazo_em ? (
            <span className={`inline-flex items-center gap-1 ${prazoPassado ? 'text-vermelho' : ''}`}>
              <CalendarClock className="size-3.5" aria-hidden />
              {prazoPassado ? 'Encerrado em ' : 'Até '}
              {tempoRelativo(a.prazo_em)}
            </span>
          ) : null}
          {a.submissao?.status === 'enviada' && !a.correcao ? (
            <span className="inline-flex items-center gap-1 text-azul">
              <Clock3 className="size-3.5" aria-hidden /> aguardando correção
            </span>
          ) : null}
        </div>
      </Cartao>
    </Link>
  )
}

// ---------------------------------------------------------------------------

export function AlunoAvaliacao({ id }: { id: string }) {
  const { d } = usarSessao()
  const { navegar } = usarRota()
  const [a, setA] = useState<AvaliacaoDoAluno | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!d) return
    d.avaliacoesDoAluno()
      .then((lista) => {
        const achada = lista.find((x) => x.id === id) ?? null
        setA(achada)
        if (!achada) setErro('Avaliação não encontrada ou ainda não publicada.')
      })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'))
  }, [d, id])

  if (erro) {
    return (
      <>
        <AppBar titulo="Avaliação" />
        <main className="mx-auto max-w-2xl px-4 py-4">
          <Alerta tom="vermelho" titulo="Ops">{erro}</Alerta>
        </main>
      </>
    )
  }
  if (!a) return <Carregando />

  const estado = rotuloEstado(a)
  const prazoPassado = a.prazo_em ? new Date(a.prazo_em).getTime() < Date.now() : false
  const encerrada = a.status === 'encerrada'
  // Encerrada bloqueia entrega nova (o banco também barra). Quem já tinha
  // rascunho ou foi devolvido ainda conclui o que começou.
  const podeEnviar = !a.submissao ? !encerrada : a.submissao.status === 'rascunho' || a.submissao.status === 'devolvida'

  return (
    <>
      <AppBar titulo="Avaliação" subtitulo={`${a.valor_total} pontos`} />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
        <div>
          <Link href="/" className="text-[13px] text-tinta-suave hover:text-verde">
            ← Todas as avaliações
          </Link>
          <h2 className="mt-2 font-serif text-[21px] leading-tight text-tinta">{a.titulo}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Selo tom={estado.tom}>{estado.texto}</Selo>
            {a.capitulo ? <Selo>{a.capitulo.replace('cap', 'capítulo ')}</Selo> : null}
          </div>
        </div>

        {a.prazo_em ? (
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13.5px] ${prazoPassado ? 'bg-vermelho-claro text-vermelho' : 'bg-verde-claro text-verde-escuro'}`}>
            <CalendarClock className="size-4 shrink-0" aria-hidden />
            {prazoPassado ? 'Prazo encerrado em ' : 'Entrega até '}
            <strong className="font-semibold">{formatarDataHora(a.prazo_em)}</strong>
          </div>
        ) : null}

        <Cartao>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-tinta-fraca">Tema</h3>
          <p className="mt-1.5 text-[15px] leading-relaxed text-tinta">{a.tema}</p>
        </Cartao>

        <Cartao>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-tinta-fraca">Instruções</h3>
          <p className="mt-1.5 texto-corrido">{a.instrucoes}</p>
        </Cartao>

        <Cartao>
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-tinta-fraca">
            Como você será avaliado · {a.valor_total} pontos
          </h3>
          <ul className="mt-2 divide-y divide-borda">
            {a.rubrica.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2.5">
                <div>
                  <p className="text-[14.5px] font-medium text-tinta">{c.nome}</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-tinta-suave">{c.descricao}</p>
                </div>
                <span className="shrink-0 rounded-full bg-papel-fundo px-2 py-0.5 text-[12.5px] font-medium text-tinta-suave">
                  {c.valor} pts
                </span>
              </li>
            ))}
          </ul>
        </Cartao>

        {a.submissao && a.submissao.status !== 'rascunho' ? (
          <Cartao className="!bg-papel-fundo/60">
            <div className="flex items-center gap-2 text-verde-escuro">
              <CheckCircle2 className="size-4" aria-hidden />
              <p className="text-[14px] font-medium">
                Enviada {a.submissao.enviado_em ? tempoRelativo(a.submissao.enviado_em) : ''}
              </p>
            </div>
            <p className="mt-1 text-[13px] leading-snug text-tinta-suave">
              {a.correcao
                ? 'A devolutiva já está disponível.'
                : 'Sua redação está na fila de correção. Você recebe a devolutiva aqui.'}
            </p>
          </Cartao>
        ) : null}

        {a.correcao ? (
          <Botao largo onClick={() => navegar(`/avaliacoes/${a.id}/devolutiva`)}>
            Ver minha devolutiva · {formatarNota(a.correcao.nota_final)}
          </Botao>
        ) : null}

        {podeEnviar ? (
          <Botao
            largo
            variante={a.correcao ? 'secundario' : 'primario'}
            onClick={() => navegar(`/avaliacoes/${a.id}/enviar`)}
            disabled={prazoPassado}
          >
            {prazoPassado ? 'Prazo encerrado' : a.submissao ? 'Reenviar redação' : 'Fotografar minha redação'}
          </Botao>
        ) : null}

        {encerrada && !a.submissao ? (
          <Alerta tom="neutro" titulo="Entregas encerradas">
            O professor encerrou o recebimento desta redação. Se você precisa entregar, fale com ele —
            a entrega pode ser reaberta.
          </Alerta>
        ) : null}

        {prazoPassado && podeEnviar ? (
          <p className="flex items-start gap-2 text-[13px] leading-snug text-tinta-suave">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-ambar" aria-hidden />
            O prazo terminou. Se precisar de prorrogação, fale com o professor — ele pode reabrir a entrega.
          </p>
        ) : null}
      </main>
    </>
  )
}

export function contagemAvaliacoes(lista: Avaliacao[]) {
  return plural(lista.length, 'avaliação', 'avaliações')
}
