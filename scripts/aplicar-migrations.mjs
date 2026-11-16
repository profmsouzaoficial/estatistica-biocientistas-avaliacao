#!/usr/bin/env node
/**
 * Aplica todas as migrations de `supabase/migrations/*.sql` no projeto.
 *
 * Usa a Management API do Supabase (token pessoal), porque não há CLI instalada.
 * O token NÃO é a service role key: gere em
 * https://supabase.com/dashboard/account/tokens e salve como SUPABASE_ACCESS_TOKEN.
 *
 * Uso:  pnpm db:aplicar
 *       pnpm db:aplicar --simular   (só lista o que seria aplicado)
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { carregarEnv, exigir, raiz, refDoProjeto } from './_env.mjs'

const origens = carregarEnv()
const simular = process.argv.includes('--simular')

console.log('\n  Migrations · Análise de Dados para Biocientistas')
if (origens.length) console.log(`  env: ${origens.join(', ')}`)

const ref = refDoProjeto()
const token = exigir('SUPABASE_ACCESS_TOKEN')
const pasta = join(raiz, 'supabase', 'migrations')

const arquivos = (await readdir(pasta)).filter((f) => f.endsWith('.sql')).sort()
if (arquivos.length === 0) {
  console.log('\n  Nenhuma migration encontrada.\n')
  process.exit(0)
}

console.log(`  projeto: ${ref}`)
console.log(`  ${arquivos.length} arquivo(s): ${arquivos.join(', ')}\n`)

async function executarSql(sql, rotulo) {
  const resposta = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  const texto = await resposta.text()
  if (!resposta.ok) {
    throw new Error(`${rotulo}: ${resposta.status} — ${texto.slice(0, 800)}`)
  }
  return texto ? JSON.parse(texto) : null
}

for (const arquivo of arquivos) {
  const sql = await readFile(join(pasta, arquivo), 'utf8')
  if (simular) {
    console.log(`  ~ ${arquivo} (${(sql.length / 1024).toFixed(1)} KB) — não aplicado (--simular)`)
    continue
  }
  process.stdout.write(`  · aplicando ${arquivo} … `)
  try {
    await executarSql(sql, arquivo)
    console.log('ok')
  } catch (erro) {
    console.log('FALHOU')
    console.error(`\n${erro.message}\n`)
    process.exit(1)
  }
}

if (simular) {
  console.log('\n  Simulação concluída — nada foi alterado.\n')
  process.exit(0)
}

// Confere o resultado
try {
  const tabelas = await executarSql(
    `select table_name from information_schema.tables
      where table_schema = 'public' order by table_name`,
    'verificação',
  )
  const nomes = (tabelas ?? []).map((t) => t.table_name).filter(Boolean)
  console.log(`\n  ✓ ${nomes.length} tabela(s) no schema public:`)
  console.log(`    ${nomes.join(', ')}`)
  console.log('\n  Próximo passo: criar a conta de professor com `pnpm professor:criar`.\n')
} catch {
  console.log('\n  ✓ Migrations aplicadas (não consegui listar as tabelas para conferir).\n')
}
