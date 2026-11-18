#!/usr/bin/env node
/**
 * Confere a integridade dos dados: banco ao vivo ou arquivo de backup.
 *
 *   pnpm verificar                 → lê o banco e confere
 *   pnpm verificar --fotos         → também procura foto no bucket fora de submissão
 *   pnpm verificar --arquivo backups/backup-....json  → confere um backup (sem rede)
 *
 * Nota de aluno é documento. Este script responde "os dados fazem sentido?" antes
 * de qualquer lançamento no SIGA: rubrica que não fecha com o valor total, nota
 * final que não bate com a fórmula, critério que não soma a nota bruta, redação
 * apontando para avaliação que não existe, matrícula apontando para conta
 * fantasma, lançamento no SIGA órfão.
 *
 * Sai com código 1 quando há erro (aviso não derruba).
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { carregarEnv, chaveServico, supabaseRest, urlSupabase } from './_env.mjs'
import { conferir, resumir } from './_integridade.mjs'

const argumentos = process.argv.slice(2)
const lerArg = (nome) => {
  const i = argumentos.indexOf(nome)
  return i >= 0 ? argumentos[i + 1] : undefined
}
const arquivo = lerArg('--arquivo')
const comFotos = argumentos.includes('--fotos')

const cores = {
  erro: '\x1b[31m',
  aviso: '\x1b[33m',
  ok: '\x1b[32m',
  fraco: '\x1b[2m',
  fim: '\x1b[0m',
}

async function lerBanco() {
  const tabelas = [
    'turmas',
    'alunos_esperados',
    'profiles',
    'avaliacoes',
    'submissoes',
    'correcoes',
    'lancamentos_siga',
    'frequencias',
    'auditoria',
  ]
  const dados = {}
  for (const t of tabelas) dados[t] = await supabaseRest(`${t}?select=*`)
  return dados
}

console.log('\n  Conferência de integridade · Análise de Dados para Biocientistas')

let dados
if (arquivo) {
  if (!existsSync(arquivo)) {
    console.error(`\n  ✗ arquivo não encontrado: ${arquivo}\n`)
    process.exit(1)
  }
  const conteudo = JSON.parse(await readFile(arquivo, 'utf8'))
  // o backup grava { gerado_em, tabelas: { nome: [...] } } ou as tabelas na raiz
  dados = conteudo.tabelas ?? conteudo.dados ?? conteudo
  console.log(`  arquivo: ${arquivo}`)
} else {
  carregarEnv()
  console.log(`  projeto: ${urlSupabase()}`)
  dados = await lerBanco()
}

const resumo = resumir(dados)
console.log('')
for (const [nome, total] of Object.entries(resumo)) {
  process.stdout.write(`  ${cores.fraco}${nome.padEnd(12)}${cores.fim}${String(total).padStart(4)}   `)
}
console.log('')

const achados = conferir(dados)

// fotos: arquivo no bucket sem submissão apontando para ele (só contra o banco)
if (comFotos && !arquivo) {
  const servico = chaveServico()
  const lista = await fetch(`${urlSupabase()}/storage/v1/object/list/redacoes`, {
    method: 'POST',
    headers: { apikey: servico, Authorization: `Bearer ${servico}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 1000 }),
  }).then((r) => r.json())
  const pastas = Array.isArray(lista) ? lista.filter((o) => o.id === null).map((o) => o.name) : []
  const arquivos = []
  for (const pasta of pastas) {
    const dentro = await fetch(`${urlSupabase()}/storage/v1/object/list/redacoes`, {
      method: 'POST',
      headers: { apikey: servico, Authorization: `Bearer ${servico}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: `${pasta}/`, limit: 1000 }),
    }).then((r) => r.json())
    for (const o of dentro ?? []) if (o.name) arquivos.push(`${pasta}/${o.name}`)
  }
  const usados = new Set((dados.submissoes ?? []).map((s) => s.foto_path).filter(Boolean))
  for (const caminho of arquivos) {
    if (!usados.has(caminho)) achados.push({ nivel: 'aviso', codigo: 'foto-orfa', mensagem: `foto sem submissão: ${caminho}` })
  }
}

const erros = achados.filter((a) => a.nivel === 'erro')
const avisos = achados.filter((a) => a.nivel === 'aviso')

console.log('')
if (achados.length === 0) {
  console.log(`  ${cores.ok}✓ tudo consistente${cores.fim} — rubricas fecham, notas batem, vínculos existem\n`)
  process.exit(0)
}

for (const a of erros) console.log(`  ${cores.erro}✗ ${a.codigo}${cores.fim} ${a.mensagem}`)
for (const a of avisos) console.log(`  ${cores.aviso}! ${a.codigo}${cores.fim} ${a.mensagem}`)
console.log('')
console.log(
  `  ${erros.length} erro(s), ${avisos.length} aviso(s) de ${Object.values(resumo).reduce((a, b) => a + b, 0)} registro(s)\n`,
)
process.exit(erros.length > 0 ? 1 : 0)
