/**
 * Verificação de produção: roda o fluxo do aluno e do professor contra o app
 * publicado na Vercel, com o Supabase e as funções de verdade — sem tocar na
 * turma real nem lançar nada no SIGA.
 *
 *   SENHA_PROFESSOR=... node e2e/producao.mjs          # roda e limpa tudo
 *   SENHA_PROFESSOR=... node e2e/producao.mjs --manter # deixa para inspecionar
 *
 * Cria uma turma e um aluno descartáveis (matrícula 9999...), envia uma redação
 * com foto, corrige à mão (sem IA), confere a devolutiva do aluno e para na
 * confirmação do lançamento no SIGA — o botão de confirmar não é clicado.
 */
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { carregarEnv } from '../scripts/_env.mjs'

carregarEnv()

const WEB = process.env.APP_URL ?? 'https://estatistica-biocientistas-avaliacao.vercel.app'
const MANTER = process.argv.includes('--manter')
const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const PASTA = join(raiz, 'e2e', 'resultados')

const PROFESSOR = { email: process.env.EMAIL_PROFESSOR ?? 'marcio.souza@ufjf.br', senha: process.env.SENHA_PROFESSOR }
const SUFIXO = String(Date.now()).slice(-6)
const TURMA = { nome: `TESTE-PROD · ${SUFIXO}`, codigo: `TESTEPROD-${SUFIXO}`, periodo: '2026/3' }
const ALUNO = {
  matricula: `9999${SUFIXO}`,
  nome: 'Aluno Teste Produção',
  email: `producao.${SUFIXO}@estudante.ufjf.br`,
  senha: 'Teste12345',
}

const TEXTO = `A sensibilidade de um teste diagnóstico é a proporção de pessoas doentes que o teste
identifica como positivas, ou seja, os verdadeiros positivos entre todos os doentes. A
especificidade é a proporção de pessoas sadias que o teste identifica como negativas, então mede a
capacidade de descartar a doença em quem não tem. Um teste muito sensível erra pouco ao excluir a
doença e por isso serve para triagem; um teste muito específico confirma o diagnóstico. O valor
preditivo positivo depende da prevalência: quando a doença é rara na população, mesmo um teste
específico produz muitos falsos positivos. Por isso a triagem deve ser feita em grupos com maior
suspeita e o resultado sempre interpretado junto com o contexto clínico.`

if (!PROFESSOR.senha) {
  console.error('\n✗ Defina SENHA_PROFESSOR.\n')
  process.exit(1)
}

await mkdir(PASTA, { recursive: true })

// ---------------------------------------------------------------------------

function passo(texto) {
  console.log(`  ▸ ${texto}`)
}

async function entrar(pagina, email, senha) {
  await pagina.goto(`${WEB}/entrar`, { waitUntil: 'networkidle' })
  await pagina.getByLabel('E-mail').fill(email)
  await pagina.getByLabel('Senha').fill(senha)
  await pagina.getByRole('button', { name: 'Entrar' }).click()
  await pagina.waitForURL((url) => !url.pathname.startsWith('/entrar'), { timeout: 40000 })
}

async function sair(pagina) {
  await pagina.goto(`${WEB}/`, { waitUntil: 'networkidle' })
  const sairBtn = pagina.getByRole('button', { name: /Sair/i })
  if (await sairBtn.count()) {
    await sairBtn.first().click()
    await pagina.waitForURL(/\/entrar/, { timeout: 20000 })
    return
  }
  await pagina.goto(`${WEB}/perfil`, { waitUntil: 'networkidle' })
  await pagina.getByRole('button', { name: /Sair/i }).first().click()
  await pagina.waitForURL(/\/entrar/, { timeout: 20000 })
}

async function escolherTurma(pagina, trecho) {
  const porRotulo = pagina.getByLabel('Turma').first()
  const select = (await porRotulo.count()) ? porRotulo : pagina.locator('select').first()
  const opcao = select.locator('option', { hasText: trecho }).first()
  const valor = await opcao.getAttribute('value')
  if (!valor) throw new Error(`A turma "${trecho}" não apareceu na lista.`)
  await select.selectOption(valor)
}

