import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, FileUp, Plus, Trash2, UserPlus } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { Link } from '../lib/router'
import { Alerta, AppBar, Botao, Campo, Carregando, Cartao, Selo } from '../components/ui'
import { plural } from '../lib/formato'
import type { Esperado, Turma } from '../lib/types'
import type { ResumoTurma } from '../lib/dados'
import { decodificarArquivo, interpretarCsv } from '../lib/csv'

export function ProfessorAlunos() {
  const { d } = usarSessao()

  const [turmas, setTurmas] = useState<Turma[] | null>(null)
  const [turmaId, setTurmaId] = useState('')
  const [alunos, setAlunos] = useState<Esperado[] | null>(null)
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState<ReturnType<typeof interpretarCsv> | null>(null)
  /** Aviso sobre o arquivo lido (planilha do Excel, codificação do CSV). */
  const [avisoArquivo, setAvisoArquivo] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho' | 'ambar'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  // A caixa de e-mail é otimista: o clique muda a tela na hora e volta atrás
  // se o banco recusar. Sem isso, o React re-renderiza com o valor antigo e a
  // caixa "pula" de volta antes de a gravação terminar.
  const [exigindoLocal, setExigindoLocal] = useState<boolean | null>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const [mostrarNovaTurma, setMostrarNovaTurma] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [resumo, setResumo] = useState<ResumoTurma | null>(null)
  const [codigoRemocao, setCodigoRemocao] = useState('')
  const [novaTurma, setNovaTurma] = useState({ nome: '', codigo_siga: '', periodo: '2026/3', curso: 'Ciências Biológicas' })

  useEffect(() => {
    if (!d) return
    d.turmasTodas()
      .then((t) => {
        setTurmas(t)
        if (t.length === 1) setTurmaId(t[0].id)
      })
      .catch((e) => setMsg({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Falha ao carregar.' }))
  }, [d])

  const carregarAlunos = useCallback(
    async (id: string) => {
      if (!d || !id) return setAlunos([])
      setAlunos(await d.alunosDaTurma(id))
    },
    [d],
  )

  useEffect(() => {
    carregarAlunos(turmaId).catch(() => setAlunos([]))
  }, [turmaId, carregarAlunos])

  const cadastrados = useMemo(() => (alunos ?? []).filter((a) => a.user_id).length, [alunos])
  const turma = useMemo(() => (turmas ?? []).find((t) => t.id === turmaId) ?? null, [turmas, turmaId])
  const exigirEmail = exigindoLocal ?? turma?.exige_email ?? true
  const semEmail = useMemo(() => (alunos ?? []).filter((a) => !a.email.trim()).length, [alunos])

  async function alternarExigenciaDeEmail(exige: boolean) {
    if (!d || !turmaId) return
    setExigindoLocal(exige)
    setOcupado(true)
    setMsg(null)
    try {
      await d.definirExigenciaDeEmail(turmaId, exige)
      const lista = await d.turmasTodas()
      // RLS que barra a atualização devolve 0 linhas sem erro: confere o valor
      const conferida = lista.find((t) => t.id === turmaId)
      if (conferida && conferida.exige_email !== exige) {
        throw new Error('O banco não gravou a mudança. Confira se você está logado como professor.')
      }
      setTurmas(lista)
      setExigindoLocal(null)
      setPrevia(null)
      setMsg({
        tom: 'verde',
        texto: exige
          ? 'A lista volta a exigir o e-mail de cada aluno.'
          : 'Agora a lista pode vir só com matrícula e nome: no cadastro, o aluno informa o próprio e-mail.',
      })
    } catch (e) {
      setExigindoLocal(null)
      setMsg({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Falha ao mudar a exigência de e-mail.' })
    } finally {
      setOcupado(false)
    }
  }

  async function importar() {
    if (!d || !turmaId) return
    const p = interpretarCsv(texto, { exigirEmail })
    setPrevia(p)
    if (p.linhas.length === 0) return
    setOcupado(true)
    setMsg(null)
    try {
      const r = await d.importarAlunos(turmaId, p.linhas)
      await carregarAlunos(turmaId)
      setMsg({
        tom: 'verde',
        texto: `${plural(r.inseridos, 'aluno incluído', 'alunos incluídos')}, ${plural(r.atualizados, 'atualizado', 'atualizados')}.`,
      })
      setTexto('')
      setPrevia(null)
    } catch (e) {
      setMsg({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Falha ao importar.' })
    } finally {
      setOcupado(false)
    }
  }

  async function abrirRemocao() {
    if (!d || !turmaId) return
    setOcupado(true)
    setMsg(null)
    try {
      setResumo(await d.resumoTurma(turmaId))
      setCodigoRemocao('')
      setRemovendo(true)
    } catch (e) {
      setMsg({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Não foi possível ler o resumo da turma.' })
    } finally {
      setOcupado(false)
    }
  }

  async function confirmarRemocao() {
    if (!d || !turmaId || !turma) return
    setOcupado(true)
    setMsg(null)
    try {
      const r = await d.apagarTurma(turmaId)
      if (!r.ok) {
        setMsg({
          tom: 'vermelho',
          texto:
            r.motivo === 'tem_lancamentos'
              ? `Esta turma já tem ${plural(r.lancadas ?? 0, 'nota lançada', 'notas lançadas')} no SIGA. Apagar tiraria o histórico do lançamento, então o app não deixa.`
              : r.motivo === 'sem_permissao'
                ? 'Só o professor pode remover uma turma. Entre com a conta do professor.'
                : 'Esta turma não existe mais. Atualize a página.',
        })
        return
      }
      const lista = await d.turmasTodas()
      setTurmas(lista)
      setTurmaId(lista[0]?.id ?? '')
      setAlunos(null)
      setRemovendo(false)
      setResumo(null)
      setMsg({
        tom: 'verde',
        texto:
          `Turma ${turma.codigo_siga} removida, com ${plural(r.alunos, 'aluno', 'alunos')} e ` +
          `${plural(r.avaliacoes, 'avaliação', 'avaliações')}` +
          `${r.fotos_apagadas ? ` e ${plural(r.fotos_apagadas, 'foto', 'fotos')}` : ''}.`,
      })
    } catch (e) {
      setMsg({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Falha ao remover a turma.' })
    } finally {
      setOcupado(false)
    }
  }

  async function criarTurma(e: React.FormEvent) {
    e.preventDefault()
    if (!d) return
    setOcupado(true)
    setMsg(null)
    try {
      const t = await d.criarTurma(novaTurma)
      const lista = await d.turmasTodas()
      setTurmas(lista)
      setTurmaId(t.id)
      setMostrarNovaTurma(false)
      setNovaTurma({ nome: '', codigo_siga: '', periodo: '2026/3', curso: 'Ciências Biológicas' })
      setMsg({ tom: 'verde', texto: 'Turma criada. Agora importe a lista de alunos.' })
    } catch (e) {
      setMsg({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Falha ao criar a turma.' })
    } finally {
      setOcupado(false)
    }
  }

  return (
    <>
      <AppBar titulo="Turmas e alunos" subtitulo="A lista é a chave do cadastro e da matrícula no SIGA" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-24">
        <Link href="/" className="text-[13px] text-tinta-suave hover:text-verde">
          ← Painel
        </Link>

        {msg ? <Alerta tom={msg.tom}>{msg.texto}</Alerta> : null}

        {turmas === null ? (
          <Carregando />
        ) : (
          <>
            {turmas.length === 0 ? (
              <Alerta tom="ambar" titulo="Comece pela turma">
                Crie a turma com o código do SIGA (ex.: CBV018GV-A) e o período (ex.: 2026/3).
              </Alerta>
            ) : (
              <Cartao className="space-y-2">
                <label className="rotulo" htmlFor="turma-sel">Turma</label>
                <select id="turma-sel" className="campo" value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
                  <option value="">Selecione…</option>
                  {turmas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} · {t.periodo} ({t.codigo_siga})
                    </option>
                  ))}
                </select>
                {turmaId ? (
                  <p className="text-[12.5px] text-tinta-suave">
                    {alunos?.length ?? 0} na lista · {cadastrados} com conta criada
                    {exigirEmail ? '' : ' · ' + semEmail + ' sem e-mail na lista'}
                  </p>
                ) : null}

                {turmaId ? (
                  <label className="mt-1 flex items-start gap-2.5 rounded-xl bg-papel-fundo px-3 py-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--color-verde)]"
                      checked={exigirEmail}
                      disabled={ocupado}
                      onChange={(e) => alternarExigenciaDeEmail(e.target.checked)}
                    />
                    <span className="text-[13px] leading-snug text-tinta-suave">
                      <strong className="font-medium text-tinta">Exigir o e-mail na lista</strong>
                      <br />
                      Desmarque quando a lista vier do SIGA só com matrícula e nome. O aluno digita o
                      próprio e-mail no cadastro e ele fica registrado nesta lista.
                    </span>
                  </label>
                ) : null}

                {turmaId ? (
                  <button
                    type="button"
                    onClick={abrirRemocao}
                    disabled={ocupado}
                    className="alvo-toque mt-1 self-start justify-start text-[12.5px] text-tinta-fraca underline decoration-dotted underline-offset-2 hover:text-vermelho disabled:opacity-50"
                  >
                    Remover esta turma…
                  </button>
                ) : null}
              </Cartao>
            )}

            {removendo && turma ? (
              <Cartao className="space-y-3 border-vermelho/30">
                <div className="flex items-center gap-2">
                  <Trash2 className="size-4 text-vermelho" aria-hidden />
                  <h2 className="font-serif text-[16px] text-tinta">Remover {turma.nome}</h2>
                </div>
                <Alerta tom="vermelho" titulo="Isto não pode ser desfeito">
                  Somem a lista com {plural(resumo?.alunos ?? alunos?.length ?? 0, 'aluno', 'alunos')},{' '}
                  {plural(resumo?.avaliacoes ?? 0, 'avaliação', 'avaliações')} e{' '}
                  {plural(resumo?.enviadas ?? 0, 'redação enviada', 'redações enviadas')}. As contas dos alunos
                  continuam existindo, mas ficam sem turma. Se alguma nota já foi lançada no SIGA, a remoção é
                  bloqueada.
                </Alerta>
                <Campo
                  rotulo={`Digite ${turma.codigo_siga} para confirmar`}
                  value={codigoRemocao}
                  onChange={(e) => setCodigoRemocao(e.target.value.toUpperCase())}
                  placeholder={turma.codigo_siga}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
                <div className="flex flex-wrap gap-2">
                  <Botao
                    variante="perigo"
                    onClick={confirmarRemocao}
                    carregando={ocupado}
                    disabled={codigoRemocao.trim().toUpperCase() !== turma.codigo_siga.toUpperCase()}
                    icone={<Trash2 className="size-4" />}
                  >
                    Remover turma definitivamente
                  </Botao>
                  <Botao
                    variante="secundario"
                    onClick={() => {
                      setRemovendo(false)
                      setResumo(null)
                      setCodigoRemocao('')
                    }}
                  >
                    Cancelar
                  </Botao>
                </div>
              </Cartao>
            ) : null}

            <Botao
              variante="secundario"
              onClick={() => setMostrarNovaTurma((v) => !v)}
              icone={<Plus className="size-4" />}
            >
              {mostrarNovaTurma ? 'Fechar' : 'Nova turma'}
            </Botao>

            {mostrarNovaTurma ? (
              <Cartao>
                <form onSubmit={criarTurma} className="space-y-3">
                  <Campo
                    rotulo="Nome da turma"
                    value={novaTurma.nome}
                    onChange={(e) => setNovaTurma({ ...novaTurma, nome: e.target.value })}
                    placeholder="Biociências — Turma A"
                    required
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Campo
                      rotulo="Código no SIGA"
                      value={novaTurma.codigo_siga}
                      onChange={(e) => setNovaTurma({ ...novaTurma, codigo_siga: e.target.value.toUpperCase() })}
                      placeholder="CBV018GV-A"
                      required
                    />
                    <Campo
                      rotulo="Período"
                      value={novaTurma.periodo}
                      onChange={(e) => setNovaTurma({ ...novaTurma, periodo: e.target.value })}
                      placeholder="2026/3"
                      required
                    />
                  </div>
                  <Campo
                    rotulo="Curso"
                    value={novaTurma.curso}
                    onChange={(e) => setNovaTurma({ ...novaTurma, curso: e.target.value })}
                  />
                  <Botao type="submit" largo carregando={ocupado}>
                    Criar turma
                  </Botao>
                </form>
              </Cartao>
            ) : null}

            {turmaId ? (
              <>
                <Cartao>
                  <h2 className="flex items-center gap-1.5 font-serif text-[16px] text-tinta">
                    <UserPlus className="size-4" aria-hidden /> Importar lista
                  </h2>
                  <p className="mt-1 text-[12.5px] leading-snug text-tinta-suave">
                    Cole as linhas ou envie um CSV com{' '}
                    <strong>{exigirEmail ? 'matricula;nome;email' : 'matricula;nome'}</strong> — uma por aluno.{' '}
                    {exigirEmail
                      ? 'O aluno só consegue se cadastrar se a matrícula e o e-mail estiverem aqui.'
                      : 'Sem o e-mail na lista, o aluno digita o dele no cadastro e a matrícula fica vinculada a esse e-mail.'}
                  </p>

                  <textarea
                    className="campo mt-2 min-h-32 font-mono text-[13px]"
                    placeholder={
                      exigirEmail
                        ? '2026301001;Ana Beatriz Lima;ana.lima@estudante.ufjf.br\n2026301002;Carlos Eduardo Nunes;carlos.nunes@estudante.ufjf.br'
                        : '2026301001;Ana Beatriz Lima\n2026301002;Carlos Eduardo Nunes'
                    }
                    value={texto}
                    onChange={(e) => {
                      setTexto(e.target.value)
                      setPrevia(null)
                      setAvisoArquivo(null)
                    }}
                  />

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Botao
                      variante="secundario"
                      onClick={() => arquivoRef.current?.click()}
                      icone={<FileUp className="size-4" />}
                    >
                      Enviar CSV
                    </Botao>
                    <Botao onClick={importar} disabled={!texto.trim()} carregando={ocupado}>
                      Conferir e importar
                    </Botao>
                  </div>
                  <input
                    ref={arquivoRef}
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    className="hidden"
                    onChange={async (e) => {
                      const arquivo = e.target.files?.[0]
                      if (!arquivo) return
                      // Lemos os bytes, não o texto: o Excel em português grava
                      // CSV em Windows-1252, e "Conceição" viraria "Concei??o".
                      const { texto: conteudo, aviso } = decodificarArquivo(await arquivo.arrayBuffer())
                      setAvisoArquivo(aviso)
                      setTexto(conteudo)
                      setPrevia(conteudo.trim() ? interpretarCsv(conteudo, { exigirEmail }) : null)
                      e.target.value = ''
                    }}
                  />

                  {avisoArquivo ? (
                    <div className="mt-3 rounded-xl bg-ambar-claro px-3 py-2.5 text-[13px] leading-snug text-tinta">
                      {avisoArquivo}
                    </div>
                  ) : null}

                  {previa ? (
                    <div className="mt-3 rounded-xl bg-papel-fundo px-3 py-2.5 text-[13px]">
                      <p className="font-medium text-tinta">
                        {previa.linhas.length} linha(s) válida(s)
                        {previa.problemas.length ? ` · ${previa.problemas.length} com problema` : ''}
                      </p>
                      {previa.problemas.length ? (
                        <ul className="mt-1.5 space-y-0.5 text-vermelho">
                          {previa.problemas.slice(0, 6).map((p, i) => (
                            <li key={i}>• {p}</li>
                          ))}
                          {previa.problemas.length > 6 ? <li>…e mais {previa.problemas.length - 6}.</li> : null}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </Cartao>

                <div className="cartao divide-y divide-borda overflow-hidden">
                  {alunos === null ? (
                    <Carregando />
                  ) : alunos.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[14px] text-tinta-suave">Nenhum aluno nesta turma.</p>
                  ) : (
                    alunos.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-tinta">{a.nome_completo}</p>
                          <p className="truncate text-[12px] text-tinta-suave">
                            {a.matricula} · {a.email || 'e-mail ainda não informado'}
                          </p>
                        </div>
                        {a.user_id ? (
                          <Selo tom="verde">
                            <CheckCircle2 className="size-3" aria-hidden /> conta criada
                          </Selo>
                        ) : (
                          <Selo>sem conta</Selo>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : null}
          </>
        )}
      </main>
    </>
  )
}
