#!/usr/bin/env node
/**
 * Teste das contas de frequência (src/lib/frequencia.ts).
 *
 * A tela do aluno e a do professor precisam contar a mesma coisa: falta é
 * `presente = false`, a contagem é por data de aula e o limite é 5 faltas
 * (15 h, com 3 h por aula). Um erro aqui muda a situação exibida de alguém;
 * por isso as fronteiras (0, 2, 3, 4, 5 e acima) têm caso próprio.
 *
 * Uso: node scripts/testar-frequencia.mjs
 */
import { build } from 'esbuild'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const pasta = mkdtempSync(join(tmpdir(), 'frequencia-'))
const saida = join(pasta, 'frequencia.mjs')

await build({
  entryPoints: [join(import.meta.dirname, '..', 'src', 'lib', 'frequencia.ts')],
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
  if (a === b) console.log(`  ✓ ${nome}`)
  else {
    falhas += 1
    console.log(`  ✗ ${nome}\n      esperava ${b}, veio ${a}`)
  }
}

console.log('\nFrequência · contagem e limite\n')

igual('o limite é 5 faltas', f.LIMITE_FALTAS, 5)
igual('cada aula vale 3 horas', f.HORAS_POR_FALTA, 3)
igual('5 faltas equivalem a 15 horas', f.HORAS_LIMITE, 15)
igual('singular e plural do rótulo', `${f.rotuloFaltas(1)} / ${f.rotuloFaltas(2)}`, '1 falta / 2 faltas')

const registros = [
  { matricula: 'A', presente: false },
  { matricula: 'A', presente: true },
  { matricula: 'A', presente: false },
  { matricula: 'B', presente: true },
  { matricula: 'C', presente: false },
]
igual('conta só as ausências, por matrícula', f.faltasPorMatricula(registros), { A: 2, C: 1 })
igual('quem só tem presença não aparece no mapa', f.faltasPorMatricula([{ matricula: 'D', presente: true }]), {})

const resumo = f.resumirFrequencia([
  { presente: false, data_aula: '2026-08-10' },
  { presente: true, data_aula: '2026-08-10' },
  { presente: true, data_aula: '2026-08-17' },
])
igual('resume faltas, presenças e datas', resumo, { faltas: 1, presencas: 2, aulas: 2 })
igual(
  'a mesma data repetida conta uma aula só',
  f.resumirFrequencia([
    { presente: false, data_aula: '2026-08-10' },
    { presente: true, data_aula: '2026-08-10' },
  ]).aulas,
  1,
)
igual('converte faltas em horas', [0, 1, 5].map((n) => f.faltasEmHoras(n)), [0, 3, 15])

igual('sem faltas', f.situacaoFaltas(0), 'sem-faltas')
igual('1 falta ainda está dentro', f.situacaoFaltas(1), 'dentro')
igual('2 faltas ainda estão dentro', f.situacaoFaltas(2), 'dentro')
igual('3 faltas acendem o aviso', f.situacaoFaltas(3), 'atencao')
igual('4 faltas continuam em atenção', f.situacaoFaltas(4), 'atencao')
igual('5 faltas atingem o limite', f.situacaoFaltas(5), 'limite')
igual('6 faltas continuam no limite', f.situacaoFaltas(6), 'limite')
igual('limite alternativo é respeitado', f.situacaoFaltas(2, 2), 'limite')

rmSync(pasta, { recursive: true, force: true })

console.log('')
if (falhas > 0) {
  console.log(`✗ ${falhas} de ${total} verificações de frequência falharam\n`)
  process.exit(1)
}
console.log(`✓ ${total} verificações de frequência passaram\n`)
