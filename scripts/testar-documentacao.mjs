#!/usr/bin/env node
/**
 * Confere se a documentação continua batendo com o código.
 *
 *   pnpm test:documentacao
 *
 * Documentação envelhece em silêncio: um comando renomeado, uma tela que virou
 * duas, um botão que mudou de nome. Ninguém percebe até precisar do documento —
 * que é exatamente quando ele precisa estar certo.
 *
 * O teste não tenta entender o texto. Ele cobra três contratos objetivos:
 *   1. todo `pnpm <script>` citado existe no package.json;
 *   2. todo caminho de arquivo citado entre crases existe no repositório;
 *   3. todo rótulo de tela citado existe em src/ (o texto que o professor lê).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const ler = (p) => readFileSync(join(raiz, p), 'utf8')

const pacote = JSON.parse(ler('package.json')).scripts
const documentos = [
  'README.md',
  ...['guia-aluno.md', 'guia-professor.md', 'operacao.md', 'arquitetura.md', 'implantacao.md'].filter((f) =>
    existsSync(join(raiz, 'docs', f)),
  ),
].map((f) => (f === 'README.md' ? f : `docs/${f}`))

// Comandos que o próprio pnpm oferece — não precisam estar no package.json.
const NATIVOS = new Set([
  'install',
  'i',
  'add',
  'remove',
  'update',
  'exec',
  'dlx',
  'create',
  'init',
  'link',
  'run',
  'why',
  'store',
  'deploy',
  'prune',
])

// Rótulos de tela: o que o professor realmente lê e toca.
const ROTULOS = [
  'Recebendo trabalhos',
  'Data de referência',
  'Mudar data de referência',
  'Remover data de referência',
  'Salvar data',
  'Corrigir',
  'Lançar',
  'no SIGA',
  'Aprovar e liberar para o aluno',
  'Devolver para o aluno reescrever',
  'Salvar alterações',
  'Importar lista',
  'Conferir e importar',
  'Criar avaliação',
  'Excluir esta avaliação',
  'Faltam',
  'Ainda sem correção da IA',
  'Nota por critério',
  'O que já está no SIGA',
  'Nova avaliação',
  'Peso no SIGA',
  'Tentar de novo',
  'Esta redação foi entregue sem foto',
]

const fonte = documentos.map((d) => `\n${ler(d)}`).join('') + ler('src/pages/professorAvaliacao.tsx')
const src = [
  'src/pages/professorAvaliacao.tsx',
  'src/pages/professor.tsx',
  'src/pages/professorAlunos.tsx',
  'src/pages/aluno.tsx',
  'src/pages/alunoEnvio.tsx',
  'src/pages/devolutiva.tsx',
  'src/components/ui.tsx',
  'src/pages/perfil.tsx',
]
  .map((f) => ler(f))
  .join('\n')

const problemas = []
const conferir = (nome, ok, detalhe = '') => {
  if (!ok) problemas.push(`${nome}${detalhe ? ` · ${detalhe}` : ''}`)
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
}

console.log('\n  Documentação × código\n')
console.log(`  ${documentos.length} documento(s): ${documentos.join(', ')}\n`)

// ---- 1. comandos ------------------------------------------------------------
const citados = new Set()
for (const d of documentos) {
  for (const m of ler(d).matchAll(/pnpm ([a-z][a-z0-9:-]*)/g)) citados.add(m[1])
}
const semScript = [...citados].filter((c) => !NATIVOS.has(c) && !pacote[c])
conferir(
  `${citados.size} comandos pnpm citados existem`,
  semScript.length === 0,
  semScript.length ? semScript.join(', ') : [...citados].slice(0, 4).join(', ') + '…',
)

// ---- 2. caminhos ------------------------------------------------------------
const caminhos = new Set()
for (const d of documentos) {
  for (const m of ler(d).matchAll(/`((?:scripts|docs|supabase|api|src|e2e)\/[A-Za-z0-9_\-./]+)`/g)) {
    caminhos.add(m[1].replace(/\/$/, ''))
  }
}
const semArquivo = [...caminhos].filter((c) => !existsSync(join(raiz, c)))
conferir(`${caminhos.size} caminhos citados existem`, semArquivo.length === 0, semArquivo.join(', '))

// ---- 3. rótulos de tela -----------------------------------------------------
const semRotulo = ROTULOS.filter((r) => !fonte.includes(r) && !src.includes(r))
conferir(`${ROTULOS.length} rótulos de tela citados existem no app`, semRotulo.length === 0, semRotulo.join(', '))

// ---- 4. contagem de telas do e2e:mobile ------------------------------------
const mobile = ler('e2e/mobile.mjs')
const telasMedidas = (mobile.match(/await medir\(/g) ?? []).length
const palabras = { 9: 'nove', 10: 'dez', 11: 'onze', 12: 'doze', 13: 'treze', 14: 'catorze', 15: 'quinze', 16: 'dezesseis' }
const dito = palabras[telasMedidas] ?? String(telasMedidas)
const contagens = documentos
  .map((d) => ({
    d,
    achado: ler(d).match(new RegExp(`(?:(${Object.values(palabras).join('|')})|(\\d+)) telas (?:principais|em|e)\\b`, 'g')),
  }))
  .filter((x) => x.achado)
const numeroDe = (texto) => {
  const palavra = texto.split(' ')[0]
  return Number(palavra) || Number(Object.entries(palabras).find(([, v]) => v === palavra)?.[0])
}
const erradas = contagens
  .map((x) => ({ ...x, fora: x.achado.filter((t) => numeroDe(t) !== telasMedidas) }))
  .filter((x) => x.fora.length > 0)

conferir(
  `contagem de telas do e2e:mobile confere (${telasMedidas} = ${dito})`,
  erradas.length === 0,
  erradas.map((x) => `${x.d}: ${x.fora.join(', ')}`).join(' · '),
)

// ---- 5. migrações citadas ---------------------------------------------------
const migracoes = [...new Set(documentos.flatMap((d) => [...ler(d).matchAll(/(\d{4}_[a-z0-9_]+\.sql)/g)].map((m) => m[1])))]
const semMigracao = migracoes.filter((m) => !existsSync(join(raiz, 'supabase/migrations', m)))
conferir(`${migracoes.length} migração(ões) citadas existem`, semMigracao.length === 0, semMigracao.join(', '))

console.log('')
if (problemas.length) {
  console.log(`\x1b[31m${problemas.length} problema(s) de documentação:\x1b[0m`)
  for (const p of problemas) console.log(`  · ${p}`)
  console.log('')
  process.exit(1)
}
console.log('\x1b[32mDocumentação consistente com o código.\x1b[0m\n')