async function foto(pagina, nome) {
  await pagina.screenshot({ path: join(PASTA, `${nome}.png`), fullPage: true })
}

async function paginaEscaneada(navegador) {
  const pagina = await navegador.newPage({ viewport: { width: 900, height: 1200 } })
  await pagina.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#f6f2e7;font-family:'Segoe Script','Comic Sans MS',cursive;color:#1f2a44}
    .folha{width:820px;height:1120px;padding:60px 70px;box-sizing:border-box;
           background:repeating-linear-gradient(#f6f2e7 0 44px,#c9d3e0 44px 45px)}
    p{font-size:19px;line-height:45px;margin:0}
  </style></head><body><div class="folha">
    <p>${TEXTO.split('\n').map((l) => l.trim()).filter(Boolean).join('</p><p>')}</p>
  </div></body></html>`)
  const bytes = await pagina.screenshot({ type: 'png' })
  await pagina.close()
  return bytes
}

// ---------------------------------------------------------------------------

let turmaId = null
let idAvaliacao = null
let avaliacaoDaTurma = false

const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  viewport: { width: 390, height: 900 },
  deviceScaleFactor: 2,
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
})
const page = await contexto.newPage()
page.setDefaultTimeout(45000)

try {
  passo('1/10 professor entra')
  await entrar(page, PROFESSOR.email, PROFESSOR.senha)
  await page.getByText('Painel do professor').first().waitFor()

  passo('2/10 cria turma descartável')
  await page.goto(`${WEB}/prof/alunos`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Nova turma' }).click()
  await page.getByLabel('Nome da turma').fill(TURMA.nome)
  await page.getByLabel('Código no SIGA').fill(TURMA.codigo)
  await page.getByLabel('Período').fill(TURMA.periodo)
  await page.getByRole('button', { name: 'Criar turma' }).click()
  await page.getByText('Turma criada').waitFor()

  passo('3/10 importa a lista sem e-mail')
  await escolherTurma(page, TURMA.nome)
  const caixaEmail = page.getByRole('checkbox', { name: /Exigir o e-mail na lista/ })
  if (await caixaEmail.isChecked()) {
    await caixaEmail.uncheck()
    await page.getByText('Agora a lista pode vir só com matrícula e nome').waitFor({ timeout: 20000 })
  }
  await page.locator('textarea').fill(`${ALUNO.matricula};${ALUNO.nome}`)
  await page.getByRole('button', { name: 'Conferir e importar' }).click()
  await page.getByText(/incluíd/).first().waitFor({ timeout: 30000 })
  await page.getByText('e-mail ainda não informado').first().waitFor()
  await foto(page, 'prod-01-lista')

  passo('4/10 publica avaliação')
  await page.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
  await escolherTurma(page, TURMA.nome)
  await page.getByLabel('Título').fill(`Teste de produção ${SUFIXO}`)
  await page.locator('#tema').fill('Explique o que é sensibilidade, especificidade e valor preditivo positivo.')
  await page
    .locator('#instrucoes')
    .fill('Escreva de 15 a 25 linhas, à mão, em folha A4. Entregue foto legível da folha inteira.')
  await page.getByLabel('Valor total (pontos)').fill('10')
  // a rubrica que vem na tela soma 20: redistribui para o valor que definimos
  await page.getByRole('button', { name: /Distribuir 10 pts/ }).click()
  await page.getByRole('button', { name: 'Publicar avaliação' }).click()
  await page.waitForURL(/\/prof\/avaliacoes\/[0-9a-f-]{36}$/)
  idAvaliacao = page.url().split('/').pop()
  avaliacaoDaTurma = true
  const urlTurma = new URL(page.url())
  turmaId = urlTurma.searchParams.get('turma')
  await page.getByText('Nenhuma redação enviada ainda').waitFor()
  await foto(page, 'prod-02-avaliacao')

  passo('5/10 aluno se cadastra')
  await sair(page)
  await page.goto(`${WEB}/cadastrar`, { waitUntil: 'networkidle' })
  await escolherTurma(page, TURMA.nome)
  await page.getByLabel('Nome completo').fill(ALUNO.nome)
  await page.getByLabel('Matrícula', { exact: true }).fill(ALUNO.matricula)
  await page.getByLabel('E-mail institucional').fill(ALUNO.email)
  await page.getByLabel('Curso').fill('Ciências Biológicas')
  await page.getByLabel('Senha', { exact: true }).fill(ALUNO.senha)
  await page.getByLabel('Repita a senha').fill(ALUNO.senha)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Criar conta' }).click()
  await page.getByText(new RegExp(`Teste de produção ${SUFIXO}`)).first().waitFor({ timeout: 40000 })
  await foto(page, 'prod-03-aluno-inicio')

  passo('6/10 aluno fotografa e envia (OCR desligado → digita o texto)')
  await page.getByText(new RegExp(`Teste de produção ${SUFIXO}`)).first().click()
  await page.getByRole('button', { name: /Fotografar minha redação/ }).click()
  await page.waitForURL(/\/enviar$/)
  const arquivo = join(PASTA, 'prod-redacao.png')
  await writeFile(arquivo, await paginaEscaneada(navegador))
  await page.locator('input[type=file]').first().setInputFiles(arquivo)
  await page.getByRole('button', { name: 'Usar esta foto' }).click()
  await page.getByText('Transcrição digitada').waitFor({ timeout: 40000 })
  await page.getByText(/transcrição automática ainda não está configurada/).waitFor()
  await page.getByLabel('Texto da sua redação').fill(TEXTO)
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Enviar redação' }).click()
  await page.getByText('Redação enviada').waitFor({ timeout: 40000 })
  await foto(page, 'prod-04-enviada')

  passo('7/10 professor corrige à mão e aprova')
  await sair(page)
  await entrar(page, PROFESSOR.email, PROFESSOR.senha)
  await page.goto(`${WEB}/prof/avaliacoes/${idAvaliacao}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: new RegExp(ALUNO.nome) }).click()
  await page.waitForURL(/\/revisao\//)
  await page.getByRole('button', { name: 'Corrigir manualmente' }).click()
  await page.getByText('Nota por critério').waitFor({ timeout: 40000 })
  const notas = [3, 2, 1, 1] // soma 7 de 10
  const camposNota = page.locator('input[type=number]')
  const quantos = Math.min(await camposNota.count(), notas.length)
  for (let i = 0; i < quantos; i++) await camposNota.nth(i).fill(String(notas[i]))
  await page.getByRole('button', { name: /liberar para o aluno|Salvar ajustes e liberar/ }).click()
  await page.getByText('Revisão salva').waitFor({ timeout: 30000 })
  await foto(page, 'prod-05-revisao')

  passo('8/10 aluno vê a devolutiva')
  await sair(page)
  await entrar(page, ALUNO.email, ALUNO.senha)
  await page.getByText(new RegExp(`Teste de produção ${SUFIXO}`)).first().waitFor({ timeout: 40000 })
  await page.goto(`${WEB}/avaliacoes/${idAvaliacao}/devolutiva`, { waitUntil: 'networkidle' })
  await page.getByText(/Correção feita pelo professor/).first().waitFor({ timeout: 40000 })
  const textoDevolutiva = await page.locator('body').innerText()
  if (!/7([.,]0)?/.test(textoDevolutiva)) throw new Error('A devolutiva não mostra a nota 7.')
  await foto(page, 'prod-06-devolutiva')

  passo('9/10 professor abre o lançamento no SIGA e cancela')
  await sair(page)
  await entrar(page, PROFESSOR.email, PROFESSOR.senha)
  await page.goto(`${WEB}/prof/avaliacoes/${idAvaliacao}`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Lançar .* no SIGA/ }).click()
  await page.getByText(/Confirmar .* lançamento/).waitFor({ timeout: 20000 })
  const confirmacao = await page.locator('body').innerText()
  if (!confirmacao.includes(TURMA.codigo)) {
    throw new Error(`A confirmação não cita a turma ${TURMA.codigo} do SIGA.`)
  }
  await foto(page, 'prod-07-confirmacao-siga')
  await page.getByRole('button', { name: /Cancelar/ }).click()
  console.log('      confirmação conferida e cancelada — nada foi lançado no SIGA')

  passo('10/10 professor remove a turma pela tela')
  await page.goto(`${WEB}/prof/alunos`, { waitUntil: 'networkidle' })
  await escolherTurma(page, TURMA.nome)
  await page.getByRole('button', { name: /Remover esta turma/ }).click()
  await page.getByText('Isto não pode ser desfeito').waitFor()
  await page.getByLabel(`Digite ${TURMA.codigo} para confirmar`).fill(TURMA.codigo)
  await page.getByRole('button', { name: /Remover turma definitivamente/ }).click()
  await page.getByText(/Turma .* removida/).waitFor({ timeout: 30000 })
  turmaId = null

  console.log('\n✓ Produção verificada de ponta a ponta (sem lançar nota no SIGA)')
  console.log(`  turma ${TURMA.codigo} · aluno ${ALUNO.matricula} · avaliação ${idAvaliacao}`)
} catch (erro) {
  console.error(`\n✗ ${erro.message}`)
  await foto(page, 'prod-erro').catch(() => {})
  process.exitCode = 1
} finally {
  if (MANTER) {
    console.log(`\n  (mantido para inspeção: turma ${TURMA.codigo}, aluno ${ALUNO.email}, avaliação ${idAvaliacao})`)
  } else {
    console.log('\n  limpando dados de teste…')
    await limpar()
  }
  await navegador.close()
}

