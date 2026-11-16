#!/usr/bin/env node
/**
 * Limpeza das fotos do bucket privado `redacoes`.
 *
 * O Storage não participa do `on delete cascade` do banco: quando uma submissão
 * (ou a turma inteira) é apagada, o arquivo continua lá. Este script lista o
 * bucket e mantém exatamente os caminhos que alguma submissão aponta em
 * `foto_path`; todo o resto é sobra.
 *
 * Atenção ao formato do caminho: o app grava `<aluno_id>/<submissao_id>.jpg`.
 * A pasta é do ALUNO, não da submissão — por isso a comparação é feita com o
 * caminho completo de `foto_path`, e não com o nome da pasta.
 *
 * Por padrão só MOSTRA o que seria apagado. Para apagar de verdade:
 *   pnpm fotos:limpar --apagar
 */
import { carregarEnv, chaveServico, supabaseRest, urlSupabase } from './_env.mjs'

const origens = carregarEnv()
console.log('\n  Fotos · Análise de Dados para Biocientistas')
if (origens.length) console.log(`  env: ${origens.join(', ')}`)

const apagar = process.argv.includes('--apagar')

const cabecalhos = () => ({
  apikey: chaveServico(),
  Authorization: `Bearer ${chaveServico()}`,
  'Content-Type': 'application/json',
})

async function listar(prefixo) {
  const resposta = await fetch(`${urlSupabase()}/storage/v1/object/list/redacoes`, {
    method: 'POST',
    headers: cabecalhos(),
    body: JSON.stringify({ prefix: prefixo, limit: 100, offset: 0 }),
  })
  if (!resposta.ok) throw new Error(`Storage recusou a listagem (${resposta.status}): ${(await resposta.text()).slice(0, 160)}`)
  return resposta.json()
}

const submissoes = await supabaseRest('submissoes?select=id,foto_path')
const emUso = new Set(submissoes.map((s) => s.foto_path).filter(Boolean))

const pastas = (await listar('')).filter((o) => o.id === null)
const objetos = []
for (const pasta of pastas) {
  const arquivos = (await listar(pasta.name)).filter((o) => o.id !== null)
  for (const arquivo of arquivos) objetos.push(`${pasta.name}/${arquivo.name}`)
}

const mantidas = objetos.filter((caminho) => emUso.has(caminho))
const alvos = objetos.filter((caminho) => !emUso.has(caminho))

console.log(`  submissões no banco: ${submissoes.length}`)
console.log(`  fotos no bucket:     ${objetos.length}`)
console.log(`  fotos em uso:        ${mantidas.length}`)
console.log(`  sobras:              ${alvos.length}`)

if (alvos.length === 0) {
  console.log('\n  ✓ nada para limpar\n')
  process.exit(0)
}

if (!apagar) {
  for (const caminho of alvos.slice(0, 20)) console.log(`    · ${caminho}`)
  if (alvos.length > 20) console.log(`    … e mais ${alvos.length - 20}`)
  console.log('\n  Simulação: nada foi apagado. Rode com --apagar para remover.\n')
  process.exit(0)
}

let apagadas = 0
for (let i = 0; i < alvos.length; i += 50) {
  const lote = alvos.slice(i, i + 50)
  const resposta = await fetch(`${urlSupabase()}/storage/v1/object/redacoes`, {
    method: 'DELETE',
    headers: cabecalhos(),
    body: JSON.stringify({ prefixes: lote }),
  })
  if (!resposta.ok) {
    console.error(`  ⚠ lote recusado (${resposta.status}): ${(await resposta.text()).slice(0, 160)}`)
    continue
  }
  apagadas += lote.length
}

console.log(`\n  ✓ ${apagadas} foto(s) apagada(s)\n`)
