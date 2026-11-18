#!/usr/bin/env node
/**
 * Acessibilidade das telas (WCAG 2.2 A/AA) — o que o contraste não vê.
 *
 *   pnpm test:a11y
 *
 * O `pnpm test:contraste` mede cor sobre cor. Ele não vê um campo sem rótulo,
 * um botão só com ícone sem nome acessível, um `div` clicável que o teclado não
 * alcança, uma lista de abas sem `role`. Para quem usa leitor de tela, esses
 * defeitos são o app inteiro.
 *
 * O axe-core roda dentro da página e devolve as violações com o elemento
 * culpado. Aqui a regra é: **grave e crítica reprovam**; moderada e leve são
 * impressas como lista de trabalho. Contraste fica desligado de propósito —
 * `pnpm test:contraste` já mede com o fundo real de cada texto, que o axe não
 * consegue saber quando há gradiente ou camada.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const raiz = join(import.meta.dirname, '..')
const PORTA = 3218
const WEB = `http://127.0.0.1:${PORTA}`
const SENHA = 'demo12345'
const AXE = join(raiz, 'node_modules', 'axe-core', 'axe.min.js')

if (!existsSync(AXE)) {
  console.error('\n  Instale a dependência de teste: pnpm add -D axe-core\n')
  process.exit(1)
}

const build = spawn('npx', ['vite', 'build', '--outDir', 'dist-demo', '--logLevel', 'error'], {
  cwd: raiz,
  stdio: 'ignore',
  env: { ...process.env, VITE_MODO_DEMO: '1' },
})
await new Promise((ok, falha) =>
  build.on('exit', (codigo) => (codigo === 0 ? ok() : falha(new Error('build da demonstração falhou')))),
)

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

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 360, height: 740 }, locale: 'pt-BR' })

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

/**
 * Roda o axe na tela atual. `runOnly` em WCAG 2.2 A/AA; contraste desligado
 * (tem teste próprio, com o fundo efetivo de cada texto).
 */
async function analisar() {
  await pagina.waitForTimeout(600)
  await pagina.addScriptTag({ path: AXE })
  return pagina.evaluate(async () => {
    const resultado = await window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    })
    return resultado.violations.map((v) => ({
      id: v.id,
      impacto: v.impact,
      ajuda: v.help,
      nos: v.nodes.length,
      exemplos: v.nodes.slice(0, 3).map((n) => ({
        alvo: n.target.join(' '),
        resumo: (n.failureSummary ?? '').split('\n').filter(Boolean).slice(1, 3).join(' '),
      })),
    }))
  })
}

const telas = []
const medir = async (nome) => {
  const achados = await analisar()
  telas.push({ nome, achados })
}

console.log('\n  Acessibilidade · WCAG 2.2 A/AA (axe-core) · tela de 360 px\n')

await pagina.goto(WEB, { waitUntil: 'networkidle' })
await medir('entrada')
await pagina.goto(`${WEB}/cadastrar`, { waitUntil: 'networkidle' })
await medir('cadastro')
await pagina.goto(`${WEB}/recuperar`, { waitUntil: 'networkidle' })
await medir('recuperar senha')
await pagina.goto(`${WEB}/ajuda`, { waitUntil: 'networkidle' })
await medir('ajuda')
await pagina.goto(`${WEB}/privacidade`, { waitUntil: 'networkidle' })
await medir('privacidade')

await entrar('aluno@demo.local')
await medir('aluno · início')
await pagina.goto(`${WEB}/avaliacoes/av-demo-1`, { waitUntil: 'networkidle' })
await medir('aluno · avaliação')
await pagina.goto(`${WEB}/avaliacoes/av-demo-2/enviar`, { waitUntil: 'networkidle' })
await medir('aluno · envio')
await pagina.goto(`${WEB}/avaliacoes/av-demo-1/devolutiva`, { waitUntil: 'networkidle' })
await medir('aluno · devolutiva')
await pagina.goto(`${WEB}/perfil`, { waitUntil: 'networkidle' })
await medir('aluno · perfil')
await pagina.getByRole('button', { name: /Refazer o teste/ }).click()
await medir('aluno · questionário de personalidade')

await entrar('professor@demo.local')
await medir('professor · painel')
await pagina.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
await medir('professor · nova avaliação')
await pagina.goto(`${WEB}/prof/avaliacoes/av-demo-1`, { waitUntil: 'networkidle' })
await medir('professor · avaliação')
await pagina.goto(`${WEB}/prof/avaliacoes/av-demo-1/revisao/sub-demo-1`, { waitUntil: 'networkidle' })
await medir('professor · revisão')
await pagina.goto(`${WEB}/prof/alunos`, { waitUntil: 'networkidle' })
await medir('professor · alunos')
await pagina.goto(`${WEB}/prof/frequencia`, { waitUntil: 'networkidle' })
await medir('professor · frequência')
await pagina.goto(`${WEB}/prof/avaliacoes/av-demo-1/historico`, { waitUntil: 'networkidle' })
await medir('professor · histórico')

await navegador.close()
servidor.kill('SIGTERM')

const graves = ['serious', 'critical']
let reprovam = 0
let trabalho = 0

for (const tela of telas) {
  const bloqueiam = tela.achados.filter((a) => graves.includes(a.impacto))
  const demais = tela.achados.filter((a) => !graves.includes(a.impacto))
  reprovam += bloqueiam.length
  trabalho += demais.length

  if (tela.achados.length === 0) {
    console.log(`  \x1b[32m✓\x1b[0m ${tela.nome}`)
    continue
  }
  console.log(
    `  ${bloqueiam.length ? '\x1b[31m✗\x1b[0m' : '\x1b[33m!\x1b[0m'} ${tela.nome} · ` +
      `${bloqueiam.length} grave(s) · ${demais.length} moderada(s)`,
  )
  for (const a of [...bloqueiam, ...demais]) {
    const cor = graves.includes(a.impacto) ? '\x1b[31m' : '\x1b[33m'
    console.log(`      ${cor}${a.impacto}\x1b[0m ${a.id} (${a.nos}×) — ${a.ajuda}`)
    for (const e of a.exemplos) console.log(`        \x1b[2m${e.alvo}${e.resumo ? ` · ${e.resumo}` : ''}\x1b[0m`)
  }
}

if (erros.length) console.log(`\n  \x1b[31m✗\x1b[0m ${erros.length} erro(s) de JavaScript: ${erros[0]}`)

console.log('')
if (reprovam > 0 || erros.length > 0) {
  console.log(
    `\x1b[31m${reprovam} problema(s) grave(s) em ${telas.length} telas` +
      `${trabalho ? `; ${trabalho} moderado(s) para depois` : ''}.\x1b[0m\n`,
  )
  process.exit(1)
}
console.log(
  `\x1b[32m${telas.length} telas sem problema grave de acessibilidade` +
    `${trabalho ? ` (${trabalho} moderado(s) anotado(s))` : ''}.\x1b[0m\n`,
)
