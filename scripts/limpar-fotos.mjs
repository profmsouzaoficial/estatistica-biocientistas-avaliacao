#!/usr/bin/env node
/**
 * Limpeza das fotos do bucket privado `redacoes`.
 *
 * O Storage não participa do `on delete cascade` do banco: quando uma submissão
 * (ou a turma inteira) é apagada, o arquivo continua lá. Este script compara o
 * que está no bucket com o que as submissões realmente apontam em `foto_path`.
 *
 * Por padrão só MOSTRA o que seria apagado. Para apagar de verdade:
 *   pnpm fotos:limpar --apagar
 *
 * Regras:
 *   - pasta sem submissão correspondente  → apaga (redação que não existe mais);
 *   - arquivo dentro de uma submissão que não é o `foto_path` → apaga
 *     (reenvio antigo; o app guarda o caminho da foto válida);
 *   - o `foto_path` atual nunca é apagado.
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
const porId = new Map(submissoes.map((s) => [s.id, s.foto_path]))

const pastas = (await listar('')).filter((o) => o.id === null)
const semDono = []
const antigas = []
let mantidas = 0

for (const pasta of pastas) {
  const arquivos = (await listar(pasta.name)).filter((o) => o.id !== null)
  const atual = porId.get(pasta.name)
  for (const arquivo of arquivos) {
    const caminho = `${pasta.name}/${arquivo.name}`
    if (!porId.has(pasta.name)) {
      semDono.push(caminho)
    } else if (atual && caminho !== atual) {
      antigas.push(caminho)
    } else {
      mantidas++
    }
  }
}

const alvos = [...semDono, ...antigas]
console.log(`  submissões no banco: ${submissoes.length}`)
console.log(`  fotos no bucket:     ${mantidas + alvos.length}`)
console.log(`  fotos em uso:        ${mantidas}`)
console.log(`  sem submissão:       ${semDono.length}`)
console.log(`  reenvios antigos:    ${antigas.length}`)

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
