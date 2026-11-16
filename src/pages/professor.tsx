import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronRight, Circle, ClipboardCheck, Plus, RefreshCw, Users } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { COMPILADO_EM, VERSAO, quandoFoiCompilado } from '../lib/versao'
import { Link, usarRota } from '../lib/router'
import { Alerta, AppBar, Botao, Campo, Carregando, Cartao, Selo } from '../components/ui'
import { CAPITULOS } from '../lib/livro'
import type { AvaliacaoSiga, Criterio, Diagnostico, Esperado, ResumoAvaliacao, Turma } from '../lib/types'
import { formatarNota } from '../lib/formato'

// ---------------------------------------------------------------------------

export function ProfessorInicio() {
  const { d } = usarSessao()
  const { navegar } = usarRota()
  const [lista, setLista] = useState<ResumoAvaliacao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [turmas, setTurmas] = useState<Turma[] | null>(null)
  const [esperados, setEsperados] = useState<Esperado[] | null>(null)
  const [saude, setSaude] = useState<Diagnostico | null | undefined>(undefined)

  useEffect(() => {
    if (!d) return
    d.resumoAvaliacoes()
      .then(setLista)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'))
    d.turmasTodas()
      .then(async (t) => {
        setTurmas(t)
        if (t[0]) setEsperados(await d.alunosDaTurma(t[0].id))
        else setEsperados([])
      })
      .catch(() => setTurmas([]))
    d.saude()
      .then(setSaude)
      .catch(() => setSaude(null))
  }, [d])

  const pendentesRevisao = (lista ?? []).reduce((t, a) => t + (a.corrigidas - a.aprovadas), 0)
  const aguardandoCorrecao = (lista ?? []).reduce((t, a) => t + (a.enviadas - a.corrigidas), 0)
  const paraLancar = (lista ?? []).reduce((t, a) => t + (a.aprovadas - a.lancadas), 0)

  return (
    <>
      <AppBar titulo="Painel do professor" subtitulo="Análise de Dados para Biocientistas" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-24">
        {erro ? <Alerta tom="vermelho" titulo="Não foi possível carregar">{erro}</Alerta> : null}

        <PrimeirosPassos
          turmas={turmas}
          alunos={esperados}
          avaliacoes={lista}
          saude={saude}
          demo={d?.modo === 'demo'}
          navegar={navegar}
        />

        <div className="grid grid-cols-3 gap-2.5">
          <Indicador rotulo="A corrigir" valor={aguardandoCorrecao} tom="azul" />
          <Indicador rotulo="A revisar" valor={pendentesRevisao} tom="ambar" />
          <Indicador rotulo="A lançar" valor={paraLancar} tom="verde" />
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[17px] text-tinta">Avaliações</h2>
          <Link
            href="/prof/avaliacoes/nova"
            className="inline-flex items-center gap-1 rounded-lg bg-verde px-3 py-1.5 text-[13px] font-medium text-white"
          >
            <Plus className="size-3.5" aria-hidden /> Nova
          </Link>
        </div>

        {lista === null ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <Cartao className="text-center">
            <ClipboardCheck className="mx-auto size-7 text-tinta-fraca" aria-hidden />
            <p className="mt-2 font-medium text-tinta">Nenhuma avaliação criada</p>
            <p className="mx-auto mt-1 max-w-xs text-[13.5px] leading-snug text-tinta-suave">
              Crie a primeira redação: tema, instruções, valor total e a rubrica que define a nota.
            </p>
            <Botao className="mt-3" onClick={() => navegar('/prof/avaliacoes/nova')}>
              Criar avaliação
            </Botao>
          </Cartao>
        ) : (
          <div className="space-y-3">
            {lista.map((a) => (
              <Link key={a.id} href={`/prof/avaliacoes/${a.id}`} className="block">
                <Cartao className="transition-colors active:bg-papel-fundo">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-serif text-[16px] leading-snug text-tinta">{a.titulo}</h3>
                    <Selo tom={a.status === 'publicada' ? 'verde' : a.status === 'encerrada' ? 'neutro' : 'ambar'}>
                      {a.status === 'publicada' ? 'publicada' : a.status === 'encerrada' ? 'encerrada' : 'rascunho'}
                    </Selo>
                  </div>
                  <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
                    <Mini rotulo="alunos" valor={a.total_alunos} />
                    <Mini rotulo="enviadas" valor={a.enviadas} />
                    <Mini rotulo="aprovadas" valor={a.aprovadas} />
                    <Mini rotulo="no SIGA" valor={a.lancadas} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[12.5px] text-tinta-suave">
                    <span>{a.valor_total} pontos · {a.rubrica.length} critérios</span>
                    <ChevronRight className="size-4" aria-hidden />
                  </div>
                </Cartao>
              </Link>
            ))}
          </div>
        )}

        <Link href="/prof/alunos" className="block">
          <Cartao className="flex items-center gap-3">
            <Users className="size-5 text-tinta-suave" aria-hidden />
            <div className="flex-1">
              <p className="text-[14.5px] font-medium text-tinta">Turmas e lista de alunos</p>
              <p className="text-[12.5px] text-tinta-suave">Importar matrícula, nome e e-mail de cada estudante</p>
            </div>
            <ChevronRight className="size-4 text-tinta-fraca" aria-hidden />
          </Cartao>
        </Link>

        {/* Qual versão está no ar: o professor confere, e o suporte também. */}
        <p className="px-1 text-center text-[11.5px] text-tinta-fraca">
          Versão {VERSAO} · compilada {quandoFoiCompilado(COMPILADO_EM)}
        </p>
      </main>
    </>
  )
}

