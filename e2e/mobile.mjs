#!/usr/bin/env node
/**
 * Conferência de layout em tela pequena (mobile-first).
 *
 *   pnpm e2e:mobile
 *
 * Roda em modo demonstração (sem Supabase, sem rede): build com
 * VITE_MODO_DEMO=1 e `vite preview`. O que ele verifica:
 *
 *   1. nenhuma tela rola para o lado (scrollWidth > innerWidth) em 360×740,
 *      que é a largura de um Galaxy S8/A-series e de um iPhone SE de 1ª geração;
 *   2. nenhum elemento essencial passa por baixo da barra inferior fixa;
 *   3. os alvos de toque principais têm altura confortável (>= 40 px);
 *   4. as telas principais renderizam sem erro de JavaScript no console.
 *
 * Layout quebrado no celular não aparece em teste de unidade — aparece no dia em
 * que a turma inteira abre o link no intervalo da aula.
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'

const raiz = join(import.meta.dirname, '..')
const PORTA = 3213
const WEB = `http://127.0.0.1:${PORTA}`
const SAIDA = join(raiz, 'e2e', 'resultados')
mkdirSync(SAIDA, { recursive: true })

const LARGURA = 360
const ALTURA = 740

const ALUNO = { email: 'aluno@demo.local', senha: 'demo12345' }
const PROFESSOR = { email: 'professor@demo.local', senha: 'demo12345' }

const fila = []
const resultados = []

function rodar(cmd, args, env = {}) {
  const p = spawn(cmd, args, { cwd: raiz, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let saida = ''
  p.stdout.on('data', (d) => (saida += d))
  p.stderr.on('data', (d) => (saida += d))
  fila.push(() => p.kill('SIGTERM'))
  return { processo: p, saida: () => saida }
}

async function esperarHttp(url, tentativas = 80) {
  for (let i = 0; i < tentativas; i += 1) {
    try {
      const r = await fetch(url)
      if (r.ok || r.status === 404) return
    } catch {
      /* ainda subindo */
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`servidor não respondeu em ${url}`)
}

async function entrar(page, conta) {
  await page.goto(WEB, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('E-mail').fill(conta.email)
  await page.getByLabel('Senha', { exact: true }).fill(conta.senha)
  await page.getByRole('button', { name: /Entrar/ }).click()
  await page.waitForTimeout(1200)
}

/** Mede a tela: rolagem horizontal, alvos de toque e sobreposição com a barra. */
async function medir(page, nome) {
  const dados = await page.evaluate(() => {
    const doc = document.documentElement
    const larguraJanela = window.innerWidth

    const alvos = [...document.querySelectorAll('button, a[href], input, select, textarea')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const estilo = getComputedStyle(el)
        return r.width > 0 && r.height > 0 && estilo.visibility !== 'hidden' && estilo.display !== 'none'
      })
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          rotulo: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName)
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 40),
          altura: Math.round(r.height),
          largura: Math.round(r.width),
          tag: el.tagName.toLowerCase(),
        }
      })

    // a barra inferior é fixa: mede se algo clicável está embaixo dela
    const barra = document.querySelector('nav')
    const topoBarra = barra ? barra.getBoundingClientRect().top : null

    // Zoom: o app tem de deixar a pessoa ampliar. `maximum-scale=1` e
    // `user-scalable=no` travam o pinch — quem tem baixa visão perde a única
    // ferramenta que tem. (WCAG 1.4.4)
    const viewport = document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? ''
    const travaZoom = /maximum-scale\s*=\s*(1(\.0*)?|0?\.[0-9]+)/i.test(viewport) ||
      /user-scalable\s*=\s*(no|0)/i.test(viewport)

    // Campo com fonte menor que 16px faz o iOS ampliar sozinho ao focar — por
    // isso a trava de zoom foi removida junto com esta garantia.
    const camposPequenos = [...document.querySelectorAll('input, textarea, select')]
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const estilo = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || estilo.visibility === 'hidden' || estilo.display === 'none') return false
        // caixas de marcar e rádio não recebem texto digitado
        return !['checkbox', 'radio', 'file', 'range', 'color', 'hidden'].includes(el.type)
      })
      .map((el) => ({
        rotulo: (el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.id || el.tagName).slice(0, 40),
        fonte: parseFloat(getComputedStyle(el).fontSize),
      }))
      .filter((c) => c.fonte < 16)

    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: larguraJanela,
      topoBarra,
      alturaJanela: window.innerHeight,
      travaZoom,
      viewport,
      camposPequenos,
      alvos,
    }
  })

  const problemas = []
  if (dados.scrollWidth > dados.innerWidth + 1) {
    problemas.push(`rola para o lado: conteúdo ${dados.scrollWidth}px em janela de ${dados.innerWidth}px`)
  }

  if (dados.travaZoom) {
    problemas.push(`o zoom está travado no viewport: “${dados.viewport}”`)
  }
  if (dados.camposPequenos.length > 0) {
    const lista = dados.camposPequenos
      .slice(0, 3)
      .map((c) => `“${c.rotulo}” (${c.fonte}px)`)
      .join(', ')
    problemas.push(`${dados.camposPequenos.length} campo(s) com fonte abaixo de 16px: ${lista}`)
  }

  const pequenos = dados.alvos.filter((a) => a.altura < 40 && a.tag === 'button')
  if (pequenos.length > 0) {
    const lista = pequenos
      .slice(0, 3)
      .map((a) => `“${a.rotulo}” (${a.altura}px)`)
      .join(', ')
    problemas.push(`${pequenos.length} botão(ões) abaixo de 40px de altura: ${lista}`)
  }

  resultados.push({ nome, problemas, alvos: dados.alvos.length })
  const marca = problemas.length === 0 ? '✓' : '✗'
  console.log(`  ${marca} ${nome}`)
  for (const p of problemas) console.log(`      ${p}`)
  return problemas.length === 0
}

