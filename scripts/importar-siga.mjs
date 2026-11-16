#!/usr/bin/env node
/**
 * Gera a planilha de importação da turma a partir do SIGA.
 *
 *   node scripts/importar-siga.mjs --turma CBV018GV-A --periodo 2026/3
 *
 * O SIGA devolve matrícula e nome — não devolve e-mail. Esta planilha já vem com
 * matrícula e nome preenchidos e a coluna de e-mail vazia, para o professor colar
 * os e-mails (Moodle/SIGA) sem digitar 40 nomes à mão.
 *
 * Não grava nada no banco: apenas cria o arquivo em importacao/. O SIGA é consultado
 * em modo leitura.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { carregarEnv, raiz } from './_env.mjs'

carregarEnv()

function argumento(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return padrao
}

const turma = argumento('turma', process.env.SIGA_TURMA)
const periodo = argumento('periodo', process.env.SIGA_PERIODO)
const base = (process.env.SIGA_API_BASE || 'https://siga-api.sparklingtech.com.br').replace(/\/+$/, '')
const chave = process.env.SIGA_API_KEY

if (!chave) {
  console.error('\n✗ Falta SIGA_API_KEY em ~/.dsh/secrets/avaliacoes.env.\n')
  process.exit(1)
}
if (!turma || !periodo) {
  console.error('\n✗ Informe --turma CBV018GV-A --periodo 2026/3 (ou defina SIGA_TURMA/SIGA_PERIODO).\n')
  process.exit(1)
}

const url = `${base}/api/notas?${new URLSearchParams({ turma, periodo })}`
const resposta = await fetch(url, { headers: { 'X-API-Key': chave } })
if (!resposta.ok) {
  console.error(`\n✗ O SIGA respondeu ${resposta.status}.\n`)
  process.exit(1)
}

const quadro = await resposta.json()
const alunos = (quadro.alunos ?? [])
  .map((a) => ({ matricula: String(a.matricula ?? '').trim(), nome: String(a.nome ?? '').trim() }))
  .filter((a) => a.matricula)

if (alunos.length === 0) {
  console.error('\n✗ O SIGA não devolveu alunos para essa turma/período.\n')
  process.exit(1)
}

const limpar = (t) => t.replace(/[;\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
const linhas = ['matricula;nome_completo;email', ...alunos.map((a) => `${a.matricula};${limpar(a.nome)};`)]

const pasta = join(raiz, 'importacao')
mkdirSync(pasta, { recursive: true })
const arquivo = join(pasta, `turma-${turma}-${periodo.replace('/', '-')}.csv`)
writeFileSync(arquivo, `${linhas.join('\n')}\n`, 'utf8')

console.log(`\n✓ ${alunos.length} aluno(s) de ${turma} (${periodo}) escritos em`)
console.log(`  ${arquivo}\n`)
console.log('  Próximos passos:')
console.log('   1. abra a planilha e preencha a coluna email (o cadastro do aluno exige e-mail)')
console.log('   2. no app: Turmas e alunos → Enviar CSV')
console.log('   3. apague o arquivo depois da importação (ele tem nomes de alunos)\n')
