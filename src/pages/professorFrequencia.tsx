import { useEffect, useMemo, useState } from 'react'
import { CalendarCheck, Check, CheckCheck, Mail, Users, X } from 'lucide-react'
import { Link } from '../lib/router'
import { usarSessao } from '../lib/sessao'
import type { AlunoNaFrequencia, Frequencia, Turma } from '../lib/types'
import { PAPEIS, resultadoValido } from '../lib/personalidade'
import { Avatar } from '../components/Avatar'
import { LegendaPersonalidades, SeloPersonalidade } from '../components/Personalidade'
import { Alerta, AppBar, Botao, Carregando, Cartao, Selecao, Selo } from '../components/ui'

const isoHoje = () => {
  const hoje = new Date()
  const mes = String(hoje.getMonth() + 1).padStart(2, '0')
  const dia = String(hoje.getDate()).padStart(2, '0')
  return `${hoje.getFullYear()}-${mes}-${dia}`
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number)
  if (!ano || !mes || !dia) return iso
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  })
}

/**
 * Chamada do professor: escolhe a turma, a data e marca presença/ausência.
 * A lista mistura a fotografia e a personalidade de quem já criou conta, com
 * cores por grupo, para o reconhecimento ser rápido em sala.
 */
export function ProfessorFrequencia() {
  const { d } = usarSessao()
  const [turmas, setTurmas] = useState<Turma[] | null>(null)
  const [turmaId, setTurmaId] = useState('')
  const [dataAula, setDataAula] = useState(isoHoje)
  const [alunos, setAlunos] = useState<AlunoNaFrequencia[] | null>(null)
  const [salvos, setSalvos] = useState<Frequencia[]>([])
  const [presentes, setPresentes] = useState<Record<string, boolean>>({})
  const [carregando, setCarregando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)

  useEffect(() => {
    if (!d) return
    setErro(null)
    d.turmasTodas()
      .then((lista) => {
        setTurmas(lista)
        setTurmaId((atual) => atual || lista[0]?.id || '')
      })
      .catch((e) => {
        setTurmas([])
        setErro(e instanceof Error ? e.message : 'Falha ao carregar as turmas.')
      })
  }, [d, versao])

  useEffect(() => {
    if (!d || !turmaId || !dataAula) return
    let ativo = true
    setCarregando(true)
    setErro(null)
    setAviso(null)
    Promise.all([d.alunosDaTurmaFrequencia(turmaId), d.frequenciaDaTurma(turmaId, dataAula)])
      .then(([lista, chamada]) => {
        if (!ativo) return
        setAlunos(lista)
        setSalvos(chamada)
        const mapa: Record<string, boolean> = {}
        for (const aluno of lista) {
          const registro = chamada.find((c) => c.matricula === aluno.matricula)
          mapa[aluno.matricula] = registro ? registro.presente : true
        }
        setPresentes(mapa)
      })
      .catch((e) => {
        if (ativo) setErro(e instanceof Error ? e.message : 'Falha ao carregar a chamada.')
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [d, turmaId, dataAula, versao])

  const turma = turmas?.find((t) => t.id === turmaId) ?? null
  const total = alunos?.length ?? 0
  const totalPresentes = useMemo(
    () => (alunos ?? []).filter((a) => presentes[a.matricula] ?? true).length,
    [alunos, presentes],
  )
  const totalAusentes = total - totalPresentes
  const jaRegistrada = salvos.length > 0
  const salvosPorMatricula = useMemo(() => new Map(salvos.map((s) => [s.matricula, s.presente])), [salvos])
  const alterado = useMemo(
    () => (alunos ?? []).some((a) => (presentes[a.matricula] ?? true) !== (salvosPorMatricula.get(a.matricula) ?? true)),
    [alunos, presentes, salvosPorMatricula],
  )

  function todos(presente: boolean) {
    if (!alunos) return
    const mapa: Record<string, boolean> = {}
    for (const aluno of alunos) mapa[aluno.matricula] = presente
    setPresentes(mapa)
    setAviso(null)
  }

  async function salvar() {
    if (!d || !turmaId || !alunos) return
    setSalvando(true)
    setErro(null)
    setAviso(null)
    try {
      await d.salvarFrequencia(
        turmaId,
        dataAula,
        alunos.map((a) => ({
          matricula: a.matricula,
          nome_completo: a.nome_completo,
          aluno_id: a.user_id,
          presente: presentes[a.matricula] ?? true,
        })),
      )
      const chamada = await d.frequenciaDaTurma(turmaId, dataAula)
      setSalvos(chamada)
      setAviso(`Chamada de ${formatarData(dataAula)} salva: ${totalPresentes} presente(s), ${totalAusentes} ausente(s).`)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar a chamada.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <AppBar titulo="Frequência" subtitulo="Chamada por turma e data" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4 pb-24">
        <Link href="/" className="text-[13px] text-tinta-suave hover:text-marinho">
          ← Painel
        </Link>

        {erro && !carregando ? <Alerta tom="vermelho">{erro}</Alerta> : null}

        {turmas === null ? (
          <Carregando texto="Carregando turmas…" />
        ) : turmas.length === 0 ? (
          <Alerta tom="dourado" titulo="Nenhuma turma cadastrada">
            Cadastre a turma e importe a lista de alunos antes de fazer a chamada.{' '}
            <Link href="/prof/alunos" className="font-medium underline">
              Ir para turmas e alunos
            </Link>
          </Alerta>
        ) : (
          <>
            <Cartao className="space-y-3">
              <div className="flex items-center gap-2">
                <CalendarCheck className="size-4 text-marinho" aria-hidden />
                <h2 className="text-[15px] font-medium text-tinta">Escolha a aula</h2>
              </div>
              <Selecao rotulo="Turma" value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
                {turmas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} · {t.periodo}
                  </option>
                ))}
              </Selecao>
              <div>
                <label htmlFor="data-aula" className="rotulo">
                  Data da aula
                </label>
                <input
                  id="data-aula"
                  type="date"
                  className="campo"
                  value={dataAula}
                  onChange={(e) => setDataAula(e.target.value)}
                />
                <p className="dica">A chamada é salva por data: voltar a uma data já registrada carrega o que foi marcado.</p>
              </div>
              {turma ? (
                <p className="flex items-center gap-1.5 text-[12px] text-tinta-suave">
                  <Users className="size-3.5" aria-hidden />
                  {total} estudante(s) na lista · {formatarData(dataAula)}
                </p>
              ) : null}
            </Cartao>

            {carregando ? (
              <Carregando texto="Carregando a lista e a chamada…" />
            ) : alunos && alunos.length === 0 ? (
              <Cartao className="text-center">
                <p className="text-[14px] font-medium text-tinta">A lista desta turma está vazia.</p>
                <p className="mt-1 text-[13px] text-tinta-suave">
                  Importe as matrículas, nomes e e-mails em Turmas e alunos.
                </p>
                <Link href="/prof/alunos" className="mt-3 inline-block text-[13px] font-medium text-marinho underline">
                  Ir para Turmas e alunos
                </Link>
              </Cartao>
            ) : alunos ? (
              <>
                <Cartao className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-[15px] font-medium text-tinta">Lista de chamada</h2>
                      <p className="mt-0.5 text-[12.5px] text-tinta-suave">
                        {totalPresentes} presente(s) · {totalAusentes} ausente(s)
                        {jaRegistrada
                          ? alterado
                            ? ' · alterações não salvas'
                            : ' · chamada registrada nesta data'
                          : ' · ainda não salva'}
                      </p>
                    </div>
                    {jaRegistrada && !alterado ? (
                      <Selo tom="marinho">registrada</Selo>
                    ) : (
                      <Selo tom="dourado">não salva</Selo>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Botao
                      type="button"
                      variante="secundario"
                      className="whitespace-nowrap px-2 py-2 text-[12px]"
                      onClick={() => todos(true)}
                      disabled={!alunos.length}
                      icone={<CheckCheck className="size-4" />}
                    >
                      Todos presentes
                    </Botao>
                    <Botao
                      type="button"
                      variante="secundario"
                      className="whitespace-nowrap px-2 py-2 text-[12px]"
                      onClick={() => todos(false)}
                      disabled={!alunos.length}
                      icone={<X className="size-4" />}
                    >
                      Todos ausentes
                    </Botao>
                  </div>
                  <LegendaPersonalidades />
                </Cartao>

                <div className="cartao overflow-hidden p-0">
                  <ul className="divide-y divide-borda">
                    {alunos.map((aluno) => {
                      const presente = presentes[aluno.matricula] ?? true
                      const personalidade = resultadoValido(aluno.personalidade) ? aluno.personalidade : null
                      const papel = personalidade ? PAPEIS[personalidade.papel] : null
                      return (
                        <li
                          key={aluno.id}
                          className="flex items-center gap-2.5 border-l-4 py-3 pr-3 transition-colors"
                          style={{
                            borderLeftColor: papel?.forte ?? 'transparent',
                            backgroundColor: presente ? 'transparent' : 'var(--color-vermelho-claro)',
                          }}
                        >
                          <span
                            className="ml-1 rounded-full p-0.5"
                            style={{ backgroundColor: papel?.fundo ?? 'var(--color-papel-fundo)' }}
                          >
                            <Avatar
                              nome={aluno.nome_completo}
                              url={aluno.foto_url}
                              tamanho={44}
                              cor={papel?.forte}
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-medium text-tinta">{aluno.nome_completo}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-tinta-suave">
                              <span>{aluno.matricula}</span>
                              <span className="inline-flex min-w-0 items-center gap-1">
                                <Mail className="size-3 shrink-0" aria-hidden />
                                <span className="truncate">{aluno.email}</span>
                              </span>
                            </p>
                            <div className="mt-1">
                              <SeloPersonalidade resultado={personalidade} compacto />
                            </div>
                          </div>
                          <label
                            className={`flex shrink-0 cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors ${
                              presente
                                ? 'border-marinho/25 bg-marinho-claro text-marinho-escuro'
                                : 'border-vermelho/25 bg-white text-vermelho'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={presente}
                              onChange={() =>
                                setPresentes((atuais) => ({ ...atuais, [aluno.matricula]: !presente }))
                              }
                              className="sr-only"
                              aria-label={`Presença de ${aluno.nome_completo}`}
                            />
                            {presente ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                            {presente ? 'Presente' : 'Ausente'}
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                  <div className="space-y-2 border-t border-borda bg-papel-fundo/50 p-3">
                    <p className="text-[11.5px] leading-relaxed text-tinta-fraca">
                      A cor da borda e do selo indica o grupo de personalidade. Quem ainda não fez o teste aparece em
                      cinza. A presença é registrada no app; ela não altera sozinha a frequência oficial do SIGA.
                    </p>
                    <Botao
                      type="button"
                      largo
                      onClick={() => void salvar()}
                      carregando={salvando}
                      disabled={!dataAula || !alunos.length}
                      icone={<CalendarCheck className="size-4" />}
                    >
                      Salvar chamada
                    </Botao>
                  </div>
                </div>

                {aviso ? <Alerta tom="marinho">{aviso}</Alerta> : null}
              </>
            ) : null}
          </>
        )}

        {turmas && turmas.length > 0 && erro ? (
          <Botao type="button" variante="secundario" largo onClick={() => setVersao((v) => v + 1)}>
            Tentar de novo
          </Botao>
        ) : null}
      </main>
    </>
  )
}
