import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarCheck, CheckCircle2, ChevronRight, Circle, ClipboardCheck, Plus, RefreshCw, Users } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { COMPILADO_EM, VERSAO, quandoFoiCompilado } from '../lib/versao'
import { Link, usarRota } from '../lib/router'
import { Alerta, AppBar, Botao, Campo, Carregando, Cartao, Selo } from '../components/ui'
import { SelecaoTurmas } from '../components/selecaoTurmas'
import { CAPITULOS } from '../lib/livro'
import type { Avaliacao, AvaliacaoSiga, Criterio, Diagnostico, Esperado, ResumoAvaliacao, Turma } from '../lib/types'
import { formatarNota } from '../lib/formato'
import { api } from '../lib/servidor'
import { aberturaDaAvaliacao, validarPrazoCriacao } from '../lib/prazos'
import type { Dados } from '../lib/dados'

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
          <Indicador rotulo="A revisar" valor={pendentesRevisao} tom="dourado" />
          <Indicador rotulo="A lançar" valor={paraLancar} tom="marinho" />
        </div>

        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[17px] text-tinta">Avaliações</h2>
          <Link
            href="/prof/avaliacoes/nova"
            className="inline-flex items-center gap-1 rounded-lg bg-marinho px-3 py-1.5 text-[13px] font-medium text-white"
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
                    <Selo tom={a.status === 'publicada' ? 'marinho' : a.status === 'encerrada' ? 'neutro' : 'dourado'}>
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

        <Link href="/prof/frequencia" className="block">
          <Cartao className="flex items-center gap-3">
            <CalendarCheck className="size-5 text-tinta-suave" aria-hidden />
            <div className="flex-1">
              <p className="text-[14.5px] font-medium text-tinta">Controle de frequência</p>
              <p className="text-[12.5px] text-tinta-suave">Chamada por turma, com foto e personalidade dos alunos</p>
            </div>
            <ChevronRight className="size-4 text-tinta-fraca" aria-hidden />
          </Cartao>
        </Link>

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
    <Cartao className="border-marinho/25 bg-marinho-claro/40">
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
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-marinho" aria-hidden />
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
                className="shrink-0 rounded-lg border border-marinho/30 px-2.5 py-1 text-[12px] font-medium text-marinho"
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

