#!/usr/bin/env node
/**
 * Testa a leitura de UMA foto real, com o provedor configurado no servidor.
 *
 *   pnpm test:ocr:foto ~/redacao.jpg
 *
 * Diferente do `pnpm test:ocr` (que imita o Google e confere o que o app envia),
 * este aqui manda a foto de verdade: vale uma chamada real, e vale a pena rodar
 * uma vez com cada tipo de letra que a turma escreve. Serve para responder duas
 * perguntas antes de 7 alunos entregarem:
 *
 *   1. o provedor configurado lê a nossa letra?
 *   2. a transcrição volta íntegra (sem cortar o fim, sem inventar)?
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { carregarEnv, raiz } from './_env.mjs'

const foto = process.argv[2]
if (!foto) {
  console.error('\n  ✗ informe a foto: pnpm test:ocr:foto caminho/da/foto.jpg\n')
  process.exit(1)
}
if (!existsSync(foto)) {
  console.error(`\n  ✗ foto não encontrada: ${foto}\n`)
  process.exit(1)
}

carregarEnv()

// o mesmo bundle que a função da Vercel usa
const pasta = join(raiz, '.temp-ocr')
await mkdir(pasta, { recursive: true })
const entrada = join(pasta, 'entrada.ts')
await writeFile(entrada, `export { transcreverImagem, ocrConfigurado, provedorDeVisao } from ${JSON.stringify(join(raiz, 'api/_lib/transcrever.ts'))}\n`)
const saida = join(pasta, 'saida.mjs')
await build({ entryPoints: [entrada], outfile: saida, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' })
const mod = await import(`${saida}?v=${Date.now()}`)

const provedor = mod.provedorDeVisao()
const configurado = mod.ocrConfigurado()
console.log('\n  Leitura da foto · teste com o provedor real')
console.log(`  provedor: ${provedor}${process.env.VISION_MODEL ? ` · modelo: ${process.env.VISION_MODEL}` : ''}`)
console.log(`  arquivo: ${foto}`)

if (!configurado) {
  console.error('\n  ✗ OCR não configurado (falta VISION_API_KEY no servidor/.env).\n')
  process.exit(1)
}

const bytes = await readFile(foto)
const mimetype = /\.png$/i.test(foto) ? 'image/png' : 'image/jpeg'
console.log(`  tamanho: ${(bytes.length / 1024).toFixed(0)} KB · ${mimetype}`)

const inicio = Date.now()
let resultado
try {
  resultado = await mod.transcreverImagem(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), mimetype)
} catch (e) {
  console.error(`\n  ✗ falhou em ${Date.now() - inicio} ms: ${e.codigo ?? ''} ${e.message}`)
  if (e.detalhe) console.error(`    ${String(e.detalhe).slice(0, 400)}`)
  process.exit(1)
}
const ms = Date.now() - inicio

const texto = (resultado.texto ?? '').trim()
const palavras = texto ? texto.split(/\s+/).length : 0
const linhas = texto ? texto.split(/\n/).filter((l) => l.trim()).length : 0

console.log(`\n  ── transcrição (${ms} ms · ${palavras} palavras · ${linhas} parágrafos) ──\n`)
console.log(
  texto
    .split('\n')
    .map((l) => `  ${l}`)
    .join('\n'),
)
console.log('\n  ────────────────────────────────────────────────\n')

const problemas = []
if (!texto) problemas.push('voltou vazia')
else if (texto === 'SEM_TEXTO') problemas.push('o provedor não reconheceu texto manuscrito na imagem')
else {
  if (palavras < 20) problemas.push(`só ${palavras} palavras — a redação inteira deveria ter mais`)
  if (/\[ilegível\]/gi.test(texto)) {
    const n = (texto.match(/\[ilegível\]/gi) ?? []).length
    problemas.push(`${n} trecho(s) marcados como [ilegível]`)
  }
}

if (problemas.length) {
  console.log(`  ${'\x1b[33m'}!${'\x1b[0m'} confira: ${problemas.join('; ')}`)
  console.log('  Compare com a foto. Se estiver ruim: aumente LADO_MAXIMO em src/components/Camera.tsx ou troque o modelo de visão.\n')
  process.exit(1)
}

console.log(`  \x1b[32m✓\x1b[0m transcrição obtida com ${resultado.modelo} em ${ms} ms\n`)
