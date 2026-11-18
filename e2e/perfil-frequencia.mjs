#!/usr/bin/env node
/**
 * Fluxo do perfil e da chamada, no modo demonstração.
 *
 * Cobre o que o teste de unidade não alcança:
 *   1. remover a foto, voltar às iniciais e enviar uma foto nova;
 *   2. refazer o teste de personalidade até o resultado e conferir que ele
 *      sobrevive ao recarregamento;
 *   3. o professor marca uma falta, salva a chamada e, ao voltar à mesma data,
 *      vê o registro em vez de uma lista em branco.
 *
 * Uso: pnpm e2e:perfil
 */
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { chromium } from 'playwright'

const raiz = join(import.meta.dirname, '..')
const PORTA = 3219
const WEB = `http://127.0.0.1:${PORTA}`
const SENHA = 'demo12345'
const aluno = { email: 'aluno@demo.local', senha: SENHA }
const professor = { email: 'professor@demo.local', senha: SENHA }

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
for (let i = 0; i < 80; i += 1) {
  try {
    if ((await fetch(WEB)).ok) break
  } catch {
    /* ainda subindo */
  }
  await new Promise((r) => setTimeout(r, 250))
}

const navegador = await chromium.launch()
const pagina = await navegador.newPage({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
const erros = []
pagina.on('pageerror', (e) => erros.push(e.message))

async function entrar(conta) {
  await pagina.goto(WEB, { waitUntil: 'networkidle' })
  await pagina.getByLabel('E-mail').fill(conta.email)
  await pagina.getByLabel('Senha', { exact: true }).fill(conta.senha)
  await pagina.getByRole('button', { name: /Entrar/ }).click()
  await pagina.waitForTimeout(1200)
}

let falhas = 0
function conferir(nome, condicao, detalhe) {
  if (condicao) console.log(`  \x1b[32m✓\x1b[0m ${nome}`)
  else {
    falhas += 1
    console.log(`  \x1b[31m✗\x1b[0m ${nome}${detalhe ? ` — ${detalhe}` : ''}`)
  }
}

console.log('\n  Perfil e frequência · modo demonstração\n')

await entrar(aluno)
await pagina.goto(`${WEB}/perfil`, { waitUntil: 'networkidle' })
await pagina.getByText('Foto do perfil', { exact: true }).waitFor({ timeout: 15000 })
conferir('o perfil mostra a foto e o resultado que vieram da demonstração', await pagina.getByText('ENFJ-A').first().isVisible())

await pagina.getByRole('button', { name: 'Remover', exact: true }).click()
await pagina.getByText('Foto removida.').waitFor({ timeout: 15000 })
conferir('remover a foto volta às iniciais', await pagina.getByText('AF', { exact: true }).first().isVisible())

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
  'base64',
)
await pagina.setInputFiles('input[aria-label="Escolher foto do perfil"]', {
  name: 'avatar.png',
  mimeType: 'image/png',
  buffer: png,
})
await pagina.getByText('Foto atualizada.').waitFor({ timeout: 15000 })
conferir(
  'a foto nova aparece no avatar',
  await pagina.locator('img[alt="Foto de Ana Beatriz Lima Ferreira"]').first().isVisible(),
)
await pagina.reload({ waitUntil: 'networkidle' })
conferir(
  'a foto continua depois de recarregar',
  await pagina.locator('img[alt="Foto de Ana Beatriz Lima Ferreira"]').first().isVisible(),
)

// Refaz o teste escolhendo o polo direito em todas as afirmações: ISTP-T.
await pagina.getByRole('button', { name: /Refazer o teste/ }).click()
await pagina.getByText(/Pergunta 1 de 30/).waitFor({ timeout: 15000 })
// Afirmações 1–5, 11–15 e 21–25 apontam para o polo esquerdo; as demais,
// para o direito. Para chegar ao polo direito em todos os eixos, discorda-se
// das primeiras e concorda-se com as segundas — responder tudo igual daria 50%.
const ladoEsquerdo = new Set([1, 2, 3, 4, 5, 11, 12, 13, 14, 15, 21, 22, 23, 24, 25])
for (let i = 1; i <= 30; i += 1) {
  await pagina.getByText(ladoEsquerdo.has(i) ? 'Discordo totalmente' : 'Concordo totalmente', { exact: true }).click()
  if (i < 30) {
    await pagina.getByRole('button', { name: 'Próxima' }).click()
    await pagina.getByText(`Pergunta ${i + 1} de 30`).waitFor({ timeout: 15000 })
  } else {
    await pagina.getByRole('button', { name: 'Ver meu resultado' }).click()
  }
}
await pagina.getByText('ISTP-T').first().waitFor({ timeout: 20000 })
conferir('o resultado do teste novo é calculado e exibido', await pagina.getByText('ISTP-T').first().isVisible())
await pagina.reload({ waitUntil: 'networkidle' })
conferir('o resultado continua depois de recarregar', await pagina.getByText('ISTP-T').first().isVisible())

await pagina.evaluate(() => {
  localStorage.clear()
  sessionStorage.clear()
})
await entrar(professor)
await pagina.goto(`${WEB}/prof/frequencia`, { waitUntil: 'networkidle' })
await pagina.getByText('Lista de chamada').waitFor({ timeout: 15000 })
conferir('a chamada lista os alunos', (await pagina.getByText('Ana Beatriz Lima Ferreira').count()) > 0)
conferir('a chamada mostra a personalidade que o aluno acabou de salvar', (await pagina.getByText('ISTP-T').count()) > 0)

const linhaDaAna = pagina.locator('li').filter({ hasText: 'Ana Beatriz Lima Ferreira' })
await linhaDaAna.locator('label').click()
await pagina.getByText(/3 presente\(s\) · 1 ausente\(s\)/).waitFor({ timeout: 15000 })
conferir('marcar falta atualiza o resumo antes de salvar', await pagina.getByText(/ainda não salva/).isVisible())

await pagina.getByRole('button', { name: 'Salvar chamada' }).click()
await pagina.getByText(/Chamada de .* salva: 3 presente\(s\), 1 ausente\(s\)\./).waitFor({ timeout: 15000 })
conferir('a chamada é salva', true)

await pagina.reload({ waitUntil: 'networkidle' })
await pagina.getByText(/chamada registrada nesta data/).waitFor({ timeout: 15000 })
conferir('a falta continua depois de recarregar', await pagina.getByText(/3 presente\(s\) · 1 ausente\(s\)/).isVisible())
conferir('a linha da Ana mostra Ausente', (await linhaDaAna.locator('label').innerText()).includes('Ausente'))
conferir('o checkbox da Ana está desmarcado', !(await pagina.getByLabel('Presença de Ana Beatriz Lima Ferreira').isChecked()))

await navegador.close()
servidor.kill('SIGTERM')
build.kill('SIGTERM')

if (erros.length) {
  falhas += 1
  console.log(`\n  \x1b[31m${erros.length} erro(s) de JavaScript:\x1b[0m`)
  for (const e of [...new Set(erros)].slice(0, 5)) console.log(`      ${e}`)
}

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) falharam\x1b[0m\n`)
  process.exit(1)
}
console.log('  \x1b[32m✓ perfil, teste e chamada funcionando de ponta a ponta\x1b[0m\n')
