#!/usr/bin/env node
/**
 * Teste das regras de prazo (src/lib/prazos.ts).
 *
 * São funções puras, então dá para cobrir os casos chatos sem mexer no relógio
 * do sistema: criar avaliação com data no passado, encurtar prazo de quem já
 * entregou, remover prazo, data inválida.
 *
 * Uso: node scripts/testar-prazos.mjs
 */
import { build } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const pasta = join(raiz, '.temp-testes', 'prazos')
mkdirSync(pasta, { recursive: true })

const entrada = join(pasta, 'entrada.ts')
writeFileSync(
  entrada,
  [
    `export { validarPrazoCriacao, aberturaDaAvaliacao, efeitoDaMudanca, avisoDaMudanca, lerData } from '../../src/lib/prazos'`,
  ].join('\n'),
)

await build({
  entryPoints: [entrada],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(pasta, 'prazos.mjs'),
  logLevel: 'error',
})

const { validarPrazoCriacao, aberturaDaAvaliacao, efeitoDaMudanca, avisoDaMudanca, lerData } = await import(
  `file://${join(pasta, 'prazos.mjs')}`
)

let falhas = 0
let verificacoes = 0
function conferir(nome, condicao, detalhe) {
  verificacoes++
  if (condicao) {
    console.log(`  \x1b[32m✓\x1b[0m ${nome}`)
  } else {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

const agora = new Date('2026-11-16T21:00:00.000Z')
const futuro = '2026-11-20T23:00:00.000Z'
const passado = '2026-11-10T23:00:00.000Z'

console.log('\n  Prazos\n')

// ---- criação ---------------------------------------------------------------
conferir('sem prazo é permitido', validarPrazoCriacao('', agora).ok === true)
conferir('prazo futuro é aceito', validarPrazoCriacao(futuro, agora).ok === true)
conferir('prazo no passado é aceito para lançamento retroativo', validarPrazoCriacao(passado, agora).ok === true)
conferir('data de hoje mais cedo também é aceita', validarPrazoCriacao('2026-11-16T20:00:00.000Z', agora).ok === true)
conferir('data inválida é recusada', validarPrazoCriacao('2026-13-45T99:99', agora).ok === false)
conferir(
  'prazo futuro abre agora',
  aberturaDaAvaliacao(futuro, agora).getTime() === agora.getTime(),
)
conferir(
  'prazo passado recua a abertura para um dia antes',
  aberturaDaAvaliacao(passado, agora).getTime() === new Date(passado).getTime() - 24 * 60 * 60 * 1000,
)
conferir('sem prazo abre agora', aberturaDaAvaliacao('', agora).getTime() === agora.getTime())

// ---- efeito da mudança -----------------------------------------------------
const enviados = [
  '2026-11-17T10:00:00.000Z', // entregou no prazo antigo (20/11)
  '2026-11-18T10:00:00.000Z', // entregou no prazo antigo
  '2026-11-21T10:00:00.000Z', // já estava atrasado
]
const encurtar = efeitoDaMudanca({ enviados, prazoAtual: futuro, prazoNovo: '2026-11-17T23:00:00.000Z' })
conferir('encurtar marca quem entregou depois da data nova', encurtar.pioram === 1, JSON.stringify(encurtar))
conferir('quem já estava atrasado não conta como piora', encurtar.atrasadosAntes === 1, JSON.stringify(encurtar))
conferir('atrasados depois somam os dois grupos', encurtar.atrasadosDepois === 2, JSON.stringify(encurtar))

const estender = efeitoDaMudanca({ enviados, prazoAtual: futuro, prazoNovo: '2026-11-30T23:00:00.000Z' })
conferir('estender não piora ninguém', estender.pioram === 0, JSON.stringify(estender))

const remover = efeitoDaMudanca({ enviados, prazoAtual: futuro, prazoNovo: null })
conferir('remover o prazo zera os atrasos', remover.atrasadosDepois === 0 && remover.pioram === 0)

const semPrazoAntes = efeitoDaMudanca({
  enviados,
  prazoAtual: null,
  prazoNovo: '2026-11-17T23:00:00.000Z',
})
conferir('definir prazo onde não havia conta todos como piora', semPrazoAntes.pioram === 2, JSON.stringify(semPrazoAntes))

conferir(
  'entrega com data inválida é ignorada',
  efeitoDaMudanca({ enviados: [null, '', 'lixo'], prazoAtual: futuro, prazoNovo: futuro }).pioram === 0,
)

// ---- aviso -----------------------------------------------------------------
conferir(
  'encurtamento avisa quantas entregas mudam de estado',
  /1 entrega j[áa] feita/.test(avisoDaMudanca(encurtar, '2026-11-17T23:00:00.000Z', agora) ?? ''),
  avisoDaMudanca(encurtar, '2026-11-17T23:00:00.000Z', agora),
)
conferir('estender não pede confirmação', avisoDaMudanca(estender, '2026-11-30T23:00:00.000Z', agora) === null)
conferir('remover prazo não pede confirmação', avisoDaMudanca(remover, null, agora) === null)
conferir(
  'data no passado avisa que fecha o envio',
  /ningu[ée]m consegue enviar/.test(avisoDaMudanca(remover, passado, agora) ?? ''),
  avisoDaMudanca(remover, passado, agora),
)
conferir('lerData aceita ISO e recusa lixo', lerData('2026-11-20T23:00:00.000Z') instanceof Date && lerData('lixo') === null)

rmSync(join(raiz, '.temp-testes'), { recursive: true, force: true })

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) de prazo falharam\x1b[0m\n`)
  process.exit(1)
}
console.log(`  \x1b[32m✓ ${verificacoes} verificações de prazo passaram\x1b[0m\n`)