// ---------------------------------------------------------------------------

async function limpar() {
  const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) {
    console.error('  ⚠ Sem SUPABASE_URL/SERVICE_ROLE_KEY: a turma de teste ficou no banco.')
    return
  }
  const cabecalhos = { apikey: chave, Authorization: `Bearer ${chave}`, Prefer: 'return=minimal' }

  // além da turma desta rodada, varre sobras de rodadas anteriores (prefixos de teste)
  const turmas = await (
    await fetch(`${url}/rest/v1/turmas?or=(codigo_siga.eq.${encodeURIComponent(TURMA.codigo)},codigo_siga.like.TESTEPROD-*,codigo_siga.like.APAGAR*)&select=id,codigo_siga`, { headers: cabecalhos })
  ).json()
  if (!Array.isArray(turmas)) {
    console.error('  ⚠ não consegui listar a turma de teste:', JSON.stringify(turmas).slice(0, 160))
  }
  for (const turma of Array.isArray(turmas) ? turmas : []) {
    const resposta = await fetch(`${url}/rest/v1/turmas?id=eq.${turma.id}`, { method: 'DELETE', headers: cabecalhos })
    if (!resposta.ok) {
      console.error(`  ⚠ falhou apagar a turma ${turma.codigo_siga}: ${resposta.status} ${(await resposta.text()).slice(0, 160)}`)
    } else {
      console.log(`  turma de teste ${turma.codigo_siga} removida`)
    }
  }

  const usuarios = await fetch(`${url}/auth/v1/admin/users?per_page=200`, { headers: cabecalhos }).then((r) => r.json())
  const aluno = (usuarios.users ?? []).find((u) => u.email === ALUNO.email)
  if (aluno) {
    await fetch(`${url}/auth/v1/admin/users/${aluno.id}`, { method: 'DELETE', headers: cabecalhos })
  }

  const restos = await (
    await fetch(`${url}/rest/v1/avaliacoes?select=id,turma:turmas(codigo_siga)`, { headers: cabecalhos })
  ).json()
  console.log(`  turmas de teste removidas · contas restantes: ${(usuarios.users ?? []).length - (aluno ? 1 : 0)}`)
  console.log(`  avaliações no banco agora: ${Array.isArray(restos) ? restos.length : '?'}`)
}