/**
 * Lista de conferência do primeiro uso. Some sozinha quando tudo está pronto —
 * a ideia é não virar mobília na tela do professor.
 */
function PrimeirosPassos({
  turmas,
  alunos,
  avaliacoes,
  saude,
  demo,
  navegar,
}: {
  turmas: Turma[] | null
  alunos: Esperado[] | null
  avaliacoes: ResumoAvaliacao[] | null
  /** undefined = ainda perguntando ao servidor; null = não deu para saber. */
  saude: Diagnostico | null | undefined
  demo: boolean
  navegar: (destino: string) => void
}) {
  if (!turmas || !alunos || !avaliacoes) return null

  const itens: {
    pronto: boolean
    verificar?: boolean
    titulo: string
    detalhe: string
    acao: { rotulo: string; destino: string } | null
  }[] = [
    {
      pronto: turmas.length > 0,
      titulo: 'Criar a turma',
      detalhe: turmas.length > 0 ? turmas[0].nome : 'Nome, código no SIGA e período.',
      acao: turmas.length > 0 ? null : { rotulo: 'Criar turma', destino: '/prof/alunos' },
    },
    {
      pronto: alunos.length > 0,
      titulo: 'Importar a lista de alunos',
      detalhe:
        alunos.length > 0
          ? `${alunos.length} estudante(s) na lista`
          : 'Matrícula, nome e e-mail — um por linha.',
      acao: alunos.length > 0 ? null : { rotulo: 'Importar', destino: '/prof/alunos' },
    },
    {
      pronto: avaliacoes.length > 0,
      titulo: 'Publicar a primeira avaliação',
      detalhe: avaliacoes.length > 0 ? `${avaliacoes.length} criada(s)` : 'Tema, instruções, valor e rubrica.',
      acao: avaliacoes.length > 0 ? null : { rotulo: 'Criar', destino: '/prof/avaliacoes/nova' },
    },
  ]

  // As três últimas dependem de GET /api/saude. Enquanto a resposta não chega,
  // ficam como "verificando" — nunca como prontas, para não mentir na tela.
  const doServidor = [
    {
      ok: saude?.siga.configurado,
      titulo: 'Conectar o SIGA',
      certo: 'Notas podem ser lançadas direto na turma.',
      falta: 'Sem SIGA, as notas ficam só no app.',
    },
    {
      ok: saude?.corretor.configurado,
      titulo: 'Conectar a IA de correção (opcional)',
      certo: `Modelo ${saude?.corretor.modelo ?? 'configurado'}`,
      falta: 'Sem IA, você corrige à mão pela revisão. Para ligar, quem cuida do código roda pnpm configurar:ia.',
    },
    {
      ok: saude?.ocr.configurado,
      titulo: 'Conectar a leitura das fotos (opcional)',
      certo: `Transcrição por ${saude?.ocr.modelo ?? saude?.ocr.provedor ?? 'serviço externo'}`,
      falta: 'Sem OCR, o aluno digita o texto e a foto fica como comprovante (mesmo comando: --visao-modelo).',
    },
  ]

  if (!demo) {
    for (const item of doServidor) {
      itens.push({
        pronto: item.ok === true,
        verificar: item.ok === undefined,
        titulo: item.titulo,
        detalhe: item.ok === true ? item.certo : item.ok === undefined ? 'Verificando o servidor…' : item.falta,
        acao: null,
      })
    }
  }

  const pendentes = itens.filter((i) => !i.pronto)
  if (pendentes.length === 0) return null

  return (
    <Cartao className="border-verde/25 bg-verde-claro/40">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-serif text-[16px] text-tinta">Para começar</h2>
        <span className="text-[12px] text-tinta-suave">
          {itens.length - pendentes.length} de {itens.length} prontos
        </span>
      </div>
      <ul className="mt-2.5 space-y-2">
        {itens.map((i) => (
          <li key={i.titulo} className="flex items-start gap-2.5">
            {i.pronto ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-verde" aria-hidden />
            ) : i.verificar ? (
              <span className="mt-[3px] size-4 shrink-0 animate-pulse rounded-full border border-tinta-fraca/40" />
            ) : (
              <Circle className="mt-0.5 size-4 shrink-0 text-tinta-fraca" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <p className={`text-[13.5px] leading-snug ${i.pronto ? 'text-tinta-suave line-through' : 'font-medium text-tinta'}`}>
                {i.titulo}
              </p>
              <p className="text-[12px] leading-snug text-tinta-suave">{i.detalhe}</p>
            </div>
            {i.acao ? (
              <button
                type="button"
                onClick={() => navegar(i.acao!.destino)}
                className="shrink-0 rounded-lg border border-verde/30 px-2.5 py-1 text-[12px] font-medium text-verde"
              >
                {i.acao.rotulo}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Cartao>
  )
}

function Indicador({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: 'azul' | 'ambar' | 'verde' }) {
  const cor = tom === 'azul' ? 'text-azul' : tom === 'ambar' ? 'text-ambar' : 'text-verde'
  return (
    <div className="cartao px-3 py-2.5">
      <p className="text-[11.5px] uppercase tracking-wide text-tinta-fraca">{rotulo}</p>
      <p className={`mt-1 font-serif text-[24px] leading-none ${valor > 0 ? cor : 'text-tinta-fraca'}`}>{valor}</p>
    </div>
  )
}

function Mini({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg bg-papel-fundo px-1 py-1.5">
      <p className="font-serif text-[16px] leading-none text-tinta">{valor}</p>
      <p className="mt-0.5 text-[10.5px] uppercase tracking-wide text-tinta-fraca">{rotulo}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------

const novoCriterio = (n: number): Criterio => ({
  id: `c${n}-${Math.random().toString(36).slice(2, 7)}`,
  nome: '',
  descricao: '',
  valor: 0,
})

export function ProfessorNovaAvaliacao() {
  const { d } = usarSessao()
  const { navegar } = usarRota()

  const [turmas, setTurmas] = useState<Turma[]>([])
  const [turmaId, setTurmaId] = useState('')
  const [titulo, setTitulo] = useState('')
  const [tema, setTema] = useState('')
  const [instrucoes, setInstrucoes] = useState('')
  const [capitulo, setCapitulo] = useState('')
  const [valorTotal, setValorTotal] = useState('20')
  const [rubrica, setRubrica] = useState<Criterio[]>([
    { ...novoCriterio(1), nome: 'Precisão conceitual', descricao: 'Usa corretamente os conceitos do capítulo.', valor: 6 },
    { ...novoCriterio(2), nome: 'Interpretação e aplicação', descricao: 'Aplica o conceito a uma situação concreta.', valor: 6 },
    { ...novoCriterio(3), nome: 'Argumentação e evidências', descricao: 'Sustenta a resposta com dados ou exemplos.', valor: 4 },
    { ...novoCriterio(4), nome: 'Clareza e norma padrão', descricao: 'Texto organizado, coeso e em português padrão.', valor: 4 },
  ])
  const [descricaoSiga, setDescricaoSiga] = useState('')
  // O peso no SIGA é, quase sempre, igual ao valor total da rubrica. Começa
  // acompanhando o total e para de acompanhar quando o professor edita o campo.
  const [pesoSiga, setPesoSiga] = useState('20')
  const [pesoEditado, setPesoEditado] = useState(false)
  const [dataSiga, setDataSiga] = useState('')
  const [prazo, setPrazo] = useState('')
  const [publicar, setPublicar] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [opcoesSiga, setOpcoesSiga] = useState<AvaliacaoSiga[]>([])
  const [buscandoSiga, setBuscandoSiga] = useState(false)
  const [erroSiga, setErroSiga] = useState<string | null>(null)

  useEffect(() => {
    if (!d) return
    d.turmasTodas()
      .then((t) => {
        setTurmas(t)
        if (t.length === 1) setTurmaId(t[0].id)
      })
      .catch(() => setErro('Não foi possível carregar as turmas.'))
  }, [d])

  useEffect(() => {
    if (!pesoEditado) setPesoSiga(valorTotal)
  }, [valorTotal, pesoEditado])

  const total = Number(valorTotal) || 0
  const soma = rubrica.reduce((t, c) => t + (Number(c.valor) || 0), 0)
  const somaOk = Math.abs(soma - total) < 0.011

  function distribuir() {
    const pesos = [0.3, 0.3, 0.2]
    let acumulado = 0
    setRubrica((atual) =>
      atual.map((c, i) => {
        if (i < pesos.length) {
          const v = Math.round(total * pesos[i] * 10) / 10
          acumulado += v
          return { ...c, valor: v }
        }
        return { ...c, valor: Math.round((total - acumulado) * 10) / 10 }
      }),
    )
  }

  const turmaSelecionada = turmas.find((t) => t.id === turmaId) ?? null

  async function buscarSiga() {
    if (!d || !turmaSelecionada) return
    setErroSiga(null)
    setBuscandoSiga(true)
    try {
      const quadro = await d.avaliacoesDoSiga(turmaSelecionada.codigo_siga, turmaSelecionada.periodo)
      setOpcoesSiga(quadro.avaliacoes)
      if (quadro.avaliacoes.length === 0) {
        setErroSiga('Nenhuma avaliação encontrada nesta turma. Crie a TVC no SIGA primeiro.')
      }
    } catch (e) {
      setOpcoesSiga([])
      setErroSiga(e instanceof Error ? e.message : 'Não foi possível consultar o SIGA.')
    } finally {
      setBuscandoSiga(false)
    }
  }

  /** DD/MM/AAAA (SIGA) → AAAA-MM-DD (input type=date). */
  function escolherSiga(a: AvaliacaoSiga) {
    setDescricaoSiga(a.descricao)
    // o peso vem do SIGA: não deve mais acompanhar o valor total da rubrica
    if (a.peso > 0) {
      setPesoEditado(true)
      setPesoSiga(String(a.peso))
    }
    const br = a.data?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (br) setDataSiga(`${br[3]}-${br[2]}-${br[1]}`)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setErro(null)
    if (!turmaId) return setErro('Escolha a turma.')
    if (!titulo.trim() || !tema.trim() || !instrucoes.trim()) return setErro('Preencha título, tema e instruções.')
    if (total <= 0) return setErro('O valor total precisa ser maior que zero.')
    if (rubrica.some((c) => !c.nome.trim())) return setErro('Todo critério precisa de um nome.')
    if (!somaOk) return setErro(`A rubrica soma ${soma} mas o valor total é ${total}.`)

    setSalvando(true)
    try {
      const criada = await d.criarAvaliacao({
        turma_id: turmaId,
        titulo: titulo.trim(),
        tema: tema.trim(),
        instrucoes: instrucoes.trim(),
        capitulo: capitulo || null,
        valor_total: total,
        rubrica: rubrica.map((c) => ({ ...c, valor: Number(c.valor) })),
        descricao_siga: descricaoSiga.trim() || null,
        peso_siga: Number(pesoSiga) || 10,
        data_siga: dataSiga || null,
        abre_em: new Date().toISOString(),
        prazo_em: prazo ? new Date(prazo).toISOString() : null,
        status: publicar ? 'publicada' : 'rascunho',
      })
      navegar(`/prof/avaliacoes/${criada.id}`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar a avaliação.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <AppBar titulo="Nova avaliação" subtitulo="Redação com correção por rubrica" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
        <Link href="/" className="text-[13px] text-tinta-suave hover:text-verde">
          ← Painel
        </Link>

        {turmas.length === 0 ? (
          <Alerta tom="ambar" titulo="Nenhuma turma cadastrada">
            Cadastre a turma e importe a lista de alunos antes de criar a avaliação.{' '}
            <Link href="/prof/alunos" className="font-medium underline">
              Ir para turmas
            </Link>
          </Alerta>
        ) : null}

        <form onSubmit={salvar} className="space-y-4">
          <Cartao className="space-y-3.5">
            <select className="campo" value={turmaId} onChange={(e) => setTurmaId(e.target.value)} required>
              <option value="">Turma…</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome} · {t.periodo} ({t.codigo_siga})
                </option>
              ))}
            </select>
            <Campo rotulo="Título" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Redação 1 — Testes diagnósticos" required />
            <div>
              <label className="rotulo" htmlFor="tema">Tema (o que o aluno deve responder)</label>
              <textarea
                id="tema"
                className="campo min-h-20"
                value={tema}
                onChange={(e) => setTema(e.target.value)}
                placeholder="Explique a diferença entre sensibilidade e especificidade…"
                required
              />
            </div>
            <div>
              <label className="rotulo" htmlFor="instrucoes">Instruções (formato, extensão, critérios de entrega)</label>
              <textarea
                id="instrucoes"
                className="campo min-h-24"
                value={instrucoes}
                onChange={(e) => setInstrucoes(e.target.value)}
                placeholder="Escreva de 20 a 30 linhas, à mão, em folha A4…"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="rotulo" htmlFor="cap">Capítulo do livro</label>
                <select id="cap" className="campo" value={capitulo} onChange={(e) => setCapitulo(e.target.value)}>
                  <option value="">—</option>
                  {CAPITULOS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero}. {c.titulo}
                    </option>
                  ))}
                </select>
              </div>
              <Campo
                rotulo="Valor total (pontos)"
                type="number"
                min="0.5"
                step="0.5"
                value={valorTotal}
                onChange={(e) => setValorTotal(e.target.value)}
              />
            </div>
            <Campo
              rotulo="Prazo de entrega (opcional)"
              type="datetime-local"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
            />
          </Cartao>

          <Cartao>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[16px] text-tinta">Rubrica</h2>
              <span className={`text-[12.5px] font-medium ${somaOk ? 'text-verde' : 'text-vermelho'}`}>
                {soma} / {total} pts
              </span>
            </div>
            <p className="mt-1 text-[12.5px] leading-snug text-tinta-suave">
              A nota final é a soma dos critérios. O modelo só pode pontuar dentro do máximo de cada um.
            </p>

            <div className="mt-3 space-y-3">
              {rubrica.map((c, i) => (
                <div key={c.id} className="rounded-xl border border-borda p-3">
                  <div className="flex gap-2">
                    <input
                      className="campo flex-1"
                      value={c.nome}
                      placeholder={`Critério ${i + 1}`}
                      onChange={(e) =>
                        setRubrica((atual) => atual.map((x) => (x.id === c.id ? { ...x, nome: e.target.value } : x)))
                      }
                    />
                    <input
                      className="campo w-20 text-center"
                      type="number"
                      min="0"
                      step="0.5"
                      value={c.valor}
                      onChange={(e) =>
                        setRubrica((atual) =>
                          atual.map((x) => (x.id === c.id ? { ...x, valor: Number(e.target.value) } : x)),
                        )
                      }
                    />
                  </div>
                  <textarea
                    className="campo mt-2 min-h-16 text-base sm:text-[14px]"
                    value={c.descricao}
                    placeholder="O que se espera neste critério (usado pelo corretor)"
                    onChange={(e) =>
                      setRubrica((atual) => atual.map((x) => (x.id === c.id ? { ...x, descricao: e.target.value } : x)))
                    }
                  />
                  {rubrica.length > 1 ? (
                    <button
                      type="button"
                      className="alvo-toque mt-1 justify-start text-[12px] text-vermelho"
                      onClick={() => setRubrica((atual) => atual.filter((x) => x.id !== c.id))}
                    >
                      remover critério
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Botao
                type="button"
                variante="secundario"
                onClick={() => setRubrica((atual) => [...atual, novoCriterio(atual.length + 1)])}
                icone={<Plus className="size-4" />}
              >
                Critério
              </Botao>
              <Botao type="button" variante="fantasma" onClick={distribuir}>
                Distribuir {total} pts
              </Botao>
            </div>
          </Cartao>

          <Cartao className="space-y-3.5">
            <div>
              <h2 className="font-serif text-[16px] text-tinta">Lançamento no SIGA</h2>
              <p className="mt-1 text-[12.5px] leading-snug text-tinta-suave">
                A descrição precisa ser idêntica à da avaliação (TVC) no SIGA. Se ela ainda não existir, crie no SIGA ou
                use o botão de criação na tela da avaliação.
              </p>
            </div>
            <div className="rounded-xl border border-borda bg-papel/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] leading-snug text-tinta-suave">
                  {turmaSelecionada
                    ? `Turma ${turmaSelecionada.codigo_siga} · ${turmaSelecionada.periodo}`
                    : 'Escolha a turma para consultar o SIGA.'}
                </p>
                <Botao
                  type="button"
                  variante="fantasma"
                  onClick={buscarSiga}
                  disabled={!turmaSelecionada}
                  carregando={buscandoSiga}
                  icone={<RefreshCw className="size-4" />}
                >
                  Buscar
                </Botao>
              </div>
              {erroSiga ? <p className="mt-1.5 text-[12.5px] leading-snug text-vermelho">{erroSiga}</p> : null}
              {opcoesSiga.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {opcoesSiga.map((a) => {
                    const ativa = descricaoSiga.trim().toLowerCase() === a.descricao.trim().toLowerCase()
                    return (
                      <li key={a.id ?? a.descricao}>
                        <button
                          type="button"
                          onClick={() => escolherSiga(a)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                            ativa ? 'border-verde bg-verde/5' : 'border-borda bg-white hover:border-verde/40'
                          }`}
                        >
                          <span className="block text-[13.5px] font-medium text-tinta">{a.descricao}</span>
                          <span className="block text-[12px] text-tinta-fraca">
                            {a.data ?? 'sem data'} · peso {a.peso}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
            </div>
            <Campo
              rotulo="Descrição da avaliação no SIGA"
              value={descricaoSiga}
              onChange={(e) => setDescricaoSiga(e.target.value)}
              placeholder="TVC 1"
            />
            <div className="grid grid-cols-2 gap-3">
              <Campo
                rotulo="Peso no SIGA"
                type="number"
                min="0.5"
                step="0.5"
                value={pesoSiga}
                onChange={(e) => {
                  setPesoEditado(true)
                  setPesoSiga(e.target.value)
                }}
                dica="O padrão acompanha o valor total. Se o SIGA usar outro peso, a nota é convertida proporcionalmente."
              />
              <Campo rotulo="Data no SIGA" type="date" value={dataSiga} onChange={(e) => setDataSiga(e.target.value)} />
            </div>
          </Cartao>

          <label className="flex items-start gap-2.5 rounded-xl border border-borda bg-white px-3.5 py-3">
            <input
              type="checkbox"
              checked={publicar}
              onChange={(e) => setPublicar(e.target.checked)}
              className="mt-0.5 size-5 accent-verde"
            />
            <span className="text-[13.5px] leading-snug text-tinta">
              Publicar agora para os alunos. Se desmarcar, fica como rascunho — só você vê.
            </span>
          </label>

          {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}

          <Botao type="submit" largo carregando={salvando}>
            {publicar ? 'Publicar avaliação' : 'Salvar rascunho'}
          </Botao>
        </form>
      </main>
    </>
  )
}

export function notaResumo(n: number | null | undefined) {
  return formatarNota(n)
}
