import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CheckCircle2, Clock, Download, ShieldAlert, XCircle } from 'lucide-react'
import { usarSessao } from '../lib/sessao'
import { Link } from '../lib/router'
import { Alerta, Botao, Carregando, Cartao, Selo } from '../components/ui'
import { formatarDataHora, formatarNota, plural } from '../lib/formato'
import type { LancamentoAuditado } from '../lib/types'

/**
 * Histórico de lançamentos — a trilha de auditoria, na tela.
 *
 * Tudo o que o servidor tentou gravar no SIGA fica em `lancamentos_siga`,
 * inclusive as tentativas recusadas. Sem esta tela, esse registro só existia no
 * banco: meses depois, para responder "esta nota foi lançada?", "o SIGA recusou
 * alguém?" ou "com que escala?", era preciso abrir o SQL editor.
 *
 * A tela é só leitura. Não há botão de apagar: auditoria que o app pode apagar
 * não é auditoria.
 */
export function ProfessorHistorico({ avaliacaoId }: { avaliacaoId: string }) {
  const { d } = usarSessao()
  const [linhas, setLinhas] = useState<LancamentoAuditado[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!d) return
    try {
      setErro(null)
      setLinhas(await d.historicoLancamentos(avaliacaoId))
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui ler o histórico.')
      setLinhas([])
    }
  }, [d, avaliacaoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const resumo = useMemo(() => {
    const todas = linhas ?? []
    const aceitas = todas.filter((l) => l.sucesso)
    const recusadas = todas.length - aceitas.length
    const ultima = todas[0] ?? null
    return { total: todas.length, aceitas: aceitas.length, recusadas, ultima }
  }, [linhas])

  function baixarCsv() {
    if (!linhas?.length) return
    const celula = (v: string | number | null | undefined) =>
      String(v ?? '').replace(/[\r\n]+/g, ' ').replace(/;/g, ',')
    const csv = [
      ['criado_em', 'matricula', 'nome', 'nota', 'escala', 'sucesso', 'http_status', 'erro', 'descricao', 'turma'],
      ...linhas.map((l) => [
        celula(l.criado_em),
        celula(l.matricula),
        celula(l.aluno_nome),
        celula(l.nota),
        celula(l.escala ?? ''),
        celula(l.sucesso ? 'sim' : 'nao'),
        celula(l.http_status ?? ''),
        celula(l.erro),
        celula(l.descricao_avaliacao),
        celula(`${l.turma_siga} ${l.periodo ?? ''}`.trim()),
      ]),
    ]
      .map((l) => l.join(';'))
      .join('\n')
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'historico-lancamentos.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <header className="border-b border-borda bg-papel/95 px-4 py-3 backdrop-blur">
        <Link
          href={`/prof/avaliacoes/${avaliacaoId}`}
          className="alvo-toque -mx-1 inline-flex items-center gap-1.5 rounded-lg px-1 text-[14px] text-marinho"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Voltar para a avaliação
        </Link>
        <h1 className="mt-1 text-[19px] font-semibold tracking-tight text-tinta">Histórico de lançamentos</h1>
        <p className="text-[13px] text-tinta-suave">
          Cada tentativa de gravar nota no SIGA, aceita ou recusada, fica registrada aqui.
        </p>
      </header>

      <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}

        {linhas === null ? (
          <Carregando texto="Lendo o histórico…" />
        ) : linhas.length === 0 ? (
          <Cartao>
            <div className="flex items-start gap-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-tinta-fraca" aria-hidden />
              <div>
                <p className="text-[15px] font-medium text-tinta">Nenhum lançamento ainda</p>
                <p className="mt-1 text-[13.5px] leading-snug text-tinta-suave">
                  Quando você lançar notas desta avaliação, cada envio aparece aqui com data, nota e a resposta do SIGA.
                </p>
              </div>
            </div>
          </Cartao>
        ) : (
          <>
            <Cartao>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-[15px] font-medium text-tinta">
                  {plural(resumo.total, 'tentativa', 'tentativas')}
                </p>
                <span className="inline-flex items-center gap-1 text-[13px] text-marinho">
                  <CheckCircle2 className="size-4" aria-hidden />
                  {resumo.aceitas} {resumo.aceitas === 1 ? 'aceita' : 'aceitas'}
                </span>
                {resumo.recusadas > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[13px] text-vermelho">
                    <XCircle className="size-4" aria-hidden />
                    {resumo.recusadas} {resumo.recusadas === 1 ? 'recusada' : 'recusadas'}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-[12.5px] text-tinta-suave">
                Última tentativa: {formatarDataHora(resumo.ultima?.criado_em)}
              </p>
              <div className="mt-3">
                <Botao variante="secundario" onClick={baixarCsv} icone={<Download className="size-4" />}>
                  Baixar CSV
                </Botao>
              </div>
            </Cartao>

            <div className="cartao divide-y divide-borda overflow-hidden">
              {linhas.map((l) => (
                <div key={l.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-medium text-tinta">{l.aluno_nome}</p>
                      <p className="text-[12.5px] text-tinta-suave">
                        {l.matricula} · {formatarDataHora(l.criado_em)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-semibold tabular-nums text-tinta">{formatarNota(l.nota)}</p>
                      <p className="text-[11.5px] text-tinta-fraca">{l.escala === 'pontos' ? 'pontos' : 'nota 0–10'}</p>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {l.sucesso ? (
                      <Selo tom="marinho">
                        <CheckCircle2 className="mr-1 size-3.5" aria-hidden />
                        Aceito pelo SIGA{l.http_status ? ` · HTTP ${l.http_status}` : ''}
                      </Selo>
                    ) : (
                      <Selo tom="vermelho">
                        <XCircle className="mr-1 size-3.5" aria-hidden />
                        Recusado{l.http_status ? ` · HTTP ${l.http_status}` : ''}
                      </Selo>
                    )}
                    <span className="text-[12px] text-tinta-fraca">
                      {l.descricao_avaliacao} · {l.turma_siga}
                      {l.periodo ? ` · ${l.periodo}` : ''}
                    </span>
                  </div>

                  {l.erro ? (
                    <p className="mt-2 rounded-lg bg-vermelho-claro px-2.5 py-2 text-[12.5px] leading-snug text-vermelho">
                      {l.erro}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>

            <p className="px-1 text-[12px] leading-snug text-tinta-fraca">
              <ShieldAlert className="mr-1 inline size-3.5 align-text-bottom" aria-hidden />
              Este registro vem do servidor e não pode ser apagado pelo aplicativo — é o comprovante de cada envio ao
              SIGA.
            </p>
          </>
        )}
      </main>
    </>
  )
}
