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
const { interpretarCsv, decodificarArquivo } = await import(pathToFileURL(saida).href)

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

// ---- arquivos de verdade: bytes, não texto -------------------------------
// O Excel em português salva CSV em Windows-1252. Lido como UTF-8, "Conceição"
// vira "Concei\ufffd\ufffdo" e o nome errado segue para a devolutiva.
const bytes = (texto, codificacao) => {
  if (codificacao === 'windows-1252') {
    const tabela = { á: 0xe1, à: 0xe0, â: 0xe2, ã: 0xe3, é: 0xe9, ê: 0xea, í: 0xed, ó: 0xf3, ô: 0xf4, õ: 0xf5, ú: 0xfa, ç: 0xe7, Á: 0xc1, À: 0xc0, Ã: 0xc3, É: 0xc9, Ç: 0xc7, Ó: 0xd3 }
    const saida = []
    for (const c of texto) saida.push(tabela[c] ?? c.charCodeAt(0))
    return new Uint8Array(saida).buffer
  }
  return new TextEncoder().encode(texto).buffer
}

function casoBytes(nome, buffer, esperado) {
  total += 1
  const r = decodificarArquivo(buffer)
  const erros = []
  if (esperado.texto !== undefined && r.texto !== esperado.texto) {
    erros.push(`texto: esperava ${JSON.stringify(esperado.texto)}, veio ${JSON.stringify(r.texto)}`)
  }
  if (esperado.contemTexto && !r.texto.includes(esperado.contemTexto)) {
    erros.push(`texto não contém ${JSON.stringify(esperado.contemTexto)}: ${JSON.stringify(r.texto)}`)
  }
  if (esperado.aviso === null && r.aviso !== null) erros.push(`aviso inesperado: ${r.aviso}`)
  if (esperado.aviso && !(r.aviso ?? '').includes(esperado.aviso)) {
    erros.push(`aviso: esperava conter ${JSON.stringify(esperado.aviso)}, veio ${JSON.stringify(r.aviso)}`)
  }
  if (!esperado.aviso && r.aviso !== null) erros.push(`não esperava aviso: ${r.aviso}`)
  if (erros.length) {
    falhas += 1
    console.log(`  ✗ ${nome}`)
    for (const e of erros) console.log(`      ${e}`)
  } else {
    console.log(`  ✓ ${nome}`)
  }
}

console.log('\n  Arquivos de verdade\n')

casoBytes('CSV do Excel em Windows-1252: acentos preservados', bytes('2026301001;Ana Conceição;ana@x.br', 'windows-1252'), {
  texto: '2026301001;Ana Conceição;ana@x.br',
  aviso: 'Windows-1252',
})

casoBytes('CSV UTF-8 com BOM: sem aviso', bytes('\ufeff2026301001;Ana Conceição;ana@x.br', 'utf-8'), {
  aviso: null,
})

casoBytes('CSV UTF-8 puro: sem aviso', bytes('2026301001;Ana Conceição;ana@x.br', 'utf-8'), { aviso: null })

casoBytes('Planilha .xlsx recusada com instrução', bytes('PK\u0003\u0004resto', 'utf-8'), {
  aviso: 'Salvar como',
})

casoBytes('Planilha .xls antiga recusada', new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]).buffer, { aviso: 'Excel' })

caso(
  'Windows-1252 + cabeçalho + colunas fora de ordem, de ponta a ponta',
  decodificarArquivo(bytes('Nome;Matrícula;E-mail\r\nAna Conceição;2026301001;ana@x.br\r\n', 'windows-1252')).texto,
  {},
  { linhas: 1, primeira: { matricula: '2026301001', nome_completo: 'Ana Conceição' } },
)

caso(
  'Cabeçalho com colunas extras (Curso, Situação)',
  'Matrícula;Nome;E-mail;Curso;Situação\n2026301001;Ana Lima;ana@x.br;Ciências Biológicas;Ativo',
  {},
  { linhas: 1, primeira: { matricula: '2026301001', nome_completo: 'Ana Lima', email: 'ana@x.br' } },
)

caso(
  'Turma inteira: 40 alunos, nenhum perdido',
  Array.from({ length: 40 }, (_, i) => `20263010${String(i).padStart(2, '0')};Aluno Número ${i + 1};a${i}@x.br`).join('\n'),
  {},
  { linhas: 40, problemas: 0 },
)

console.log('')
if (falhas > 0) {
  console.log(`✗ ${falhas} de ${total} verificações falharam\n`)
  process.exit(1)
}
console.log(`✓ ${total} verificações do leitor de lista passaram\n`)
