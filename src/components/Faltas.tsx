import { CalendarX, UserX } from 'lucide-react'
import type { MinhaFrequencia } from '../lib/types'
import {
  HORAS_POR_FALTA,
  LIMITE_FALTAS,
  rotuloFaltas,
  situacaoFaltas,
} from '../lib/frequencia'
import { plural } from '../lib/formato'
import { Alerta, Cartao, Selo } from './ui'

function tomDaSituacao(faltas: number, limite = LIMITE_FALTAS): 'marinho' | 'dourado' | 'vermelho' {
  const situacao = situacaoFaltas(faltas, limite)
  if (situacao === 'limite') return 'vermelho'
  if (situacao === 'atencao') return 'dourado'
  return 'marinho'
}

/**
 * Selo compacto para a lista do professor. O texto visível é só o número de
 * faltas; o título e o aviso abaixo da lista explicam que a conta é do semestre.
 */
export function SeloFaltas({
  faltas,
  compacto = false,
  className = '',
  limite = LIMITE_FALTAS,
}: {
  faltas: number
  compacto?: boolean
  className?: string
  /** Limite efetivo; o padrão é a regra do semestre (5 faltas = 15 h). */
  limite?: number
}) {
  const texto = rotuloFaltas(faltas)
  const horas = limite * HORAS_POR_FALTA
  return (
    <span
      title={`${texto} no semestre · limite de ${limite} faltas (${horas} h) — reprovação por falta`}
      className={className}
    >
      <Selo tom={tomDaSituacao(faltas, limite)}>
        <UserX className="size-3" aria-hidden />
        {compacto ? texto : `${texto} no semestre`}
      </Selo>
    </span>
  )
}

/**
 * Cartão da página inicial do aluno. Mostra a contagem registrada no app,
 * quanto isso representa em horas e a situação em relação ao limite de 5
 * faltas (15 h). A frequência oficial continua sendo a do SIGA.
 */
export function CartaoMinhaFrequencia({
  resumo,
  erro,
}: {
  resumo: MinhaFrequencia | null
  erro: string | null
}) {
  if (erro) {
    return (
      <Alerta tom="dourado" titulo="Não foi possível carregar sua frequência">
        {erro}
      </Alerta>
    )
  }

  if (!resumo) {
    return (
      <Cartao>
        <p className="text-[13px] text-tinta-suave" role="status">
          Carregando sua frequência…
        </p>
      </Cartao>
    )
  }

  const limite = Math.max(1, resumo.limite || LIMITE_FALTAS)
  const horasPorFalta = resumo.horas_por_falta || HORAS_POR_FALTA
  const horasLimite = limite * horasPorFalta
  const faltas = Math.max(0, resumo.faltas)
  const noLimite = faltas >= limite
  const atencao = !noLimite && situacaoFaltas(faltas, limite) === 'atencao'
  const cor = noLimite ? 'var(--color-vermelho)' : atencao ? 'var(--color-dourado)' : 'var(--color-marinho)'
  const percentual = Math.min(100, Math.round((faltas / limite) * 100))
  const horas = faltas * horasPorFalta

  const mensagem =
    resumo.aulas === 0
      ? 'Ainda não há chamadas salvas nesta turma. O contador aparece quando o professor registrar a primeira aula.'
      : noLimite
        ? `Você atingiu o limite de ${limite} faltas (${horasLimite} h). No critério da disciplina, isso significa reprovação por falta. Procure o professor; a frequência oficial é a do SIGA.`
        : atencao
          ? `Atenção: você está perto do limite de ${limite} faltas (${horasLimite} h) no semestre.`
          : faltas === 0
            ? 'Nenhuma falta registrada até agora. Continue assim.'
            : `Você está dentro do limite de ${limite} faltas (${horasLimite} h) no semestre.`

  return (
    <Cartao className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarX className="size-4 text-marinho" aria-hidden />
          <h2 className="font-serif text-[18px] text-tinta">Sua frequência</h2>
        </div>
        <SeloFaltas faltas={faltas} limite={limite} />
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <p className="font-serif text-[30px] leading-none text-tinta">
          {faltas}
          <span className="ml-1.5 font-sans text-[13px] font-medium text-tinta-suave">
            {faltas === 1 ? 'falta' : 'faltas'}
          </span>
        </p>
        <p className="text-[12.5px] text-tinta-suave">
          {horas} h de {horasLimite} h · {plural(resumo.aulas, 'aula registrada', 'aulas registradas')}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="Faltas no semestre"
        aria-valuemin={0}
        aria-valuemax={limite}
        aria-valuenow={Math.min(faltas, limite)}
        aria-valuetext={`${rotuloFaltas(faltas)} de ${limite} faltas`}
        className="h-2 overflow-hidden rounded-full bg-papel-fundo"
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${percentual}%`, backgroundColor: cor }}
        />
      </div>

      <p className={`text-[12.5px] leading-relaxed ${noLimite ? 'font-medium text-vermelho' : 'text-tinta-suave'}`}>
        {mensagem}
      </p>
      <p className="text-[11.5px] leading-relaxed text-tinta-fraca">
        A contagem soma as chamadas salvas pelo professor nesta turma. Cada aula vale {horasPorFalta} h; o limite
        do semestre é {limite} faltas ({horasLimite} h). A frequência oficial é a do SIGA.
      </p>
    </Cartao>
  )
}
