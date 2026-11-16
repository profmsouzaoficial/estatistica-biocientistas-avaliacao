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
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lerVersaoDoHtml, mudouApp } from './versao.mjs'

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

// ---- 3. "mudou o app?" num repositório descartável --------------------------
// É a pergunta que decide se a Vercel pula o build e se `pnpm versao` pode
// dizer "o app no ar é o mesmo". Errar aqui esconde código novo fora do ar.
const repo = mkdtempSync(join(tmpdir(), 'repo-'))
const git = (...args) =>
  execFileSync('git', ['-c', 'user.email=teste@local', '-c', 'user.name=teste', ...args], { cwd: repo, encoding: 'utf8' })
git('init', '-q')
const commitar = (msg) => {
  git('add', '-A')
  git('commit', '-q', '-m', msg)
  return git('rev-parse', '--short', 'HEAD').trim()
}
writeFileSync(join(repo, 'README.md'), '# app\n')
const c1 = commitar('doc inicial')
mkdirSync(join(repo, 'docs'))
writeFileSync(join(repo, 'docs', 'guia.md'), 'guia\n')
const c2 = commitar('só documento')
mkdirSync(join(repo, 'src'))
writeFileSync(join(repo, 'src', 'app.ts'), 'export const a = 1\n')
const c3 = commitar('código')

conferir('commit só de documento não muda o app', mudouApp(c1, c2, repo) === false)
conferir('commit que mexe em src/ muda o app', mudouApp(c2, c3, repo) === true)
conferir('commit que mexe em script de teste não muda o app', (() => {
  mkdirSync(join(repo, 'scripts'))
  writeFileSync(join(repo, 'scripts', 'x.mjs'), 'console.log(1)\n')
  const c4 = commitar('script')
  return mudouApp(c3, c4, repo) === false
})())
conferir('commit publicado que não existe aqui devolve null', mudouApp('0000000', 'HEAD', repo) === null)

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) falharam.\x1b[0m\n`)
  process.exit(1)
}
console.log('  \x1b[32m✓ 15 verificações da marca de versão passaram\x1b[0m\n')
