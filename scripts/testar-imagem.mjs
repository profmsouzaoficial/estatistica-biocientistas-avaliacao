#!/usr/bin/env node
/**
 * Teste das mensagens de falha da foto (src/lib/imagem.ts).
 *
 * O que se testa aqui não é a decodificação — isso depende do navegador e é o
 * `pnpm e2e:foto` que cobre, com um arquivo HEIC de verdade no seletor. Aqui se
 * testa a **decisão**: dado um arquivo que não abriu, o app escolhe a mensagem
 * certa e ela diz o que fazer (não só "deu erro").
 *
 * Uso: node scripts/testar-imagem.mjs
 */
import { build } from 'esbuild'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const pasta = join(raiz, '.temp-testes', 'imagem')
mkdirSync(pasta, { recursive: true })

writeFileSync(join(pasta, 'entrada.ts'), `export { ehHeic, mensagemDeFalha, ErroDeImagem } from '../../src/lib/imagem'`)

await build({
  entryPoints: [join(pasta, 'entrada.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(pasta, 'imagem.mjs'),
  logLevel: 'error',
})

const { ehHeic, mensagemDeFalha, ErroDeImagem } = await import(`file://${join(pasta, 'imagem.mjs')}`)

let falhas = 0
function conferir(nome, condicao, detalhe) {
  if (condicao) console.log(`  \x1b[32m✓\x1b[0m ${nome}`)
  else {
    falhas++
    console.log(`  \x1b[31m✗\x1b[0m ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

console.log('\n  Foto · reconhecer o formato e escolher a mensagem\n')

conferir('HEIC pelo tipo MIME', ehHeic('IMG_0042', 'image/heic'))
conferir('HEIF pelo tipo MIME', ehHeic('IMG_0042', 'image/heif'))
conferir('HEIC pela extensão (tipo genérico)', ehHeic('IMG_0042.HEIC', 'application/octet-stream'))
conferir('HEIC pela extensão, sem tipo', ehHeic('foto.heif', ''))
conferir('JPEG não é confundido', !ehHeic('redacao.jpg', 'image/jpeg'))
conferir('PNG não é confundido', !ehHeic('redacao.png', 'image/png'))
conferir('nome vazio não quebra', !ehHeic(undefined, undefined))

const heic = mensagemDeFalha('heic')
conferir('a mensagem do HEIC manda usar "Tirar foto"', /Tirar foto/.test(heic), heic)
conferir('a mensagem do HEIC explica o ajuste do iPhone', /Ajustes/.test(heic) && /Mais compatível/.test(heic))
const formato = mensagemDeFalha('formato')
conferir('a mensagem genérica lista os formatos aceitos', /JPG, PNG ou WEBP/.test(formato), formato)
conferir('a mensagem de tempo sugere tentar de novo', /demorou demais/.test(mensagemDeFalha('tempo')))
conferir('a mensagem de arquivo vazio é específica', /vazio/.test(mensagemDeFalha('vazio')))

const erro = new ErroDeImagem('heic', heic)
conferir('o erro carrega o código da falha', erro.codigo === 'heic' && erro instanceof Error)

rmSync(join(raiz, '.temp-testes'), { recursive: true, force: true })

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) da imagem falharam\x1b[0m\n`)
  process.exit(1)
}
console.log('  \x1b[32m✓ 13 verificações da imagem passaram\x1b[0m\n')
