import { useState } from 'react'
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import {
  EIXOS,
  ESCALA,
  ESTRATEGIAS,
  PAPEIS,
  PERGUNTAS,
  calcularResultado,
  infoDoTipo,
  resultadoValido,
} from '../lib/personalidade'
import type { ResultadoPersonalidade } from '../lib/types'
import { usarSessao } from '../lib/sessao'
import { Alerta, Botao, Cartao } from './ui'

const TOTAL = PERGUNTAS.length
const LINK_OFICIAL = 'https://www.16personalities.com/br'

/**
 * Bloco de personalidade do perfil do aluno.
 *
 * O questionário é uma adaptação educacional: 30 afirmações originais, cinco
 * eixos e uma escala de 7 pontos, inspirado no modelo dos 16 tipos. O texto
 * deixa claro que não é o teste oficial — e oferece o link para quem quiser
 * fazer o original.
 */
export function TestePersonalidade() {
  const { d, perfil, recarregar } = usarSessao()
  const [fazendo, setFazendo] = useState(false)
  const [indice, setIndice] = useState(0)
  const [respostas, setRespostas] = useState<Record<number, number>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  if (!perfil) return null

  const resultado: ResultadoPersonalidade | null = resultadoValido(perfil.personalidade)
    ? perfil.personalidade
    : null

  function comecar() {
    setRespostas({})
    setIndice(0)
    setErro(null)
    setAviso(null)
    setFazendo(true)
  }

  function sairDoTeste() {
    setFazendo(false)
    setErro(null)
  }

  async function concluir() {
    if (!d) return
    setErro(null)
    try {
      const calculado = calcularResultado(respostas)
      setSalvando(true)
      await d.salvarPersonalidade(calculado)
      await recarregar()
      setFazendo(false)
      setAviso('Resultado salvo no seu perfil.')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o resultado.')
    } finally {
      setSalvando(false)
    }
  }

  function responder(valor: number) {
    setRespostas((atuais) => ({ ...atuais, [PERGUNTAS[indice].id]: valor }))
  }

  function avancar() {
    if (!respostas[PERGUNTAS[indice].id]) return
    if (indice === TOTAL - 1) {
      void concluir()
      return
    }
    setIndice((n) => Math.min(TOTAL - 1, n + 1))
  }

  if (fazendo) {
    const pergunta = PERGUNTAS[indice]
    const respondida = Boolean(respostas[pergunta.id])
    const progresso = Math.round((indice / TOTAL) * 100)
    return (
      <Cartao className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-tinta-fraca">Personalidade</p>
            <h2 className="font-serif text-[19px] text-tinta">Como você costuma ser?</h2>
          </div>
          <span className="rounded-full bg-marinho-claro px-2.5 py-1 text-[11.5px] font-medium text-marinho-escuro">
            {indice + 1}/{TOTAL}
          </span>
        </div>

        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-papel-fundo" aria-hidden>
            <div className="h-full rounded-full bg-marinho transition-[width]" style={{ width: `${Math.max(3, progresso)}%` }} />
          </div>
          <p className="mt-1.5 text-[11.5px] text-tinta-fraca" aria-live="polite">
            Pergunta {indice + 1} de {TOTAL}
          </p>
        </div>

        <fieldset>
          <legend className="font-serif text-[20px] leading-snug text-tinta">{pergunta.texto}</legend>
          <p className="mt-1 text-[12.5px] text-tinta-suave">Escolha o quanto você concorda, sem pensar demais.</p>
          <div className="mt-3 space-y-1.5">
            {ESCALA.map((rotulo, i) => {
              const valor = i + 1
              const marcado = respostas[pergunta.id] === valor
              return (
                <label
                  key={rotulo}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[13.5px] transition-colors ${
                    marcado
                      ? 'border-marinho bg-marinho-claro font-medium text-marinho-escuro'
                      : 'border-borda bg-white text-tinta hover:bg-papel-fundo'
                  }`}
                >
                  <input
                    type="radio"
                    name={`personalidade-${pergunta.id}`}
                    value={valor}
                    checked={marcado}
                    onChange={() => responder(valor)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] ${
                      marcado ? 'border-marinho bg-marinho text-white' : 'border-borda text-tinta-fraca'
                    }`}
                  >
                    {marcado ? <Check className="size-3.5" /> : valor}
                  </span>
                  <span>{rotulo}</span>
                </label>
              )
            })}
          </div>
        </fieldset>

        {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}

        <div className="flex items-center gap-2">
          <Botao
            type="button"
            variante="secundario"
            onClick={() => (indice === 0 ? sairDoTeste() : setIndice((n) => n - 1))}
            icone={<ChevronLeft className="size-4" />}
            disabled={salvando}
          >
            {indice === 0 ? 'Sair' : 'Voltar'}
          </Botao>
          <Botao
            type="button"
            largo
            onClick={avancar}
            disabled={!respondida}
            carregando={salvando}
            icone={indice === TOTAL - 1 ? <Sparkles className="size-4" /> : <ChevronRight className="size-4" />}
          >
            {indice === TOTAL - 1 ? 'Ver meu resultado' : 'Próxima'}
          </Botao>
        </div>
        <p className="text-[11px] leading-relaxed text-tinta-fraca">
          Teste educativo inspirado no modelo dos 16 tipos (NERIS/16Personalities), com 30 afirmações originais. Não
          substitui o teste oficial nem uma avaliação psicológica.
        </p>
      </Cartao>
    )
  }

  if (!resultado) {
    return (
      <Cartao className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-xl bg-marinho-claro p-2 text-marinho" aria-hidden>
            <Brain className="size-5" />
          </div>
          <div>
            <p className="text-[12px] font-medium uppercase tracking-[0.12em] text-tinta-fraca">Personalidade</p>
            <h2 className="font-serif text-[19px] text-tinta">Descubra o seu jeito de ser</h2>
          </div>
        </div>
        <p className="text-[13.5px] leading-relaxed text-tinta-suave">
          Responda 30 afirmações rápidas e veja uma leitura inspirada nos 16 tipos de personalidade. O resultado fica
          no seu perfil e ajuda o professor a conhecer melhor a turma.
        </p>
        <div className="flex items-center gap-2 text-[12px] text-tinta-suave">
          <Sparkles className="size-3.5 text-dourado" aria-hidden />
          30 afirmações · cerca de 4 minutos · sem resposta certa
        </div>
        {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}
        <Botao type="button" largo onClick={comecar} icone={<ChevronRight className="size-4" />}>
          Começar o teste
        </Botao>
        <p className="text-[11px] leading-relaxed text-tinta-fraca">
          Adaptação educacional do modelo NERIS/16Personalities, com afirmações e descrições próprias. Não é o teste
          oficial.{' '}
          <a
            href={LINK_OFICIAL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-marinho underline-offset-2 hover:underline"
          >
            Conhecer o site original
          </a>
          .
        </p>
      </Cartao>
    )
  }

  const papel = PAPEIS[resultado.papel]
  const info = infoDoTipo(resultado.tipo)
  const estrategia = ESTRATEGIAS[resultado.estrategia]
  const quando = perfil.personalidade_em
    ? new Date(perfil.personalidade_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  return (
    <Cartao className="overflow-hidden p-0" aria-labelledby="resultado-personalidade">
      <div className="border-b p-4" style={{ backgroundColor: papel.fundo, borderColor: papel.borda }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: papel.texto }}>
              Seu resultado de personalidade
            </p>
            <h2 id="resultado-personalidade" className="mt-1 font-serif text-[32px] leading-none text-tinta">
              {resultado.tipo}
            </h2>
            <p className="mt-1 text-[15px] font-medium text-tinta">
              {info?.nome ?? 'Tipo de personalidade'}
            </p>
          </div>
          <span
            className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
            style={{ backgroundColor: 'rgba(255,255,255,.65)', borderColor: papel.borda, color: papel.texto }}
          >
            {papel.nome}
          </span>
        </div>
        <p className="mt-2 text-[12.5px]" style={{ color: papel.texto }}>
          {papel.descricao}
        </p>
      </div>

      <div className="space-y-4 p-4">
        <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-2 text-[13px]">
          <dt className="text-tinta-fraca">Categoria</dt>
          <dd className="font-medium text-tinta">{papel.nome}</dd>
          <dt className="text-tinta-fraca">Subcategoria</dt>
          <dd className="font-medium text-tinta">
            {estrategia.nome} · {resultado.identidade === 'A' ? 'Assertivo' : 'Turbulento'}
          </dd>
          <dt className="text-tinta-fraca">Tipo</dt>
          <dd className="text-tinta">
            {resultado.tipo} <span className="text-tinta-suave">· {info?.nome ?? '—'}</span>
          </dd>
        </dl>

        <p className="text-[13.5px] leading-relaxed text-tinta">{info?.descricao}</p>
        {info ? (
          <div className="flex flex-wrap gap-1.5">
            {info.caracteristicas.map((c) => (
              <span
                key={c}
                className="rounded-full border px-2.5 py-1 text-[11.5px] font-medium"
                style={{ backgroundColor: papel.fundo, borderColor: papel.borda, color: papel.texto }}
              >
                {c}
              </span>
            ))}
          </div>
        ) : null}

        <div>
          <p className="text-[12px] font-medium uppercase tracking-[0.1em] text-tinta-fraca">Percentuais por eixo</p>
          <div className="mt-2 space-y-2.5">
            {EIXOS.map((eixo) => {
              const esquerda = resultado.dimensoes[eixo.chave]
              const direita = 100 - esquerda
              const predominante = esquerda >= 50 ? eixo.esquerda : eixo.direita
              return (
                <div key={eixo.chave}>
                  <div className="flex items-baseline justify-between gap-2 text-[11.5px]">
                    <span className="font-medium text-tinta">{eixo.nome}</span>
                    <span className="text-tinta-suave">
                      {predominante.rotulo} {Math.max(esquerda, direita)}%
                    </span>
                  </div>
                  <div
                    className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-papel-fundo"
                    role="img"
                    aria-label={`${eixo.nome}: ${esquerda}% ${eixo.esquerda.rotulo}, ${direita}% ${eixo.direita.rotulo}`}
                  >
                    <span style={{ width: `${esquerda}%`, backgroundColor: papel.forte }} />
                    <span style={{ width: `${direita}%`, backgroundColor: papel.borda }} />
                  </div>
                  <div className="mt-0.5 flex justify-between gap-2 text-[10.5px] text-tinta-fraca">
                    <span>
                      {eixo.esquerda.rotulo} {esquerda}%
                    </span>
                    <span>
                      {eixo.direita.rotulo} {direita}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {info ? (
          <p className="rounded-xl bg-papel-fundo p-3 text-[12.5px] leading-relaxed text-tinta-suave">
            <span className="font-medium text-tinta">Ponto de atenção:</span> {info.atencao}
          </p>
        ) : null}

        {aviso ? <Alerta tom="marinho">{aviso}</Alerta> : null}
        {erro ? <Alerta tom="vermelho">{erro}</Alerta> : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={comecar}
            className="inline-flex min-h-10 items-center gap-1.5 text-[12.5px] font-medium text-marinho underline-offset-2 hover:underline"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Refazer o teste
          </button>
          <a
            href={LINK_OFICIAL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] text-tinta-suave underline-offset-2 hover:text-marinho hover:underline"
          >
            Teste original <ExternalLink className="size-3" aria-hidden />
          </a>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-borda pt-3 text-[11px] text-tinta-fraca">
          <span>Teste educativo, não oficial.</span>
          {quando ? <span>Concluído em {quando}</span> : null}
        </div>
      </div>
    </Cartao>
  )
}
