#!/usr/bin/env node
/**
 * Mede o contraste de cada texto do app (WCAG 2.1 AA).
 *
 *   pnpm test:contraste
 *
 * Contraste não é preciosismo: o professor abre este app de madrugada, o aluno
 * no corredor com sol na tela, e as legendas menores (11–12px) são justamente
 * as que dizem "prazo encerrado", "sem cadastro", "nota ajustada".
 *
 * O teste abre as telas na demonstração, lê a cor calculada de cada elemento
 * com texto, acha o fundo efetivo (subindo a árvore até uma cor opaca) e aplica
 * a fórmula oficial de luminância. Reprovam: texto pequeno abaixo de 4.5:1 e
 * texto grande abaixo de 3:1.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const PORTA = 3217
const WEB = `http://127.0.0.1:${PORTA}`
const SENHA = 'demo12345'

const servidor = spawn(
  'npx',
  ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORTA), '--strictPort'],
  { cwd: raiz, stdio: 'ignore' },
)
for (let i = 0; i < 80; i++) {
  try {
    if ((await fetch(WEB)).ok) break
  } catch {
    /* ainda subindo */
  }
  await new Promise((r) => setTimeout(r, 250))
}

// A função roda dentro do navegador: usa só o que existe lá.
function coletar() {
  const lin = (c) => {
    c /= 255
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const luminancia = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  const contraste = (a, b) => {
    const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p)
    return (x + 0.05) / (y + 0.05)
  }
  const paraRgba = (cor) => {
    const m = cor.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    const partes = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return { rgb: partes.slice(0, 3), alfa: partes.length > 3 ? partes[3] : 1 }
  }
  // mistura sobre o que está atrás (aproximação: alfa simples)
  const sobrepor = (frente, fundo, alfa) => frente.map((v, i) => v * alfa + fundo[i] * (1 - alfa))

  const fundoEfetivo = (elemento) => {
    let atual = elemento
    let acumulado = null
    while (atual && atual !== document.documentElement) {
      const cor = paraRgba(getComputedStyle(atual).backgroundColor)
      if (cor && cor.alfa > 0) {
        acumulado = acumulado === null ? cor.rgb : sobrepor(acumulado, cor.rgb, cor.alfa)
        if (cor.alfa >= 0.999) return acumulado
      }
      atual = atual.parentElement
    }
    const raizCor = paraRgba(getComputedStyle(document.body).backgroundColor)
    const base = raizCor && raizCor.alfa > 0 ? raizCor.rgb : [255, 255, 255]
    return acumulado === null ? base : sobrepor(acumulado, base, 1)
  }

  const achados = []
  for (const el of document.querySelectorAll('body *')) {
    // só elementos com texto próprio visível
    const texto = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join(' ')
      .trim()
    if (!texto) continue
    const estilo = getComputedStyle(el)
    if (estilo.visibility === 'hidden' || estilo.display === 'none' || Number(estilo.opacity) === 0) continue
    const caixa = el.getBoundingClientRect()
    if (caixa.width < 1 || caixa.height < 1) continue
    const cor = paraRgba(estilo.color)
    if (!cor) continue
    const fundo = fundoEfetivo(el)
    const frente = sobrepor(cor.rgb, fundo, cor.alfa)
    const razao = contraste(frente, fundo)
    const tamanho = parseFloat(estilo.fontSize)
    const peso = Number(estilo.fontWeight) || 400
    const grande = tamanho >= 24 || (tamanho >= 18.66 && peso >= 700)
    const minimo = grande ? 3 : 4.5
    if (razao < minimo) {
      achados.push({
        texto: texto.slice(0, 48),
        cor: estilo.color,
        fundo: `rgb(${fundo.map((v) => Math.round(v)).join(', ')})`,
        razao: Number(razao.toFixed(2)),
        minimo,
        tamanho: Number.isInteger(tamanho) ? `${tamanho}px` : `${tamanho.toFixed(1)}px`,
        tag: el.tagName.toLowerCase(),
      })
    }
  }
  return achados
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
const erros = []
pagina.on('pageerror', (e) => erros.push(e.message))

async function entrar(email) {
  await pagina.goto(WEB, { waitUntil: 'networkidle' })
  await pagina.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await pagina.goto(WEB, { waitUntil: 'networkidle' })
  await pagina.getByLabel('E-mail').fill(email)
  await pagina.getByLabel('Senha', { exact: true }).fill(SENHA)
  await pagina.getByRole('button', { name: /Entrar/ }).click()
  await pagina.waitForTimeout(1200)
}

const telas = []
const medir = async (nome) => {
  await pagina.waitForTimeout(700)
  const achados = await pagina.evaluate(coletar)
  telas.push({ nome, achados })
}

console.log('\n  Contraste dos textos · WCAG AA (4.5:1 pequeno · 3:1 grande)\n')

await pagina.goto(WEB, { waitUntil: 'networkidle' })
await medir('entrada')
await pagina.goto(`${WEB}/ajuda`, { waitUntil: 'networkidle' })
await medir('ajuda')
await pagina.goto(`${WEB}/privacidade`, { waitUntil: 'networkidle' })
await medir('privacidade')

await entrar('aluno@demo.local')
await medir('aluno · início')
await pagina.goto(`${WEB}/avaliacoes/av-demo-2`, { waitUntil: 'networkidle' })
await medir('aluno · avaliação')
await pagina.goto(`${WEB}/perfil`, { waitUntil: 'networkidle' })
await medir('aluno · perfil')

await entrar('professor@demo.local')
await medir('professor · painel')
await pagina.goto(`${WEB}/prof/avaliacoes/av-demo-1`, { waitUntil: 'networkidle' })
await medir('professor · avaliação')
await pagina.goto(`${WEB}/prof/alunos`, { waitUntil: 'networkidle' })
await medir('professor · alunos')

await navegador.close()
servidor.kill('SIGTERM')

let total = 0
for (const tela of telas) {
  if (tela.achados.length === 0) {
    console.log(`  \x1b[32m✓\x1b[0m ${tela.nome}`)
    continue
  }
  total += tela.achados.length
  console.log(`  \x1b[31m✗\x1b[0m ${tela.nome} · ${tela.achados.length}`)
  const vistos = new Set()
  for (const a of tela.achados) {
    const chave = `${a.cor}|${a.fundo}|${a.tamanho}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    console.log(
      `      ${a.razao}:1 (mínimo ${a.minimo}) · ${a.tamanho} · texto ${a.cor} sobre ${a.fundo} · “${a.texto}”`,
    )
  }
}

if (erros.length) {
  console.log(`\n  \x1b[31m✗\x1b[0m ${erros.length} erro(s) de JavaScript: ${erros[0]}`)
}

console.log('')
if (total > 0 || erros.length > 0) {
  console.log(`\x1b[31m${total} texto(s) abaixo do mínimo em ${telas.length} telas.\x1b[0m\n`)
  process.exit(1)
}
console.log(`\x1b[32m${telas.length} telas com contraste suficiente.\x1b[0m\n`)
