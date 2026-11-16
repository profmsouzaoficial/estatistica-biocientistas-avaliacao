#!/usr/bin/env node
/**
 * Testes do leitor de JSON do modelo — o ponto mais frágil da correção.
 *
 *   pnpm test:parser
 *
 * Modelos pequenos erram chaves, deixam vírgula pendente e cortam a resposta.
 * Aqui os casos reais observados viram teste: se um deles voltar a falhar,
 * o professor veria "JSON inválido" em vez de nota.
 */
import { build } from 'esbuild'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const pasta = mkdtempSync(join(tmpdir(), 'parser-'))
const saida = join(pasta, 'rubrica.mjs')
const entrada = join(import.meta.dirname, '..', 'api', '_lib', 'rubrica.ts')

await build({ entryPoints: [entrada], bundle: true, platform: 'node', format: 'esm', outfile: saida, logLevel: 'error' })
const { decodificarJson } = await import(pathToFileURL(saida).href)

// evita poluir o teste com o aviso esperado de reparo
const avisoOriginal = console.warn
console.warn = () => {}

let falhas = 0
function caso(nome, entrada, verificar) {
  try {
    const resultado = decodificarJson(entrada)
    verificar(resultado)
    console.log(`  ✓ ${nome}${resultado.reparado ? ' (reparado)' : ''}`)
  } catch (erro) {
    falhas++
    console.log(`  ✗ ${nome}\n      ${erro instanceof Error ? erro.message : String(erro)}`)
  }
}
function esperaErro(nome, entrada, codigo) {
  try {
    decodificarJson(entrada)
    falhas++
    console.log(`  ✗ ${nome} — deveria falhar e não falhou`)
  } catch (erro) {
    const ok = erro && typeof erro === 'object' && 'codigo' in erro && erro.codigo === codigo
    if (ok) console.log(`  ✓ ${nome} (${codigo})`)
    else {
      falhas++
      console.log(`  ✗ ${nome} — esperava ${codigo}, veio ${erro?.codigo ?? erro?.message}`)
    }
  }
}

const completo = `{
  "criterios": [
    { "id": "c1", "valor": 5, "justificativa": "ok" },
    { "id": "c2", "valor": 4, "justificativa": "ok" }
  ],
  "pontos_fortes": ["a"],
  "comentario": "bom",
  "confianca": 0.8
}`

console.log('\nLeitor de JSON da correção\n')

caso('JSON íntegro', completo, (r) => {
  if (r.reparado) throw new Error('não deveria precisar de reparo')
  if (r.json.criterios.length !== 2) throw new Error('critérios perdidos')
})

caso('com cercas de markdown', '```json\n' + completo + '\n```', (r) => {
  if (r.json.criterios.length !== 2) throw new Error('critérios perdidos')
})

// caso real do llama3: esqueceu a chave de fechamento do último critério
caso('sem a chave do último critério', `{
  "criterios": [
    { "id": "c1", "valor": 5, "justificativa": "ok" },
    { "id": "c2", "valor": 4, "justificativa": "ok"
  ],
  "comentario": "bom"
}`, (r) => {
  if (!r.reparado) throw new Error('deveria ter reparado')
  if (r.json.criterios.length !== 2) throw new Error(`esperava 2 critérios, veio ${r.json.criterios.length}`)
})

caso('resposta cortada no meio da última frase', `{
  "criterios": [
    { "id": "c1", "valor": 5, "justificativa": "ok" },
    { "id": "c2", "valor": 4, "justificativa": "ok" }
  ],
  "comentario": "texto que não termin`,
(r) => {
  if (r.json.criterios.length !== 2) throw new Error('critérios perdidos')
})

caso('texto solto depois do JSON', `${completo}\nEspero ter ajudado!`, (r) => {
  if (r.reparado) throw new Error('não deveria precisar de reparo')
  if (r.json.criterios.length !== 2) throw new Error('critérios perdidos')
})

esperaErro('resposta sem JSON', 'Desculpe, não consigo avaliar.', 'RESPOSTA_INVALIDA')
esperaErro('JSON sem critérios', '{"comentario": "sem critérios"}', 'RESPOSTA_INVALIDA')

console.warn = avisoOriginal
console.log('')
if (falhas > 0) {
  console.log(`  ${falhas} caso(s) falharam.\n`)
  process.exit(1)
}
console.log('  Todos os casos passaram.\n')
