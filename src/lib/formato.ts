/** Utilitários de formatação em pt-BR. */
import type { Turma } from './types'

const dataHoraLonga = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return dataHoraLonga.format(d)
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return dataCurta.format(d)
}

export function formatarNota(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toFixed(1).replace('.', ',')
}

export function formatarPontos(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')
}

/**
 * A entrega aconteceu depois do prazo?
 *
 * Devolve `null` quando a pergunta não se aplica: sem prazo definido, ou sem
 * envio. O app não bloqueia a entrega atrasada — só avisa o aluno antes do
 * envio e marca a redação para o professor, porque quem decide sobre atraso é
 * quem dá a nota, não o sistema.
 */
export function atrasoDeEntrega(
  enviadoEm: string | null | undefined,
  prazoEm: string | null | undefined,
): boolean | null {
  if (!prazoEm || !enviadoEm) return null
  const envio = new Date(enviadoEm).getTime()
  const prazo = new Date(prazoEm).getTime()
  if (Number.isNaN(envio) || Number.isNaN(prazo)) return null
  return envio > prazo
}

/** Rótulo completo usado nos seletores de turma do professor. */
export function rotuloDaTurma(t: Pick<Turma, 'curso' | 'codigo_siga' | 'periodo' | 'nome'>): string {
  const curso = t.curso?.trim() || 'Curso não informado'
  return `${curso} · ${t.codigo_siga} · ${t.periodo} — ${t.nome}`
}

/** "há 3 minutos", "em 2 dias" — ajuda a leitura rápida do prazo. */
export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const diff = d - Date.now()
  const abs = Math.abs(diff)
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })
  const min = 60_000
  const hora = 60 * min
  const dia = 24 * hora
  if (abs < min) return 'agora'
  if (abs < hora) return rtf.format(Math.round(diff / min), 'minute')
  if (abs < dia) return rtf.format(Math.round(diff / hora), 'hour')
  if (abs < 30 * dia) return rtf.format(Math.round(diff / dia), 'day')
  return formatarData(iso)
}

export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return '?'
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
}

/** Primeiro nome, para saudações. */
export function primeiroNome(nome: string): string {
  const p = nome.trim().split(/\s+/)
  if (p.length <= 2) return p[0] ?? nome
  // nomes compostos comuns: "Ana Paula", "João Pedro"
  return `${p[0]} ${p[1]}`
}

export function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`
}

/** Valor do `<input type="datetime-local">`: data e hora locais, sem fuso. */
export function paraInputLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * "Agora" no formato do `datetime-local`, para usar como `min` do campo.
 * Um minuto à frente: o minuto corrente já pode ter passado, e o seletor do
 * navegador não deve oferecer uma data que o validador vai recusar.
 */
export function agoraParaInput(): string {
  return paraInputLocal(new Date(Date.now() + 60_000).toISOString())
}