function Indicador({ rotulo, valor, tom }: { rotulo: string; valor: number; tom: 'azul' | 'dourado' | 'marinho' }) {
  const cor = tom === 'azul' ? 'text-azul' : tom === 'dourado' ? 'text-dourado' : 'text-marinho'
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

type EstadoSiga = { opcoes: AvaliacaoSiga[]; erro: string | null }

type ItemPublicacao = {
  turma: Turma
  avaliacao: Avaliacao | null
  siga: 'criada' | 'existente' | 'nao_solicitada' | 'falhou' | 'local_falhou'
  erro?: string
}

const normalizar = (texto: string) => texto.trim().toLowerCase()

/** Consulta o SIGA de cada turma em paralelo; uma falha não derruba as outras. */
async function consultarSiga(d: Dados, turmas: Turma[]): Promise<Record<string, EstadoSiga>> {
  const pares = await Promise.all(
    turmas.map(async (t) => {
      try {
        const quadro = await d.avaliacoesDoSiga(t.codigo_siga, t.periodo)
        return [t.id, { opcoes: quadro.avaliacoes, erro: null }] as const
      } catch (e) {
        return [
          t.id,
          { opcoes: [], erro: e instanceof Error ? e.message : 'Não foi possível consultar o SIGA.' },
        ] as const
      }
    }),
  )
  return Object.fromEntries(pares)
}

function rotuloDoResultado(item: ItemPublicacao): string {
  if (item.siga === 'local_falhou') return 'A avaliação local não foi criada.'
  if (item.siga === 'nao_solicitada') return 'Rascunho salvo; nada foi criado no SIGA.'
  if (item.siga === 'existente') return 'SIGA: a TVC já existia e será usada no lançamento.'
  if (item.siga === 'criada') return 'SIGA: TVC criada agora.'
  return 'SIGA: a TVC não foi criada agora. A avaliação local foi salva; abra-a e use “Criar no SIGA” para tentar de novo.'
}

export function ProfessorNovaAvaliacao() {
  const { d } = usarSessao()

  const [turmas, setTurmas] = useState<Turma[]>([])
  const [turmaIds, setTurmaIds] = useState<string[]>([])
  const [titulo, setTitulo] = useState('')
  const [tema, setTema] = useState('')
  const [instrucoes, setInstrucoes] = useState('')
  const [instrucoesCorrecao, setInstrucoesCorrecao] = useState('')
  const [capitulo, setCapitulo] = useState('')
  const [valorTotal, setValorTotal] = useState('100')
  const [rubrica, setRubrica] = useState<Criterio[]>([
    { ...novoCriterio(1), nome: 'Precisão conceitual', descricao: 'Usa corretamente os conceitos do capítulo.', valor: 25 },
    { ...novoCriterio(2), nome: 'Interpretação e aplicação', descricao: 'Aplica o conceito a uma situação concreta.', valor: 25 },
    { ...novoCriterio(3), nome: 'Argumentação e evidências', descricao: 'Sustenta a resposta com dados ou exemplos.', valor: 25 },
    { ...novoCriterio(4), nome: 'Clareza e norma padrão', descricao: 'Texto organizado, coeso e em português padrão.', valor: 25 },
  ])
  const [descricaoSiga, setDescricaoSiga] = useState('')
  // O peso no SIGA é, quase sempre, igual ao valor total da rubrica. Começa
  // acompanhando o total e para de acompanhar quando o professor edita o campo.
  const [pesoSiga, setPesoSiga] = useState('100')
  const [pesoEditado, setPesoEditado] = useState(false)
  const [dataSiga, setDataSiga] = useState('')
  const [prazo, setPrazo] = useState('')
  const [publicar, setPublicar] = useState(true)
  // Criar a TVC no SIGA junto com a avaliação local. Só vale para publicar:
  // rascunho é rascunho, não deve mexer na estrutura do SIGA.
  const [criarNoSiga, setCriarNoSiga] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [sigaPorTurma, setSigaPorTurma] = useState<Record<string, EstadoSiga>>({})
  const [buscandoSiga, setBuscandoSiga] = useState(false)
  const [resultado, setResultado] = useState<ItemPublicacao[] | null>(null)
  const resultadoRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (resultado) resultadoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [resultado])

  useEffect(() => {
    if (!d) return
    d.turmasTodas()
      .then((t) => {
        setTurmas(t)
        if (t.length === 1) setTurmaIds([t[0].id])
      })
      .catch(() => setErro('Não foi possível carregar as turmas.'))
  }, [d])

  useEffect(() => {
    if (!pesoEditado) setPesoSiga(valorTotal)
  }, [valorTotal, pesoEditado])

  /** O título é a fonte da descrição no SIGA; a descrição continua editável
   * para casar com uma avaliação que já existe. O número da TVC é automático. */
  function mudarTitulo(valor: string) {
    setTitulo(valor)
    setDescricaoSiga(valor)
  }

  /** Data do SIGA e data de referência são espelhos: uma alteração atualiza a outra. */
  function mudarDataSiga(valor: string) {
    setDataSiga(valor)
    if (!valor) {
      setPrazo('')
      return
    }
    setPrazo((atual) => {
      const hora = atual.slice(0, 10) === valor ? atual.slice(11, 16) : '23:59'
      return `${valor}T${hora || '23:59'}`
    })
  }

  function mudarPrazo(valor: string) {
    setPrazo(valor)
    setDataSiga(valor ? valor.slice(0, 10) : '')
  }

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

  const selecionadas = useMemo(
    () => turmas.filter((t) => turmaIds.includes(t.id)),
    [turmas, turmaIds],
  )
  const chaveTurmas = useMemo(() => [...turmaIds].sort().join('|'), [turmaIds])

  // Ao escolher as turmas, já consulta o SIGA de todas: o professor vê as TVCs
  // existentes sem precisar descobrir o botão. O botão continua lá para atualizar.
  useEffect(() => {
    if (!d || !chaveTurmas) {
      setSigaPorTurma({})
      setBuscandoSiga(false)
      return
    }
    let vivo = true
    const lista = turmas.filter((t) => turmaIds.includes(t.id))
    if (lista.length === 0) return
    setBuscandoSiga(true)
    consultarSiga(d, lista)
      .then((mapa) => {
        if (vivo) setSigaPorTurma(mapa)
      })
      .finally(() => {
        if (vivo) setBuscandoSiga(false)
      })
    return () => {
      vivo = false
    }
    // chaveTurmas resume a seleção; turmaIds muda de identidade a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveTurmas, d, turmas])

  async function buscarSiga() {
    if (!d || selecionadas.length === 0) return
    setBuscandoSiga(true)
    try {
      setSigaPorTurma(await consultarSiga(d, selecionadas))
    } finally {
      setBuscandoSiga(false)
    }
  }

  /** true = existe; false = não existe; null = ainda não consultado ou falhou. */
  function turmaTemDescricao(t: Turma): boolean | null {
    const estado = sigaPorTurma[t.id]
    if (!estado || estado.erro) return null
    if (!descricaoSiga.trim()) return false
    return estado.opcoes.some((a) => normalizar(a.descricao) === normalizar(descricaoSiga))
  }

  const semConsultaEm = selecionadas.filter((t) => turmaTemDescricao(t) === null)
  const faltandoEm = selecionadas.filter((t) => turmaTemDescricao(t) === false)
  const erroSiga =
    semConsultaEm.map((t) => sigaPorTurma[t.id]?.erro).find((erro): erro is string => Boolean(erro)) ?? null
  const sigaConfere =
    descricaoSiga.trim() !== '' &&
    selecionadas.length > 0 &&
    semConsultaEm.length === 0 &&
    faltandoEm.length === 0
  const opcoesSiga = useMemo(() => {
    const mapa = new Map<string, AvaliacaoSiga & { codigos: string[] }>()
    for (const t of selecionadas) {
      for (const a of sigaPorTurma[t.id]?.opcoes ?? []) {
        const chave = normalizar(a.descricao)
        const atual = mapa.get(chave)
        if (atual) {
          if (!atual.codigos.includes(t.codigo_siga)) atual.codigos.push(t.codigo_siga)
        } else {
          mapa.set(chave, { ...a, codigos: [t.codigo_siga] })
        }
      }
    }
    return [...mapa.values()]
  }, [selecionadas, sigaPorTurma])

  /** DD/MM/AAAA (SIGA) → AAAA-MM-DD (input type=date). */
  function escolherSiga(a: AvaliacaoSiga) {
    setDescricaoSiga(a.descricao)
    // o peso vem do SIGA: não deve mais acompanhar o valor total da rubrica
    if (a.peso > 0) {
      setPesoEditado(true)
      setPesoSiga(String(a.peso))
    }
    const br = a.data?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
    if (br) mudarDataSiga(`${br[3]}-${br[2]}-${br[1]}`)
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setErro(null)
    if (selecionadas.length === 0) return setErro('Escolha pelo menos uma turma.')
    if (!titulo.trim() || !tema.trim() || !instrucoes.trim()) return setErro('Preencha título, tema e instruções.')
    if (total <= 0) return setErro('O valor total precisa ser maior que zero.')
    if (rubrica.some((c) => !c.nome.trim())) return setErro('Todo critério precisa de um nome.')
    if (!somaOk) return setErro(`A rubrica soma ${soma} mas o valor total é ${total}.`)

    if (publicar && !descricaoSiga.trim()) {
      return setErro(
        'Para publicar, informe a descrição da avaliação no SIGA (ex.: Trabalho prático). Sem ela o lançamento de notas não tem para onde ir. Se a avaliação ainda não existe, marque a criação abaixo ou salve como rascunho.',
      )
    }

    const prazoOk = validarPrazoCriacao(prazo)
    if (!prazoOk.ok) return setErro(prazoOk.mensagem ?? 'Data de referência inválida.')

    setSalvando(true)
    setProgresso(null)
    setResultado(null)
    try {
      // Evita publicar duas vezes a mesma avaliação na mesma turma: o
      // formulário agora fica preenchido, então um segundo clique é fácil.
      let existentes: ResumoAvaliacao[] = []
      try {
        existentes = await d.resumoAvaliacoes()
      } catch {
        // sem a lista, segue: o banco ainda protege os dados essenciais
      }
      const repetidas = selecionadas.filter((t) =>
        existentes.some((a) => a.turma_id === t.id && normalizar(a.titulo) === normalizar(titulo)),
      )
      if (repetidas.length > 0) {
        return setErro(
          `Já existe uma avaliação com este título em ${repetidas.map((t) => t.codigo_siga).join(', ')}. ` +
            'Abra a avaliação existente no painel; se a criação no SIGA falhou na primeira tentativa, use “Criar no SIGA” dentro dela. Não preencha outra vez — isso criaria uma avaliação local duplicada.',
        )
      }

      // A lista do SIGA pode ter chegado antes de o professor digitar a
      // descrição. Antes de decidir entre usar uma TVC existente e criar uma
      // nova, confere de novo — em todas as turmas selecionadas.
      let mapa = sigaPorTurma
      if (publicar && descricaoSiga.trim()) {
        setBuscandoSiga(true)
        try {
          mapa = await consultarSiga(d, selecionadas)
          setSigaPorTurma(mapa)
        } finally {
          setBuscandoSiga(false)
        }
      }

      const precisaCriarEm = selecionadas.filter((t) => {
        const estado = mapa[t.id]
        if (!estado || estado.erro) return true
        return !estado.opcoes.some((a) => normalizar(a.descricao) === normalizar(descricaoSiga))
      })

      if (publicar && precisaCriarEm.length > 0 && !criarNoSiga) {
        return setErro(
          `A descrição “${descricaoSiga.trim()}” não está confirmada no SIGA de ${precisaCriarEm
            .map((t) => t.codigo_siga)
            .join(', ')}. Escolha uma das avaliações listadas acima ou marque “Criar esta avaliação no SIGA”.`,
        )
      }
      if (publicar && precisaCriarEm.length > 0) {
        if (!dataSiga) return setErro('Informe a data da avaliação no SIGA para criá-la.')
        if (!(Number(pesoSiga) > 0)) return setErro('Informe o peso da avaliação no SIGA.')
      }

      const itens: ItemPublicacao[] = []
      for (const [indice, t] of selecionadas.entries()) {
        setProgresso(`Publicando ${indice + 1}/${selecionadas.length} · ${t.codigo_siga}…`)
        try {
          const criada = await d.criarAvaliacao({
            turma_id: t.id,
            titulo: titulo.trim(),
            tema: tema.trim(),
            instrucoes: instrucoes.trim(),
            instrucoes_correcao: instrucoesCorrecao.trim() || null,
            capitulo: capitulo || null,
            valor_total: total,
            rubrica: rubrica.map((c) => ({ ...c, valor: Number(c.valor) })),
            descricao_siga: descricaoSiga.trim() || null,
            peso_siga: Number(pesoSiga) || 10,
            data_siga: dataSiga || null,
            abre_em: aberturaDaAvaliacao(prazo).toISOString(),
            prazo_em: prazo ? new Date(prazo).toISOString() : null,
            status: publicar ? 'publicada' : 'rascunho',
          })

          let siga: ItemPublicacao['siga'] = publicar ? 'existente' : 'nao_solicitada'
          let erroItem: string | undefined
          const precisaCriar = precisaCriarEm.some((x) => x.id === t.id)
          if (publicar && criarNoSiga && precisaCriar) {
            setProgresso(`Criando ${t.codigo_siga} no SIGA (${indice + 1}/${selecionadas.length})…`)
            try {
              await api('/siga/avaliacao', { avaliacao_id: criada.id }, undefined, 60_000)
              siga = 'criada'
            } catch (e) {
              // A avaliação local já existe; não dá para desfazer sem apagar o
              // que o professor acabou de montar. O item mostra o motivo e a
              // tela da avaliação tem o botão “Criar no SIGA” para a 2ª tentativa.
              siga = 'falhou'
              erroItem = e instanceof Error ? e.message : 'O SIGA não aceitou a criação.'
            }
          }
          itens.push({ turma: t, avaliacao: criada, siga, erro: erroItem })
        } catch (e) {
          itens.push({
            turma: t,
            avaliacao: null,
            siga: 'local_falhou',
            erro: e instanceof Error ? e.message : 'Falha ao criar a avaliação.',
          })
        }
      }

      setResultado(itens)
      if (itens.every((i) => !i.avaliacao)) {
        setErro('Nenhuma avaliação pôde ser criada. Confira a mensagem de cada turma abaixo.')
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao criar a avaliação.')
    } finally {
      setSalvando(false)
      setProgresso(null)
    }
  }

  return (
    <>
      <AppBar titulo="Nova avaliação" subtitulo="Redação com correção por rubrica" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-28">
        <Link href="/" className="text-[13px] text-tinta-suave hover:text-marinho">
          ← Painel
        </Link>

        {turmas.length === 0 ? (
          <Alerta tom="dourado" titulo="Nenhuma turma cadastrada">
            Cadastre a turma e importe a lista de alunos antes de criar a avaliação.{' '}
            <Link href="/prof/alunos" className="font-medium underline">
              Ir para turmas
            </Link>
          </Alerta>
        ) : null}

        {/* noValidate: as mensagens são nossas, em pt-BR e dizendo o que fazer.
            O `required` continua nos campos para leitores de tela anunciarem a
            obrigatoriedade, mas quem barra (e explica) é o `salvar`. */}
        <form onSubmit={salvar} className="space-y-4" noValidate>
          <Cartao className="space-y-3.5">
            <SelecaoTurmas turmas={turmas} selecionadas={turmaIds} onChange={setTurmaIds} />
            <Campo
              rotulo="Título"
              value={titulo}
              onChange={(e) => mudarTitulo(e.target.value)}
              placeholder="Redação 1 — Testes diagnósticos"
              dica="O título preenche a descrição no SIGA; a descrição continua editável para casar com uma TVC existente."
              required
            />
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
            <div>
              <label className="rotulo" htmlFor="instrucoes-correcao">
                Instruções de correção pela LLM (prompt do sistema)
              </label>
              <textarea
                id="instrucoes-correcao"
                className="campo min-h-24"
                value={instrucoesCorrecao}
                onChange={(e) => setInstrucoesCorrecao(e.target.value)}
                maxLength={6000}
                placeholder="Ex.: valorize o uso de exemplos numéricos; não desconte pontos por desvios leves de norma padrão; dê atenção especial à interpretação da prevalência."
                aria-describedby="dica-instrucoes-correcao"
              />
              <p id="dica-instrucoes-correcao" className="dica">
                Opcional. Entra no prompt do sistema da correção automática, além das regras fixas de formato,
                segurança e fidelidade ao texto. Vale para as próximas correções desta avaliação.
              </p>
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
                dica="O padrão é 100 pontos; a rubrica abaixo vem com 4 critérios de 25 e pode ser editada."
              />
            </div>
            <Campo
              rotulo="Data de referência (opcional)"
              type="datetime-local"
              value={prazo}
              onChange={(e) => mudarPrazo(e.target.value)}
              dica="Só para marcar entregas atrasadas; não fecha o envio. Aceita datas passadas para lançamento retroativo. A data no SIGA acompanha o dia escolhido aqui."
            />
          </Cartao>

          <Cartao>
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[16px] text-tinta">Rubrica</h2>
              <span className={`text-[12.5px] font-medium ${somaOk ? 'text-marinho' : 'text-vermelho'}`}>
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
                      aria-label={`Nome do critério ${i + 1}`}
                      value={c.nome}
                      placeholder={`Critério ${i + 1}`}
                      onChange={(e) =>
                        setRubrica((atual) => atual.map((x) => (x.id === c.id ? { ...x, nome: e.target.value } : x)))
                      }
                    />
                    <input
                      className="campo w-20 text-center"
                      type="number"
                      aria-label={`Valor de ${c.nome || `critério ${i + 1}`}`}
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
                A descrição precisa ser idêntica à da avaliação (TVC) no SIGA. Se ela ainda não existir, marque a
                criação abaixo: o app calcula o próximo número da TVC de cada turma.
              </p>
            </div>
            <div className="rounded-xl border border-borda bg-papel/70 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12.5px] leading-snug text-tinta-suave">
                  {selecionadas.length === 0
                    ? 'Escolha as turmas para consultar o SIGA.'
                    : `${selecionadas.length} turma${selecionadas.length > 1 ? 's' : ''}: ${selecionadas
                        .map((t) => t.codigo_siga)
                        .join(', ')}`}
                </p>
                <Botao
                  type="button"
                  variante="fantasma"
                  onClick={buscarSiga}
                  disabled={selecionadas.length === 0}
                  carregando={buscandoSiga}
                  icone={<RefreshCw className="size-4" />}
                >
                  Buscar
                </Botao>
              </div>
              {buscandoSiga ? (
                <p className="mt-1.5 text-[12.5px] leading-snug text-tinta-suave">Consultando o SIGA…</p>
              ) : null}
              {semConsultaEm.length > 0 && !buscandoSiga ? (
                <div className="mt-1.5 text-[12.5px] leading-snug text-dourado">
                  <p>
                    Não consegui conferir o SIGA de {semConsultaEm.map((t) => t.codigo_siga).join(', ')}. Use
                    “Buscar”; se continuar, marque a criação abaixo — se a TVC já existir, o app recusa sem duplicar.
                  </p>
                  {erroSiga ? (
                    <p className="mt-0.5 text-tinta-suave">
                      Motivo: {erroSiga.replace(/\.$/, '')}. Se falar de sessão, saia e entre novamente antes de publicar.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {opcoesSiga.length > 0 ? (
                <ul className="mt-2 space-y-1.5">
                  {opcoesSiga.map((a) => {
                    const ativa = normalizar(descricaoSiga) === normalizar(a.descricao)
                    return (
                      <li key={a.id ?? a.descricao}>
                        <button
                          type="button"
                          onClick={() => escolherSiga(a)}
                          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                            ativa ? 'border-marinho bg-marinho/5' : 'border-borda bg-white hover:border-marinho/40'
                          }`}
                        >
                          <span className="block text-[13.5px] font-medium text-tinta">{a.descricao}</span>
                          <span className="block text-[12px] text-tinta-fraca">
                            {a.data ?? 'sem data'} · peso {a.peso}
                            {a.codigos.length > 1 ? ` · ${a.codigos.length} turmas` : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : null}
              {selecionadas.length > 0 && !buscandoSiga && opcoesSiga.length === 0 && semConsultaEm.length === 0 ? (
                <p className="mt-1.5 text-[12.5px] leading-snug text-tinta-suave">
                  Nenhuma TVC nesta(s) turma(s) do SIGA. Se for criar agora, marque a opção abaixo.
                </p>
              ) : null}
            </div>
            <Campo
              rotulo="Descrição da avaliação no SIGA"
              value={descricaoSiga}
              onChange={(e) => setDescricaoSiga(e.target.value)}
              placeholder="Trabalho prático"
              dica="Começa igual ao título. É o campo descricao_avaliacao da API do SIGA: ajuste para o nome exato da avaliação. O número da TVC é calculado automaticamente pela quantidade de avaliações que já existem na turma."
            />
            {descricaoSiga.trim() && sigaConfere ? (
              <p className="text-[12.5px] leading-snug text-marinho">
                Essa avaliação já existe no SIGA de todas as turmas selecionadas — as notas serão lançadas nela, sem
                criar outra.
              </p>
            ) : null}
            {descricaoSiga.trim() && faltandoEm.length > 0 ? (
              <p className="text-[12.5px] leading-snug text-dourado">
                Essa descrição não aparece no SIGA de {faltandoEm.map((t) => t.codigo_siga).join(', ')}. Se for uma
                avaliação nova, marque a opção abaixo para criá-la agora — ou confira maiúsculas e acentos.
              </p>
            ) : null}
            {publicar && descricaoSiga.trim() && !sigaConfere ? (
              <label className="flex items-start gap-2.5 rounded-xl border border-borda bg-white px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={criarNoSiga}
                  onChange={(e) => setCriarNoSiga(e.target.checked)}
                  className="mt-0.5 size-5 accent-marinho"
                />
                <span className="text-[13px] leading-snug text-tinta">
                  <strong>Criar esta avaliação no SIGA agora.</strong> O app usa a descrição, o peso e a data acima e
                  calcula o próximo número de TVC de cada turma, contando as avaliações que já existem lá. O SIGA não
                  tem rota para apagar uma avaliação — confira antes de publicar.
                </span>
              </label>
            ) : null}
            {publicar &&
            descricaoSiga.trim() &&
            !sigaConfere &&
            (!dataSiga || !(Number(pesoSiga) > 0)) ? (
              <div className="text-[12.5px] leading-snug text-vermelho">
                {!dataSiga ? <p>Informe a data no SIGA para poder criar.</p> : null}
                {!(Number(pesoSiga) > 0) ? <p>Informe o peso da avaliação no SIGA.</p> : null}
              </div>
            ) : null}
            {!publicar ? (
              <p className="text-[12.5px] leading-snug text-tinta-suave">
                Rascunho: nada é criado no SIGA até você publicar.
              </p>
            ) : null}
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
              <Campo
                rotulo="Data no SIGA"
                type="date"
                value={dataSiga}
                onChange={(e) => mudarDataSiga(e.target.value)}
                dica="Também aceita data passada. Mudar esta data ajusta a referência para o mesmo dia, às 23:59."
              />
            </div>
            <p className="text-[12.5px] leading-snug text-tinta-suave">
              As duas datas andam juntas: alterar uma atualiza a outra. A data de referência não fecha o envio —
              ela só marca atraso. Se for anterior a hoje, a avaliação abre um dia antes dela, para o lançamento
              retroativo ficar coerente.
            </p>
            <div className="rounded-lg bg-papel-fundo px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-tinta-suave">
              <p className="mb-1 font-sans text-[11px] font-medium uppercase tracking-wide text-tinta-fraca">
                O que será enviado ao SIGA
              </p>
              <div>turmas: {selecionadas.map((t) => t.codigo_siga).join(', ') || '—'}</div>
              <div>periodo: {[...new Set(selecionadas.map((t) => t.periodo))].join(', ') || '—'}</div>
              <div>descricao_avaliacao: {descricaoSiga.trim() || '—'}</div>
              <div>
                chamadas de criação:{' '}
                {publicar && descricaoSiga.trim()
                  ? selecionadas.filter((t) => turmaTemDescricao(t) !== true).length
                  : 0}{' '}
                · já existentes:{' '}
                {publicar && descricaoSiga.trim()
                  ? selecionadas.filter((t) => turmaTemDescricao(t) === true).length
                  : 0}
              </div>
              <div>notas_json: {'{'} matrícula: nota {'}'} (montado na revisão)</div>
            </div>
          </Cartao>

          <label className="flex items-start gap-2.5 rounded-xl border border-borda bg-white px-3.5 py-3">
            <input
              type="checkbox"
              checked={publicar}
              onChange={(e) => setPublicar(e.target.checked)}
              className="mt-0.5 size-5 accent-marinho"
            />
            <span className="text-[13.5px] leading-snug text-tinta">
              Publicar agora para os alunos. Se desmarcar, fica como rascunho — só você vê.
            </span>
          </label>

          {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}

          {resultado ? (
            <div ref={resultadoRef} aria-live="polite">
              <Cartao className="space-y-2 bg-marinho-claro/40">
                <div>
                  <h2 className="font-serif text-[16px] text-tinta">Última publicação</h2>
                  <p className="mt-0.5 text-[12.5px] leading-snug text-tinta-suave">
                    {resultado.filter((i) => i.avaliacao).length} de {resultado.length} turma
                    {resultado.length > 1 ? 's' : ''} com avaliação local criada. Confira abaixo o resultado no SIGA.
                  </p>
                </div>
                <ul className="divide-y divide-borda">
                  {resultado.map((item) => (
                    <li key={item.turma.id} className="py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium text-tinta">
                            {item.turma.curso} · {item.turma.codigo_siga} · {item.turma.periodo}
                          </p>
                          <p className="truncate text-[11.5px] text-tinta-fraca">{item.turma.nome}</p>
                        </div>
                        {item.avaliacao ? (
                          <Link
                            href={`/prof/avaliacoes/${item.avaliacao.id}`}
                            className="alvo-toque shrink-0 px-1 text-[12.5px] font-medium text-marinho underline underline-offset-2"
                          >
                            Abrir avaliação
                          </Link>
                        ) : null}
                      </div>
                      <p
                        className={`mt-1 text-[12.5px] leading-snug ${
                          item.siga === 'falhou' || item.siga === 'local_falhou' ? 'text-vermelho' : 'text-tinta-suave'
                        }`}
                      >
                        {rotuloDoResultado(item)}
                      </p>
                      {item.erro ? <p className="mt-0.5 text-[12px] leading-snug text-vermelho">{item.erro}</p> : null}
                    </li>
                  ))}
                </ul>
                <p className="text-[12px] leading-snug text-tinta-suave">
                  Para publicar em outras turmas, ajuste a seleção acima e use o botão de novo. Nada foi apagado.
                </p>
              </Cartao>
            </div>
          ) : null}

          <Botao type="submit" largo carregando={salvando}>
            {salvando
              ? publicar
                ? 'Publicando…'
                : 'Salvando…'
              : publicar
                ? selecionadas.length > 1
                  ? `Publicar em ${selecionadas.length} turmas`
                  : 'Publicar avaliação'
                : 'Salvar rascunho'}
          </Botao>
          {salvando && progresso ? (
            <p aria-live="polite" className="text-center text-[12.5px] text-tinta-suave">
              {progresso}
            </p>
          ) : null}
        </form>
      </main>
    </>
  )
}

export function notaResumo(n: number | null | undefined) {
  return formatarNota(n)
}
