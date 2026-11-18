#!/usr/bin/env node
/**
 * Gera favicon e ícones do PWA a partir do brasão oficial da UFJF
 * (`public/brasao-ufjf.png`), sobre o papel quente da paleta.
 *
 *   node scripts/gerar-icones.mjs
 *
 * Usa o Chromium do Playwright (já é dependência de teste) para compor e
 * rasterizar; não é preciso ImageMagick. O brasão fica em 68% do lado para
 * caber na área segura dos ícones maskable do Android.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const raiz = dirname(fileURLToPath(import.meta.url)).replace(/\/scripts$/, '')
const publico = join(raiz, 'public')
const PAPEL = '#f8f5ec'
const brasao = `data:image/png;base64,${readFileSync(join(publico, 'brasao-ufjf.png')).toString('base64')}`

const navegador = await chromium.launch()
for (const { arquivo, tamanho } of [
  { arquivo: 'favicon.png', tamanho: 64 },
  { arquivo: 'icone-192.png', tamanho: 192 },
  { arquivo: 'icone-512.png', tamanho: 512 },
]) {
  const pagina = await navegador.newPage({ viewport: { width: tamanho, height: tamanho }, deviceScaleFactor: 1 })
  const largura = Math.round(tamanho * 0.68)
  await pagina.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;width:${tamanho}px;height:${tamanho}px;background:${PAPEL};overflow:hidden}
      body{display:grid;place-items:center}
      img{width:${largura}px;height:auto;display:block}
    </style></head><body><img src="${brasao}" alt=""></body></html>`,
  )
  await pagina.waitForFunction(() => document.images[0]?.complete)
  await pagina.screenshot({ path: join(publico, arquivo), clip: { x: 0, y: 0, width: tamanho, height: tamanho } })
  await pagina.close()
  console.log(`  ${arquivo} · ${tamanho}×${tamanho}`)
}
await navegador.close()
