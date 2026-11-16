#!/usr/bin/env node
/**
 * Testes do leitor de versão (`scripts/versao.mjs`) e do rodapé de versão.
 *
 *   pnpm test:versao
 *
 * O leitor decide se um deploy pode ser pulado. Errar para "igual" deixa o site
 * velho no ar achando que está novo; errar para "diferente" gasta um dos 100
 * deploys do dia à toa. Por isso cada formato de HTML tem um caso.
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lerVersaoDoHtml } from './versao.mjs'

let falhas = 0
function conferir(nome, condicao, detalhe = '') {
  if (condicao) {
    console.log(`  \x1b[32m✓\x1b[0m ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  } else {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  }
}

console.log('\n  Marca de versão\n')

// ---- 1. leitor do HTML ------------------------------------------------------
const comVersao = `<!doctype html><html><head><meta name="app-versao" content="99c5c76" /><title>x</title></head></html>`
conferir('lê a marca no formato que o Vite gera', lerVersaoDoHtml(comVersao) === '99c5c76')

const atributosTrocados = `<meta content="abc1234" name="app-versao">`
conferir('aceita atributos em outra ordem e sem barra', lerVersaoDoHtml(atributosTrocados) === 'abc1234')

const aspasSimples = `<meta name='app-versao' content='abc1234' />`
conferir('aceita aspas simples', lerVersaoDoHtml(aspasSimples) === 'abc1234')

conferir('build antigo (sem a marca) devolve null', lerVersaoDoHtml('<html><head><title>x</title></head></html>') === null)
conferir('meta de outro nome não confunde', lerVersaoDoHtml('<meta name="app-compilado" content="2026-11-16" />') === null)
conferir('marca vazia não vale como versão', lerVersaoDoHtml('<meta name="app-versao" content="   " />') === null)
conferir('entrada que não é string devolve null', lerVersaoDoHtml(undefined) === null)

// ---- 2. rodapé: "compilada hoje às 18:40" ----------------------------------
const pasta = mkdtempSync(join(tmpdir(), 'versao-'))
const saida = join(pasta, 'versao.mjs')
await build({
  entryPoints: [join(import.meta.dirname, '..', 'src', 'lib', 'versao.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: saida,
  logLevel: 'error',
  // o Vite injeta estes valores no build do app; aqui entram fixos
  define: { __VERSAO__: '"abc1234"', __COMPILADO_EM__: '"2026-11-16T21:40:00.000Z"' },
})
const v = await import(pathToFileURL(saida).href)

const agora = new Date(2026, 10, 16, 23, 0) // 16/11/2026 23:00 local
conferir(
  'compilado hoje',
  v.quandoFoiCompilado('2026-11-16T21:40:00.000Z', agora).startsWith('hoje às'),
  v.quandoFoiCompilado('2026-11-16T21:40:00.000Z', agora),
)
const hojeCedo = new Date(2026, 10, 16, 6, 0)
conferir(
  'compilado ontem',
  v.quandoFoiCompilado('2026-11-15T21:40:00.000Z', hojeCedo).startsWith('ontem às'),
  v.quandoFoiCompilado('2026-11-15T21:40:00.000Z', hojeCedo),
)
const semanaDepois = new Date(2026, 10, 20, 9, 0)
conferir(
  'compilado em outro dia mostra a data',
  /^\d{2}\/\d{2} às \d{2}:\d{2}$/.test(v.quandoFoiCompilado('2026-11-16T21:40:00.000Z', semanaDepois)),
  v.quandoFoiCompilado('2026-11-16T21:40:00.000Z', semanaDepois),
)
conferir('data inválida não quebra o rodapé', v.quandoFoiCompilado('nada', agora) === '')

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) falharam.\x1b[0m\n`)
  process.exit(1)
}
console.log('  \x1b[32m✓ 11 verificações da marca de versão passaram\x1b[0m\n')
