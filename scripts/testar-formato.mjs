#!/usr/bin/env node
/**
 * Testes dos utilitários de formatação (`src/lib/formato.ts`).
 *
 *   pnpm test:formato
 *
 * O caso que importa aqui é `atrasoDeEntrega`: ele decide se a redação chega ao
 * professor marcada como fora do prazo. Errar para menos esconde atraso; errar
 * para mais acusa quem entregou no prazo. Os dois erros são graves na mesma
 * medida, então cada fronteira tem um caso próprio.
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const pasta = mkdtempSync(join(tmpdir(), 'formato-'))
const saida = join(pasta, 'formato.mjs')
const entrada = join(import.meta.dirname, '..', 'src', 'lib', 'formato.ts')

await build({
  entryPoints: [entrada],
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

console.log('\nAtraso de entrega\n')

const prazo = '2026-11-20T23:59:00-03:00'

igual('sem prazo definido não há atraso a medir', f.atrasoDeEntrega('2026-11-21T10:00:00-03:00', null), null)
igual('sem envio não há atraso a medir', f.atrasoDeEntrega(null, prazo), null)
igual('data inválida no envio não vira atraso', f.atrasoDeEntrega('ontem', prazo), null)
igual('data inválida no prazo não vira atraso', f.atrasoDeEntrega('2026-11-21T10:00:00-03:00', 'qualquer'), null)
igual('entrega no meio do prazo', f.atrasoDeEntrega('2026-11-19T08:00:00-03:00', prazo), false)
igual(
  'entrega um minuto antes do prazo',
  f.atrasoDeEntrega('2026-11-20T23:58:00-03:00', prazo),
  false,
)
igual('entrega no minuto do prazo ainda está no prazo', f.atrasoDeEntrega('2026-11-20T23:59:00-03:00', prazo), false)
igual('entrega um minuto depois do prazo', f.atrasoDeEntrega('2026-11-21T00:00:00-03:00', prazo), true)
igual('entrega no dia seguinte', f.atrasoDeEntrega('2026-11-21T09:30:00-03:00', prazo), true)
igual(
  'fuso diferente é comparado no instante, não no relógio',
  // 03:30Z = 00:30 em Brasília, depois do prazo das 23:59 (-03:00)
  f.atrasoDeEntrega('2026-11-21T03:30:00Z', prazo),
  true,
)
igual(
  'mesmo relógio em outro fuso, mas ainda antes do prazo',
  // 00:30Z = 21:30 do dia 20 em Brasília
  f.atrasoDeEntrega('2026-11-21T00:30:00Z', prazo),
  false,
)

console.log('\nFormatação pt-BR\n')

igual('nota inteira ganha uma casa decimal', f.formatarNota(7), '7,0')
igual('nota fracionária usa vírgula', f.formatarNota(7.5), '7,5')
igual('nota ausente vira travessão', f.formatarNota(null), '—')
igual('pontos inteiros sem decimal', f.formatarPontos(6), '6')
igual('pontos fracionários com vírgula', f.formatarPontos(6.5), '6,5')
igual('iniciais do primeiro e do último nome', f.iniciais('Ana Clara Souza'), 'AS')
igual('nome com uma palavra só', f.iniciais('Ana'), 'AN')
igual('saudação usa os dois primeiros nomes', f.primeiroNome('Ana Clara Souza Lima'), 'Ana Clara')
igual('saudação com nome curto', f.primeiroNome('Ana Souza'), 'Ana')
igual('singular e plural', `${f.plural(1, 'aluno', 'alunos')} / ${f.plural(3, 'aluno', 'alunos')}`, '1 aluno / 3 alunos')
igual('data e hora legíveis', typeof f.formatarDataHora(prazo), 'string')
igual(
  'rótulo da turma segue curso · código · período — nome',
  f.rotuloDaTurma({ curso: 'Farmácia', codigo_siga: 'CBV018GV-B', periodo: '2026/3', nome: 'Introdução à Bioestatística' }),
  'Farmácia · CBV018GV-B · 2026/3 — Introdução à Bioestatística',
)
igual(
  'turma sem curso não fica com separador solto',
  f.rotuloDaTurma({ curso: '  ', codigo_siga: 'EST006GV-A', periodo: '2026/3', nome: 'Bioestatística' }),
  'Curso não informado · EST006GV-A · 2026/3 — Bioestatística',
)

console.log('')
if (falhas > 0) {
  console.log(`✗ ${falhas} de ${total} verificações falharam\n`)
  process.exit(1)
}
console.log(`✓ ${total} verificações de formatação passaram\n`)
