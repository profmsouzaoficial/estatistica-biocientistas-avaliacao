import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, FileUp, Plus, UserPlus } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { Link } from '../lib/router'
import { Alerta, AppBar, Botao, Campo, Carregando, Cartao, Selo } from '../components/ui'
import type { Esperado, Turma } from '../lib/types'
import type { LinhaImportacao } from '../lib/dados'

/** Aceita CSV com ; ou , ou tab: matricula, nome, email (com ou sem cabeçalho). */
export function interpretarCsv(texto: string): { linhas: LinhaImportacao[]; problemas: string[] } {
  const problemas: string[] = []
  const linhas: LinhaImportacao[] = []
  const brutas = texto
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  brutas.forEach((linha, indice) => {
    const separador = linha.includes(';') ? ';' : linha.includes('\t') ? '\t' : ','
    const campos = linha.split(separador).map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
    if (indice === 0 && /matr[íi]cula|nome|email/i.test(campos[0]) && !/^\d+$/.test(campos[0])) return
    if (campos.length < 3) {
      problemas.push(`Linha ${indice + 1}: precisa de matrícula, nome e e-mail.`)
      return
    }
    const [matricula, nome, email] = campos
    if (!/^\d{4,}$/.test(matricula)) {
      problemas.push(`Linha ${indice + 1}: matrícula "${matricula}" não parece válida.`)
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      problemas.push(`Linha ${indice + 1}: e-mail "${email}" inválido.`)
      return
    }
    if (linhas.some((l) => l.matricula === matricula)) {
      problemas.push(`Linha ${indice + 1}: matrícula ${matricula} repetida.`)
      return
    }
    linhas.push({ matricula, nome_completo: nome, email })
  })

  return { linhas, problemas }
}

export function ProfessorAlunos() {
  const { d } = usarSessao()

  const [turmas, setTurmas] = useState<Turma[] | null>(null)
  const [turmaId, setTurmaId] = useState('')
  const [alunos, setAlunos] = useState<Esperado[] | null>(null)
  const [texto, setTexto] = useState('')
  const [previa, setPrevia] = useState<ReturnType<typeof interpretarCsv> | null>(null)
  const [msg, setMsg] = useState<{ tom: 'verde' | 'vermelho' | 'ambar'; texto: string } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)

  const [mostrarNovaTurma, setMostrarNovaTurma] = useState(false)
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

  async function importar() {
    if (!d || !turmaId) return
    const p = interpretarCsv(texto)
    setPrevia(p)
    if (p.linhas.length === 0) return
    setOcupado(true)
    setMsg(null)
    try {
      const r = await d.importarAlunos(turmaId, p.linhas)
      await carregarAlunos(turmaId)
      setMsg({ tom: 'verde', texto: `${r.inseridos} incluídos, ${r.atualizados} atualizados.` })
      setTexto('')
      setPrevia(null)
    } catch (e) {
      setMsg({ tom: 'vermelho', texto: e instanceof Error ? e.message : 'Falha ao importar.' })
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
                  </p>
                ) : null}
              </Cartao>
            )}

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
                    Cole as linhas ou envie um CSV com <strong>matricula;nome;email</strong> — uma por aluno. O aluno só
                    consegue se cadastrar se a matrícula e o e-mail estiverem aqui.
                  </p>

                  <textarea
                    className="campo mt-2 min-h-32 font-mono text-[13px]"
                    placeholder={'2026301001;Ana Beatriz Lima;ana.lima@estudante.ufjf.br\n2026301002;Carlos Eduardo Nunes;carlos.nunes@estudante.ufjf.br'}
                    value={texto}
                    onChange={(e) => {
                      setTexto(e.target.value)
                      setPrevia(null)
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
                      const conteudo = await arquivo.text()
                      setTexto(conteudo)
                      setPrevia(interpretarCsv(conteudo))
                      e.target.value = ''
                    }}
                  />

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
                            {a.matricula} · {a.email}
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
