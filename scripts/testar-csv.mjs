#!/usr/bin/env node
/**
 * Testes do leitor da lista de alunos (`src/lib/csv.ts`).
 *
 *   pnpm test:csv
 *
 * O professor cola a lista do SIGA uma vez por semestre. Se o leitor errar a
 * ordem das colunas ou o separador, ele vê "matrícula inválida" em todas as
 * linhas — e vai conferir à mão, aluno por aluno. Cada formato abaixo já foi
 * visto em planilhas de verdade: `;` do Excel em português, tabulação do
 * copiar-e-colar, vírgula entre aspas e cabeçalho com acento.
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const pasta = mkdtempSync(join(tmpdir(), 'csv-'))
const saida = join(pasta, 'csv.mjs')
const entrada = join(import.meta.dirname, '..', 'src', 'lib', 'csv.ts')

await build({
  entryPoints: [entrada],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: saida,
  logLevel: 'error',
})
const { interpretarCsv } = await import(pathToFileURL(saida).href)

let total = 0
let falhas = 0

function caso(nome, texto, opcoes, esperado) {
  total += 1
  const r = interpretarCsv(texto, opcoes)
  const erros = []
  if (esperado.linhas !== undefined && r.linhas.length !== esperado.linhas) {
    erros.push(`esperava ${esperado.linhas} linha(s), veio ${r.linhas.length}: ${JSON.stringify(r.linhas)}`)
  }
  if (esperado.problemas !== undefined && r.problemas.length !== esperado.problemas) {
    erros.push(`esperava ${esperado.problemas} problema(s), veio ${r.problemas.length}: ${JSON.stringify(r.problemas)}`)
  }
  if (esperado.primeira) {
    const primeira = r.linhas[0] ?? {}
    for (const [campo, valor] of Object.entries(esperado.primeira)) {
      if (primeira[campo] !== valor) erros.push(`${campo}: esperava "${valor}", veio "${primeira[campo]}"`)
    }
  }
  if (esperado.contemProblema) {
    if (!r.problemas.some((p) => p.includes(esperado.contemProblema))) {
      erros.push(`nenhum problema contém "${esperado.contemProblema}": ${JSON.stringify(r.problemas)}`)
    }
  }
  if (erros.length) {
    falhas += 1
    console.log(`  ✗ ${nome}`)
    for (const e of erros) console.log(`      ${e}`)
  } else {
    console.log(`  ✓ ${nome}`)
  }
}

console.log('\nLeitor da lista de alunos\n')

// ---- formatos que chegam de verdade ---------------------------------------

caso(
  'SIGA: cabeçalho com acento e ponto e vírgula',
  'Matrícula;Nome;E-mail\n202506007GV;Ana Clara Souza;ana.clara@estudante.ufjf.br\n202506013GV;Bruno Lima;bruno.lima@estudante.ufjf.br',
  {},
  { linhas: 2, problemas: 0, primeira: { matricula: '202506007GV', nome_completo: 'Ana Clara Souza' } },
)

caso(
  'Excel em inglês: nome antes da matrícula',
  'Nome;Matrícula;Email\nAna Clara Souza;202506007GV;ana.clara@estudante.ufjf.br',
  {},
  { linhas: 1, problemas: 0, primeira: { matricula: '202506007GV', nome_completo: 'Ana Clara Souza' } },
)

caso(
  'Copiar e colar do SIGA com tabulação e sem cabeçalho',
  '202506007GV\tAna Clara Souza\tana.clara@estudante.ufjf.br\n202506013GV\tBruno Lima\tbruno.lima@estudante.ufjf.br',
  {},
  { linhas: 2, problemas: 0, primeira: { matricula: '202506007GV' } },
)

caso(
  'CSV com vírgula e campos entre aspas',
  '"matricula","nome","email"\n"202506007GV","Souza, Ana Clara","ana.clara@estudante.ufjf.br"',
  {},
  { linhas: 1, problemas: 0, primeira: { nome_completo: 'Souza, Ana Clara' } },
)

caso(
  'Ordem trocada sem cabeçalho (nome na primeira coluna)',
  'Ana Clara Souza,202506007GV,ana.clara@estudante.ufjf.br',
  {},
  { linhas: 1, problemas: 0, primeira: { matricula: '202506007GV', nome_completo: 'Ana Clara Souza' } },
)

caso(
  'Cabeçalho fora de ordem e coluna extra de curso',
  'E-mail;Curso;Matrícula;Nome\nana.clara@estudante.ufjf.br;Biologia;202506007GV;Ana Clara Souza',
  {},
  { linhas: 1, problemas: 0, primeira: { matricula: '202506007GV', nome_completo: 'Ana Clara Souza', email: 'ana.clara@estudante.ufjf.br' } },
)

caso(
  'BOM do Excel, CRLF e linhas em branco',
  '\ufeff202506007GV;Ana Clara Souza;ana.clara@estudante.ufjf.br\r\n\r\n202506013GV;Bruno Lima;bruno.lima@estudante.ufjf.br\r\n',
  {},
  { linhas: 2, problemas: 0 },
)

caso(
  'Turma sem exigência de e-mail: duas colunas bastam',
  '202506007GV;Ana Clara Souza',
  { exigirEmail: false },
  { linhas: 1, problemas: 0, primeira: { email: '' } },
)

// ---- o que precisa ser recusado com clareza --------------------------------

caso(
  'Matrícula fora do padrão',
  '2025;Ana Clara Souza;ana.clara@estudante.ufjf.br',
  {},
  { linhas: 0, problemas: 1, contemProblema: 'não parece válida' },
)

caso(
  'E-mail inválido',
  '202506007GV;Ana Clara Souza;ana.clara.ufjf.br',
  {},
  { linhas: 0, problemas: 1, contemProblema: 'inválido' },
)

caso(
  'Falta o e-mail em turma que exige',
  '202506007GV;Ana Clara Souza',
  {},
  { linhas: 0, problemas: 1, contemProblema: 'falta o e-mail' },
)

caso(
  'Matrícula repetida',
  '202506007GV;Ana Clara Souza;a@x.br\n202506007GV;Ana Clara Souza;a@x.br',
  {},
  { linhas: 1, problemas: 1, contemProblema: 'repetida' },
)

caso(
  'Linha com um campo só',
  '202506007GV',
  {},
  { linhas: 0, problemas: 1, contemProblema: 'precisa de matrícula e nome' },
)

caso(
  'Texto vazio',
  '   \n\n  ',
  {},
  { linhas: 0, problemas: 0 },
)

caso(
  'Uma linha boa e uma ruim: guarda a boa e explica a ruim',
  '202506007GV;Ana Clara Souza;a@x.br\n000;Sem Matricula;b@x.br',
  {},
  { linhas: 1, problemas: 1, contemProblema: 'Linha 2' },
)

caso(
  'Matrícula em minúsculas vira maiúscula',
  '202506007gv;Ana Clara Souza;a@x.br',
  {},
  { linhas: 1, primeira: { matricula: '202506007GV' } },
)

console.log('')
if (falhas > 0) {
  console.log(`✗ ${falhas} de ${total} verificações falharam\n`)
  process.exit(1)
}
console.log(`✓ ${total} verificações do leitor de lista passaram\n`)