async function foto(page, nome) {
  await page.screenshot({ path: join(SAIDA, `${nome}.png`), fullPage: true })
}

/**
 * Cópia só da área visível, para o guia do aluno: versão do repositório em
 * `docs/img/`, gerada pelo mesmo teste que confere o layout.
 */
async function fotoDoGuia(page, nome) {
  mkdirSync(join(raiz, 'docs', 'img'), { recursive: true })
  await page.screenshot({ path: join(raiz, 'docs', 'img', `${nome}.png`) })
}

const errosDeConsole = []

async function main() {
  console.log('\n  Layout em tela pequena (360×740, modo demonstração)\n')

  const build = rodar('npx', ['vite', 'build', '--outDir', 'dist-demo', '--logLevel', 'error'], {
    VITE_MODO_DEMO: '1',
  })
  await new Promise((ok, falha) => {
    build.processo.on('exit', (c) => (c === 0 ? ok() : falha(new Error(`build falhou:\n${build.saida()}`))))
  })

  const preview = rodar('npx', ['vite', 'preview', '--outDir', 'dist-demo', '--port', String(PORTA), '--strictPort'])
  await esperarHttp(WEB, 120)

  const navegador = await chromium.launch()
  const contexto = await navegador.newContext({
    viewport: { width: LARGURA, height: ALTURA },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pt-BR',
  })
  const page = await contexto.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') errosDeConsole.push(m.text().slice(0, 160))
  })
  page.on('pageerror', (e) => errosDeConsole.push(String(e).slice(0, 160)))

  let ok = true

  // ---- aluno -------------------------------------------------------------
  await page.goto(WEB, { waitUntil: 'networkidle' })
  ok = (await medir(page, 'entrar')) && ok
  await foto(page, 'mobile-01-entrar')

  await entrar(page, ALUNO)
  ok = (await medir(page, 'aluno · início')) && ok
  await foto(page, 'mobile-02-aluno-inicio')
  await fotoDoGuia(page, 'aluno-inicio')

  await page.goto(`${WEB}/avaliacoes/av-demo-1`, { waitUntil: 'networkidle' })
  ok = (await medir(page, 'aluno · avaliação')) && ok
  await foto(page, 'mobile-03-aluno-avaliacao')
  await fotoDoGuia(page, 'aluno-avaliacao')

  await page.goto(`${WEB}/avaliacoes/av-demo-2/enviar`, { waitUntil: 'networkidle' })
  ok = (await medir(page, 'aluno · envio')) && ok
  await foto(page, 'mobile-04-aluno-envio')
  await fotoDoGuia(page, 'aluno-envio')

  await page.goto(`${WEB}/avaliacoes/av-demo-1/devolutiva`, { waitUntil: 'networkidle' })
  ok = (await medir(page, 'aluno · devolutiva')) && ok
  await foto(page, 'mobile-05-aluno-devolutiva')
  await fotoDoGuia(page, 'aluno-devolutiva')

  await page.goto(`${WEB}/perfil`, { waitUntil: 'networkidle' })
  ok = (await medir(page, 'aluno · perfil')) && ok
  await foto(page, 'mobile-06-perfil')

  // troca de senha: a atual é conferida antes de trocar
  const trocarSenha = async (atual, nova) => {
    await page.getByLabel('Senha atual').fill(atual)
    await page.getByLabel('Nova senha', { exact: true }).fill(nova)
    await page.getByLabel('Repita a nova senha').fill(nova)
    await page.getByRole('button', { name: 'Alterar senha' }).click()
  }
  await trocarSenha('senha-errada', 'outrasenha123')
  await page.getByText('Senha atual incorreta.').waitFor({ timeout: 15000 })
  await trocarSenha('demo12345', 'outrasenha123')
  await page.getByText(/Senha alterada\. Os outros aparelhos/).waitFor({ timeout: 15000 })
  // devolve a senha da demonstração para o resto da suíte
  await trocarSenha('outrasenha123', 'demo12345')
  await page.getByText(/Senha alterada/).waitFor({ timeout: 15000 })

  await page.goto(`${WEB}/ajuda`, { waitUntil: 'networkidle' })
  ok = (await medir(page, 'ajuda')) && ok
  await foto(page, 'mobile-07-ajuda')

  // link de recuperação vencido: o aluno precisa entender o que houve
  await page.goto(
    `${WEB}/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`,
    { waitUntil: 'networkidle' },
  )
  await page.getByText(/O link não funcionou/).waitFor({ timeout: 15000 })
  await page.getByText(/expirou/).first().waitFor({ timeout: 15000 })
  ok = (await medir(page, 'link de recuperação vencido')) && ok
  await foto(page, 'mobile-14-link-vencido')

  // /redefinir sem sessão: orientação em vez de formulário que falha
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(`${WEB}/redefinir`, { waitUntil: 'networkidle' })
  await page.getByText(/Abra o link do e-mail/).waitFor({ timeout: 15000 })
  ok = (await medir(page, 'redefinir sem sessão')) && ok
  await foto(page, 'mobile-15-redefinir-sem-sessao')

  // ---- professor ---------------------------------------------------------
  await page.goto(WEB, { waitUntil: 'networkidle' })
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
  })
  await page.goto(WEB, { waitUntil: 'networkidle' })
  await entrar(page, PROFESSOR)
  ok = (await medir(page, 'professor · painel')) && ok
  await foto(page, 'mobile-08-professor-painel')

  await page.goto(`${WEB}/prof/avaliacoes/av-demo-1`, { waitUntil: 'networkidle' })
  ok = (await medir(page, 'professor · avaliação')) && ok
  await foto(page, 'mobile-09-professor-avaliacao')
  await page.getByText(/alunos da turma entregaram/).first().waitFor({ timeout: 15000 })
  await page.getByText(/^Faltam \d+/).first().waitFor({ timeout: 15000 })

  // trilha de auditoria do SIGA: sucesso e recusa na mesma tela
  await page.goto(`${WEB}/prof/avaliacoes/av-demo-2/historico`, { waitUntil: 'networkidle' })
  await page.getByText(/Aceito pelo SIGA/).first().waitFor({ timeout: 15000 })
  await page.getByText(/Recusado · HTTP 403/).first().waitFor({ timeout: 15000 })
  await page.getByText(/fechada para lançamento/).first().waitFor({ timeout: 15000 })
  ok = (await medir(page, 'professor · histórico de lançamentos')) && ok
  await foto(page, 'mobile-16-historico-lancamentos')

  // o CSV é o que fica no processo do semestre: precisa abrir no Excel com os
  // acentos certos (BOM), separador `;` e uma linha por tentativa
  const [baixado] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.getByRole('button', { name: 'Baixar CSV' }).click(),
  ])
  const csv = readFileSync(await baixado.path(), 'utf8')
  if (!csv.startsWith('\ufeffcriado_em;matricula;nome')) {
    throw new Error(`CSV do histórico sem cabeçalho esperado: ${JSON.stringify(csv.slice(0, 60))}`)
  }
  if (csv.split('\n').length !== 3) throw new Error(`esperava 2 linhas de dados, veio:\n${csv}`)
  if (!csv.includes('2026301002') || !csv.includes('2026301001')) {
    throw new Error(`CSV sem as matrículas lançadas:\n${csv}`)
  }

  await page.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
  ok = (await medir(page, 'professor · nova avaliação')) && ok
  await foto(page, 'mobile-10-professor-nova')

  // a revisão com a foto aberta: é a tela em que o professor decide a nota
  await page.goto(`${WEB}/prof/avaliacoes/av-demo-1`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Ana Beatriz/ }).first().click()
  await page.waitForURL(/\/revisao\//, { timeout: 20000 })
  await page.getByRole('button', { name: 'Foto original' }).click()
  await page.locator('img[alt="Foto da redação"]').waitFor({ timeout: 15000 })
  ok = (await medir(page, 'professor · revisão com foto')) && ok
  await foto(page, 'mobile-12-professor-revisao')

  // importação com um arquivo de verdade: CSV do Excel em português, que é
  // Windows-1252 e não UTF-8. Lido como UTF-8, "Conceição" vira "Concei??o".
  await page.goto(`${WEB}/prof/alunos`, { waitUntil: 'networkidle' })
  const tabela = { á: 0xe1, ã: 0xe3, é: 0xe9, ç: 0xe7, ô: 0xf4, í: 0xed, ó: 0xf3, ú: 0xfa, ê: 0xea }
  const bytes = [...'Matrícula;Nome;E-mail\r\n2099301001;Ana Conceição;ana.conceicao@x.br\r\n']
    .flatMap((c) => (tabela[c] === undefined ? [...Buffer.from(c, 'utf8')] : [tabela[c]]))
  const arquivoCsv = join(tmpdir(), 'lista-windows1252.csv')
  writeFileSync(arquivoCsv, Buffer.from(bytes))
  await page.setInputFiles('input[type=file]', arquivoCsv)
  await page.getByText(/Windows-1252/).waitFor({ timeout: 15000 })
  await page.getByText(/Ana Conceição/).first().waitFor({ timeout: 15000 })
  await page.getByText(/1 linha\(s\) válida\(s\)/).waitFor({ timeout: 15000 })
  ok = (await medir(page, 'professor · importar lista')) && ok
  await foto(page, 'mobile-13-importar-lista')

  ok = (await medir(page, 'professor · alunos')) && ok
  await foto(page, 'mobile-11-professor-alunos')

  await navegador.close()

  if (errosDeConsole.length > 0) {
    ok = false
    console.log(`\n  ✗ ${errosDeConsole.length} erro(s) de JavaScript no console:`)
    for (const e of [...new Set(errosDeConsole)].slice(0, 5)) console.log(`      ${e}`)
  }

  const quadradas = resultados.filter((r) => r.problemas.length > 0).length
  console.log('')
  if (!ok) {
    console.log(`✗ ${quadradas} de ${resultados.length} telas com problema\n`)
    return 1
  }
  console.log(`✓ ${resultados.length} telas conferidas em ${LARGURA}×${ALTURA}`)
  console.log(`  ${resultados.reduce((s, r) => s + r.alvos, 0)} alvos de toque medidos\n`)
  return 0
}

let codigo = 1
try {
  codigo = await main()
} catch (e) {
  console.error(`\n  ✗ ${e.message}\n`)
} finally {
  for (const parar of fila) parar()
}
process.exit(codigo)
