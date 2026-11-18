#!/usr/bin/env node
/**
 * Teste do banco de afirmações e do cálculo do teste de personalidade.
 *
 * O questionário é uma adaptação educacional do modelo dos 16 tipos: 30
 * afirmações originais, 6 por eixo, 3 de cada lado. Aqui se verifica que o
 * cálculo fecha em 0–100, que os polos e as letras não se invertem e que os
 * 16 tipos caem no grupo certo — inclusive Sentinelas (S + J), que já foram
 * classificados como Exploradores por um erro na posição da letra J.
 *
 * Uso: node scripts/testar-personalidade.mjs
 */
import { build } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const pasta = join(raiz, '.temp-testes', 'personalidade')
mkdirSync(pasta, { recursive: true })
writeFileSync(
  join(pasta, 'entrada.ts'),
  `export {
    EIXOS, PERGUNTAS, ESCALA, PAPEIS, ESTRATEGIAS, TIPOS, TIPOS_POR_PAPEL,
    papelDoTipoBase, estrategiaDoResultado, montarTipo, tipoBaseDe,
    calcularResultado, resultadoValido, resumoDaPersonalidade
  } from '../../src/lib/personalidade'`,
)

await build({
  entryPoints: [join(pasta, 'entrada.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(pasta, 'personalidade.mjs'),
  logLevel: 'error',
})

const p = await import(`file://${join(pasta, 'personalidade.mjs')}`)

let falhas = 0
function conferir(nome, condicao, detalhe) {
  if (condicao) console.log(`  \x1b[32m✓\x1b[0m ${nome}`)
  else {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

const respostas = (fn) => Object.fromEntries(p.PERGUNTAS.map((q) => [q.id, fn(q)]))
const daEsquerda = (q) => (q.lado === 'esquerda' ? 7 : 1)
const daDireita = (q) => (q.lado === 'esquerda' ? 1 : 7)
const neutras = () => respostas(() => 4)

console.log('\n  Personalidade · banco de afirmações e cálculo\n')

conferir('são 30 afirmações', p.PERGUNTAS.length === 30, String(p.PERGUNTAS.length))
conferir('cinco eixos', p.EIXOS.length === 5)
conferir('escala de 7 pontos', p.ESCALA.length === 7)
conferir('ids únicos', new Set(p.PERGUNTAS.map((q) => q.id)).size === 30)
conferir('seis afirmações por eixo', p.EIXOS.every((e) => p.PERGUNTAS.filter((q) => q.dimensao === e.chave).length === 6))
conferir(
  'três afirmações de cada lado em todo eixo',
  p.EIXOS.every(
    (e) =>
      p.PERGUNTAS.filter((q) => q.dimensao === e.chave && q.lado === 'esquerda').length === 3 &&
      p.PERGUNTAS.filter((q) => q.dimensao === e.chave && q.lado === 'direita').length === 3,
  ),
)
conferir('nenhuma afirmação repetida', new Set(p.PERGUNTAS.map((q) => q.texto)).size === 30)
conferir('16 tipos descritos', Object.keys(p.TIPOS).length === 16)
conferir(
  'todos os tipos têm nome, descrição, características e atenção',
  Object.values(p.TIPOS).every((t) => t.nome && t.descricao && t.caracteristicas.length === 3 && t.atencao),
)
conferir(
  'cada tipo aparece em um único grupo',
  Object.values(p.TIPOS_POR_PAPEL).flat().sort().join() === Object.keys(p.TIPOS).sort().join(),
)

const esquerda = p.calcularResultado(respostas(daEsquerda))
conferir('concordar com a esquerda dá 100% nos cinco eixos', Object.values(esquerda.dimensoes).every((n) => n === 100), JSON.stringify(esquerda.dimensoes))
conferir('o tipo resultante é ENFJ-A', esquerda.tipo === 'ENFJ-A', esquerda.tipo)
conferir('o papel de ENFJ é Diplomatas', esquerda.papel === 'diplomatas', esquerda.papel)
conferir('a estratégia de ENFJ-A é Domínio Social', esquerda.estrategia === 'dominio-social', esquerda.estrategia)

const direita = p.calcularResultado(respostas(daDireita))
conferir('concordar com a direita dá 0% nos cinco eixos', Object.values(direita.dimensoes).every((n) => n === 0), JSON.stringify(direita.dimensoes))
conferir('o tipo resultante é ISTP-T', direita.tipo === 'ISTP-T', direita.tipo)
conferir('o papel de ISTP é Exploradores', direita.papel === 'exploradores', direita.papel)
conferir('a estratégia de ISTP-T é Aprimoramento Constante', direita.estrategia === 'aprimoramento-constante', direita.estrategia)

const neutro = p.calcularResultado(neutras())
conferir('respostas neutras ficam em 50%', Object.values(neutro.dimensoes).every((n) => n === 50), JSON.stringify(neutro.dimensoes))
conferir('o empate vira ENFJ-A, sem quebrar', neutro.tipo === 'ENFJ-A')

conferir(
  'cada combinação de polos gera o código certo',
  (() => {
    const codigos = []
    for (const energia of ['E', 'I']) {
      for (const percepcao of ['N', 'S']) {
        for (const decisao of ['F', 'T']) {
          for (const organizacao of ['J', 'P']) {
            const letras = { energia, percepcao, decisao, organizacao }
            const r = p.calcularResultado(
              respostas((q) => {
                const eixo = p.EIXOS.find((e) => e.chave === q.dimensao)
                const letraDesejada = letras[q.dimensao] ?? (q.dimensao === 'identidade' ? 'A' : null)
                const querEsquerda = letraDesejada === eixo.esquerda.letra
                return (q.lado === 'esquerda') === querEsquerda ? 7 : 1
              }),
            )
            codigos.push(r.tipo)
          }
        }
      }
    }
    return new Set(codigos).size === 16
  })(),
)

const papeisEsperados = {
  analistas: ['INTJ', 'INTP', 'ENTJ', 'ENTP'],
  diplomatas: ['INFJ', 'INFP', 'ENFJ', 'ENFP'],
  sentinelas: ['ISTJ', 'ISFJ', 'ESTJ', 'ESFJ'],
  exploradores: ['ISTP', 'ISFP', 'ESTP', 'ESFP'],
}
for (const [papel, tipos] of Object.entries(papeisEsperados)) {
  for (const tipo of tipos) {
    conferir(`${tipo} pertence a ${papel}`, p.papelDoTipoBase(tipo) === papel, p.papelDoTipoBase(tipo))
  }
}

conferir('ESTJ-A é Sentinelas (J é a quarta letra)', p.papelDoTipoBase('ESTJ') === 'sentinelas')
conferir('ESTP-T é Exploradores (P é a quarta letra)', p.papelDoTipoBase('ESTP') === 'exploradores')
conferir('INFJ-T é Diplomatas', p.papelDoTipoBase('INFJ') === 'diplomatas')
conferir('ENTP-A é Analistas', p.papelDoTipoBase('ENTP') === 'analistas')

conferir('estratégia A de extrovertido é Domínio Social', p.estrategiaDoResultado('ENFJ', 'A') === 'dominio-social')
conferir('estratégia A de introvertido é Individualismo Confiante', p.estrategiaDoResultado('INFJ', 'A') === 'individualismo-confiante')
conferir('estratégia T de extrovertido é Engajamento Social', p.estrategiaDoResultado('ENFJ', 'T') === 'engajamento-social')
conferir('estratégia T de introvertido é Aprimoramento Constante', p.estrategiaDoResultado('INFJ', 'T') === 'aprimoramento-constante')

conferir('montarTipo monta o código completo', p.montarTipo('infp', 'T') === 'INFP-T')
conferir('tipoBaseDe remove a identidade', p.tipoBaseDe('INFP-T') === 'INFP')
conferir('tipoBaseDe aceita código sem identidade', p.tipoBaseDe('infp') === 'INFP')

let faltando = false
try {
  const incompleto = neutras()
  delete incompleto[30]
  p.calcularResultado(incompleto)
} catch (e) {
  faltando = /30/.test(e.message)
}
conferir('resposta faltando é recusada com mensagem', faltando)

let invalida = false
try {
  p.calcularResultado({ ...neutras(), 1: 8 })
} catch (e) {
  invalida = /1/.test(e.message)
}
conferir('resposta fora de 1–7 é recusada', invalida)

conferir('resultado válido é aceito', p.resultadoValido(esquerda))
conferir('resultado sem dimensões é recusado', !p.resultadoValido({ ...esquerda, dimensoes: null }))
conferir('resultado com tipo malformado é recusado', !p.resultadoValido({ ...esquerda, tipo: 'XX' }))
conferir('resultado com percentual fora de 0–100 é recusado', !p.resultadoValido({ ...esquerda, dimensoes: { ...esquerda.dimensoes, energia: 101 } }))
conferir('resultado 50/50 mostra o tipo', p.resumoDaPersonalidade(neutro) === 'ENFJ-A')
conferir('sem resultado mostra Teste não feito', p.resumoDaPersonalidade(null) === 'Teste não feito')

rmSync(join(raiz, '.temp-testes'), { recursive: true, force: true })

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) da personalidade falharam\x1b[0m\n`)
  process.exit(1)
}
console.log('  \x1b[32m✓ todas as verificações da personalidade passaram\x1b[0m\n')
