#!/usr/bin/env node
/**
 * Testes da comparação de peso com o SIGA (`src/lib/siga.ts`).
 *
 *   pnpm test:peso
 *
 * O SIGA recebe a nota na escala do peso da avaliação dele. Se o app marcar
 * outro peso, a nota chega multiplicada ou dividida — e os dois números parecem
 * plausíveis na tela. A regra que decide "divergente" precisa errar para menos
 * (não alarmar sem motivo) e nunca para mais (deixar passar escala errada).
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const pasta = mkdtempSync(join(tmpdir(), 'peso-'))
const saida = join(pasta, 'siga.mjs')

await build({
  entryPoints: [join(import.meta.dirname, '..', 'src', 'lib', 'siga.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: saida,
  logLevel: 'error',
})
const f = await import(pathToFileURL(saida).href)

let total = 0
let falhas = 0

function igual(nome, obtido, esperado) {
  total += 1
  const a = JSON.stringify(obtido)
  const b = JSON.stringify(esperado)
  if (a === b) {
    console.log(`  ✓ ${nome}`)
  } else {
    falhas += 1
    console.log(`  ✗ ${nome}\n      esperava ${b}, veio ${a}`)
  }
}

const lista = [
  { id: '596505', descricao: 'Exercício Avaliativo', peso: 10, data: '25/09/2026' },
  { id: '596506', descricao: 'Prova 1', peso: 20, data: '25/09/2026' },
  { id: '602507', descricao: 'Trabalho sobre Probabilidades', peso: 30, data: '27/11/2026' },
]

console.log('\nAchar a avaliação no SIGA\n')
igual('descrição igual', f.acharAvaliacaoSiga(lista, 'Prova 1')?.id, '596506')
igual('ignora caixa', f.acharAvaliacaoSiga(lista, 'prova 1')?.id, '596506')
igual('ignora espaços nas pontas', f.acharAvaliacaoSiga(lista, '  Trabalho sobre Probabilidades ')?.id, '602507')
igual('acento faz parte do nome: "Exercício" ≠ "Exercicio"', f.acharAvaliacaoSiga(lista, 'Exercicio Avaliativo'), null)
igual('descrição que não existe', f.acharAvaliacaoSiga(lista, 'TVC 1'), null)
igual('descrição vazia', f.acharAvaliacaoSiga(lista, '   '), null)
igual('lista vazia', f.acharAvaliacaoSiga([], 'Prova 1'), null)
igual('lista nula', f.acharAvaliacaoSiga(null, 'Prova 1'), null)
igual('descrição nula', f.acharAvaliacaoSiga(lista, null), null)

console.log('\nComparar o peso\n')
const noSiga = (peso) => ({ id: '1', descricao: 'Trabalho sobre Probabilidades', peso, data: null })
igual('pesos iguais não alarmam', f.divergenciaDePeso(noSiga(30), 30), null)
igual('diferença de 0,0005 não alarmam', f.divergenciaDePeso(noSiga(30.0005), 30), null)
igual('peso do SIGA maior', f.divergenciaDePeso(noSiga(30), 10), { pesoSiga: 30, pesoApp: 10 })
igual('peso do SIGA menor', f.divergenciaDePeso(noSiga(10), 20), { pesoSiga: 10, pesoApp: 20 })
igual('peso fracionário', f.divergenciaDePeso(noSiga(2.5), 10), { pesoSiga: 2.5, pesoApp: 10 })
igual('peso do SIGA ausente não alarma', f.divergenciaDePeso(noSiga(0), 20), null)
igual('peso do SIGA nulo não alarma', f.divergenciaDePeso(null, 20), null)
igual('peso do app ausente não alarma', f.divergenciaDePeso(noSiga(30), 0), null)
igual('peso do app nulo não alarma', f.divergenciaDePeso(noSiga(30), null), null)
igual('peso do app não numérico não alarma', f.divergenciaDePeso(noSiga(30), Number.NaN), null)

console.log('')
if (falhas > 0) {
  console.log(`✗ ${falhas} de ${total} verificações falharam\n`)
  process.exit(1)
}
console.log(`✓ ${total} verificações de peso no SIGA passaram\n`)
