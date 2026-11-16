#!/usr/bin/env node
/**
 * Teste de ponta a ponta do fluxo completo, com Llama e SIGA simulados:
 *
 *   professor cria turma → importa lista → cria avaliação
 *   aluno se cadastra → fotografa → confere transcrição → envia
 *   professor corrige → revisa → aprova → lança no SIGA
 *   aluno vê a devolutiva com a nota
 *
 * Uso:
 *   pnpm test:e2e              # roda e apaga os dados de teste
 *   pnpm test:e2e --manter     # mantém os dados para inspecionar no navegador
 *
 * Requer SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (para limpar os dados).
 */
import { spawn, spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as espera } from 'node:timers/promises'
import { chromium } from 'playwright'
import { carregarEnv, raiz, supabaseRest } from '../scripts/_env.mjs'

const MANTER = process.argv.includes('--manter')
const WEB = 'http://127.0.0.1:3210'
const API = 'http://127.0.0.1:3101'
const PASTA = join(raiz, 'e2e', 'resultados')

const PROFESSOR = { email: process.env.EMAIL_PROFESSOR ?? 'marcio.souza@ufjf.br', senha: process.env.SENHA_PROFESSOR }
const ALUNO = {
  turma: 'TESTE-E2E · Turma',
  codigo: 'TESTEE2E-A',
  periodo: '2026/3',
  matricula: '2026999001GV', // com letras: é o formato do SIGA em GV
  nome: 'Aluno Teste E2E',
  email: 'aluno.e2e@estudante.ufjf.br',
  senha: 'Teste12345',
}

/** Aluno que só existe na lista por matrícula + nome (turma sem e-mail). */
const RECLAMANTE = {
  matricula: '2026999003GV',
  nome: 'Daniel Sem Email',
  email: 'daniel.claim@estudante.ufjf.br',
  senha: 'Teste12345',
}

carregarEnv()

if (!PROFESSOR.senha) {
  console.error('\n✗ Defina SENHA_PROFESSOR (e, se precisar, EMAIL_PROFESSOR) para rodar o teste.\n')
  console.error('  Exemplo: SENHA_PROFESSOR="sua-senha" pnpm test:e2e\n')
  process.exit(1)
}

// dev.mjs injeta a chave com prefixo VITE_; as secrets guardam sem prefixo
const anon = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
const servico = process.env.SUPABASE_SERVICE_ROLE_KEY
const urlSb = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')

const filhos = []
function iniciar(nome, comando, args, env = {}) {
  const processo = spawn(comando, args, {
    cwd: raiz,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  processo.stdout.on('data', (d) => {
    if (process.env.VERBOSE) process.stdout.write(`  [${nome}] ${d}`)
  })
  processo.stderr.on('data', (d) => process.stderr.write(`  [${nome}] ${d}`))
  processo.on('exit', (codigo) => {
    if (codigo && codigo !== 0 && codigo !== null) console.error(`  [${nome}] saiu com código ${codigo}`)
  })
  filhos.push(processo)
  return processo
}

async function esperarHttp(url, nome, tentativas = 120) {
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1500) })
      if (r.ok) return
    } catch {
      /* ainda subindo */
    }
    await espera(500)
  }
  throw new Error(`O serviço ${nome} não respondeu em ${url}`)
}

function encerrar() {
  for (const f of filhos) {
    try {
      f.kill('SIGTERM')
    } catch {
      /* já morreu */
    }
  }
}

// Instante em que a rodada começou: a auditoria é conferida a partir daqui.
const inicioDaRodada = new Date().toISOString()

// ---------------------------------------------------------------------------
// Limpeza dos dados de teste (idempotente)
// ---------------------------------------------------------------------------

async function limpar() {
  if (!urlSb || !servico) return

  // 0. a auditoria vem antes de tudo: apagar a conta do aluno derruba o perfil,
  // as submissões e as correções em cascata, e aí não haveria mais como achar
  // (nem apagar) os registros de auditoria que apontam para elas.
  const turmasAntes = await supabaseRest(`turmas?codigo_siga=eq.${ALUNO.codigo}&select=id`)
  for (const turma of turmasAntes ?? []) {
    const avaliacoesAntes = await supabaseRest(`avaliacoes?turma_id=eq.${turma.id}&select=id`)
    for (const av of avaliacoesAntes ?? []) {
      await supabaseRest(`auditoria?entidade_id=eq.${av.id}`, { metodo: 'DELETE' }).catch(() => {})
      const subsAntes = await supabaseRest(`submissoes?avaliacao_id=eq.${av.id}&select=id`)
      for (const s of subsAntes ?? []) {
        await supabaseRest(`auditoria?entidade_id=eq.${s.id}`, { metodo: 'DELETE' }).catch(() => {})
        const corsAntes = await supabaseRest(`correcoes?submissao_id=eq.${s.id}&select=id`)
        for (const c of corsAntes ?? []) {
          await supabaseRest(`auditoria?entidade_id=eq.${c.id}`, { metodo: 'DELETE' }).catch(() => {})
        }
      }
    }
  }

  // 1. remove as contas de teste (o perfil cai junto e libera a FK da turma)
  const resposta = await fetch(`${urlSb}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: servico, Authorization: `Bearer ${servico}` },
  })
  if (resposta.ok) {
    const dados = await resposta.json()
    for (const u of dados.users ?? []) {
      const email = (u.email ?? '').toLowerCase()
      if (email === ALUNO.email || email === RECLAMANTE.email || email === 'segunda.e2e@estudante.ufjf.br') {
        await fetch(`${urlSb}/auth/v1/admin/users/${u.id}`, {
          method: 'DELETE',
          headers: { apikey: servico, Authorization: `Bearer ${servico}` },
        })
      }
    }
  }
  await supabaseRest(`profiles?email=eq.${encodeURIComponent(ALUNO.email)}`, { metodo: 'DELETE' }).catch(() => {})

  // 2. apaga turma, avaliações, submissões, correções e lançamentos
  const turmas = await supabaseRest(`turmas?codigo_siga=eq.${ALUNO.codigo}&select=id`)
  for (const turma of turmas ?? []) {
    const avaliacoes = await supabaseRest(`avaliacoes?turma_id=eq.${turma.id}&select=id`)
    for (const av of avaliacoes ?? []) {
      const submissoes = await supabaseRest(`submissoes?avaliacao_id=eq.${av.id}&select=id,aluno_id`)
      for (const s of submissoes ?? []) {
        await supabaseRest(`auditoria?entidade_id=eq.${s.id}`, { metodo: 'DELETE' }).catch(() => {})
        const correcoes = await supabaseRest(`correcoes?submissao_id=eq.${s.id}&select=id`)
        for (const c of correcoes ?? []) {
          await supabaseRest(`auditoria?entidade_id=eq.${c.id}`, { metodo: 'DELETE' }).catch(() => {})
        }
      }
      await supabaseRest(`auditoria?entidade_id=eq.${av.id}`, { metodo: 'DELETE' }).catch(() => {})
    }
    await supabaseRest(`lancamentos_siga?turma_siga=eq.${encodeURIComponent(ALUNO.codigo)}`, { metodo: 'DELETE' }).catch(
      () => {},
    )
    await supabaseRest(`turmas?id=eq.${turma.id}`, { metodo: 'DELETE' })
  }

  // 3. o Storage não segue o cascade do banco: remove as fotos que ficaram sem
  // submissão (o script só apaga o que não está em nenhum `foto_path`).
  const limpeza = spawnSync(process.execPath, ['scripts/limpar-fotos.mjs', '--apagar'], { encoding: 'utf8' })
  const apagadas = /(\d+) foto\(s\) apagada/.exec(limpeza.stdout ?? '')
  if (apagadas && apagadas[1] !== '0') console.log(`  · ${apagadas[1]} foto(s) de teste removida(s) do bucket`)
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

const capturas = []
async function foto(page, nome) {
  const arquivo = join(PASTA, `${nome}.png`)
  await page.screenshot({ path: arquivo, fullPage: true })
  capturas.push(arquivo)
  console.log(`  📸 ${nome}.png`)
}

/**
 * Escolhe a turma do teste pelo código, não pela posição: em produção existem
 * turmas reais na mesma lista e o índice 1 poderia ser a turma de verdade.
 */
async function escolherTurmaDeTeste(page) {
  const porRotulo = page.getByLabel('Turma').first()
  const select = (await porRotulo.count()) ? porRotulo : page.locator('select').first()
  // o rótulo da opção varia: "TESTE-E2E · Turma · 2026/3" no cadastro e
  // "TESTE-E2E · Turma · 2026/3 (TESTEE2E-A)" no painel — o nome casa nos dois
  const opcao = select.locator('option', { hasText: ALUNO.turma }).first()
  const valor = await opcao.getAttribute('value')
  if (!valor) throw new Error(`A turma ${ALUNO.turma} não apareceu na lista de turmas.`)
  await select.selectOption(valor)
}

async function entrar(page, email, senha) {
  await page.goto(`${WEB}/entrar`, { waitUntil: 'networkidle' })
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(senha)
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForFunction(() => !location.pathname.startsWith('/entrar'), null, { timeout: 20000 })
  await page.waitForLoadState('networkidle')
}

/**
 * Gera o link de recuperação de senha pela API de administração do Supabase.
 * É o mesmo link que o aluno recebe por e-mail — assim o teste percorre o
 * caminho real (link → /redefinir → senha nova) sem depender de caixa de e-mail.
 */
async function gerarLinkRecuperacao(email, redirecionarPara) {
  const r = await fetch(`${urlSb}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: servico,
      Authorization: `Bearer ${servico}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'recovery', email, redirect_to: redirecionarPara }),
  })
  const corpo = await r.json()
  if (!r.ok || !corpo.action_link) {
    throw new Error(`generate_link falhou: HTTP ${r.status} ${JSON.stringify(corpo).slice(0, 200)}`)
  }
  return corpo.action_link
}

async function sair(page) {
  await page.goto(`${WEB}/perfil`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Sair da conta' }).click()
  await page.waitForURL(/\/(entrar)?$/, { timeout: 15000 })
  await page.waitForLoadState('networkidle')
}

async function main() {
  await mkdir(PASTA, { recursive: true })
  await limpar()

  console.log('\n  ▸ subindo serviços simulados…')
  iniciar('mock', process.execPath, ['e2e/mock-servicos.mjs'])
  await esperarHttp('http://127.0.0.1:3199/health', 'mock', 40)
  // LLM_REAL=1 troca o modelo simulado pelo Ollama da máquina: serve para
  // conferir o prompt de verdade (JSON, notas dentro do máximo, devolutiva).
  const llmReal = process.env.LLM_REAL === '1'
  iniciar('dev', process.execPath, ['scripts/dev.mjs'], {
    LLM_BASE_URL: llmReal ? process.env.LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:3199/v1',
    LLM_MODEL: llmReal ? process.env.LLM_MODEL ?? 'llama3:latest' : 'mock-llama',
    LLM_API_KEY: llmReal ? process.env.LLM_API_KEY ?? 'ollama' : undefined,
    LLM_JSON_MODE: llmReal ? process.env.LLM_JSON_MODE ?? '1' : '0',
    VISION_PROVIDER: 'openai',
    VISION_BASE_URL: 'http://127.0.0.1:3199/v1',
    VISION_API_KEY: 'mock-vision',
    VISION_MODEL: 'mock-vision',
    SIGA_API_BASE: 'http://127.0.0.1:3199',
    SIGA_API_KEY: 'mock-siga',
  })
  await esperarHttp(`${API}/health`, 'API')
  await esperarHttp(`${WEB}/`, 'web')
  console.log('  ▸ serviços no ar\n')

  const navegador = await chromium.launch()
  const contexto = await navegador.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  })
  const page = await contexto.newPage()
  page.setDefaultTimeout(25000)

  try {
    // ---- 1. professor entra ------------------------------------------------
    console.log('  ▸ 1/26 professor entra')
    await entrar(page, PROFESSOR.email, PROFESSOR.senha)
    await page.getByText('Painel do professor').first().waitFor()
    // A lista de conferência do primeiro uso só aparece quando o professor está
    // começando. Como o banco é o de produção (com a turma real), ela pode não
    // estar na tela: o teste confere o essencial (as três colunas do painel).
    if (await page.getByText('Para começar').count()) {
      await page.getByText('Para começar').waitFor({ timeout: 15000 })
      await page.getByText('Criar a turma').waitFor()
    } else {
      await page.getByText('A CORRIGIR').waitFor()
      await page.getByText('A LANÇAR').waitFor()
    }
    // o diagnóstico do servidor chega depois: SIGA/IA/OCR deixam de dizer "Verificando"
    await page.getByText(/Notas podem ser lançadas direto na turma/).waitFor({ timeout: 15000 })
    await foto(page, '01-painel-professor')

    // ---- 2. cria turma e importa a lista ----------------------------------
    console.log('  ▸ 2/26 cria turma e importa alunos')
    await page.goto(`${WEB}/prof/alunos`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Nova turma' }).click()
    await page.getByLabel('Nome da turma').fill(ALUNO.turma)
    await page.getByLabel('Código no SIGA').fill(ALUNO.codigo)
    await page.getByLabel('Período').fill(ALUNO.periodo)
    await page.getByRole('button', { name: 'Criar turma' }).click()
    await page.getByText('Turma criada').waitFor()

    await page
      .locator('textarea')
      .fill(
        [
          'matricula;nome;email',
          `${ALUNO.matricula};${ALUNO.nome};${ALUNO.email}`,
          `2026999002;Segunda Aluna Teste;segunda.e2e@estudante.ufjf.br`,
        ].join('\n'),
      )
    await page.getByRole('button', { name: 'Conferir e importar' }).click()
    await page.getByText(/incluídos/).waitFor()
    await foto(page, '02-turma-importada')

    // ---- 3. cria a avaliação ----------------------------------------------
    console.log('  ▸ 3/26 cria avaliação')
    await page.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
    await escolherTurmaDeTeste(page)
    await page.getByLabel('Título').fill('Redação 1 — Testes diagnósticos')
    await page
      .locator('#tema')
      .fill(
        'Explique a diferença entre sensibilidade e especificidade de um teste diagnóstico e discuta como a prevalência afeta o valor preditivo positivo.',
      )
    await page
      .locator('#instrucoes')
      .fill('Escreva de 20 a 30 linhas, à mão, em folha A4. Use exemplos concretos e justifique o raciocínio.')
    await page.getByLabel('Capítulo do livro').selectOption({ index: 8 })
    // seletor das avaliações reais do SIGA (aqui, do mock)
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: /TVC 1/ }).click()
    const descricaoEscolhida = await page.getByLabel('Descrição da avaliação no SIGA').inputValue()
    if (descricaoEscolhida !== 'TVC 1') throw new Error(`seletor do SIGA preencheu "${descricaoEscolhida}"`)
    await page.getByLabel('Data no SIGA').fill('2026-11-20')
    await page.getByRole('button', { name: 'Publicar avaliação' }).click()
    await page.waitForURL(/\/prof\/avaliacoes\/[0-9a-f-]{36}$/)
    const idAvaliacao = page.url().split('/').pop()
    console.log(`     avaliação ${idAvaliacao}`)
    await page.getByText('Nenhuma redação enviada ainda').waitFor()
    await foto(page, '03-avaliacao-criada')

    // ---- 4. aluno se cadastra ---------------------------------------------
    console.log('  ▸ 4/26 aluno se cadastra')
    await sair(page)
    await page.goto(`${WEB}/cadastrar`, { waitUntil: 'networkidle' })
    await escolherTurmaDeTeste(page)
    await page.getByLabel('Nome completo').fill(ALUNO.nome)
    await page.getByLabel('Matrícula', { exact: true }).fill(ALUNO.matricula)
    await page.getByLabel('E-mail institucional').fill(ALUNO.email)
    await page.getByLabel('Curso').fill('Ciências Biológicas')
    await page.getByLabel('Senha', { exact: true }).fill(ALUNO.senha)
    await page.getByLabel('Repita a senha').fill(ALUNO.senha)

    // sem marcar o aviso de privacidade, o cadastro não vai
    const botaoCriar = page.getByRole('button', { name: 'Criar conta' })
    if (!(await botaoCriar.isDisabled())) throw new Error('O cadastro deveria exigir o aceite do aviso de privacidade.')
    // o link abre em outra aba de propósito: voltar pela mesma aba apagaria o formulário
    const linkAviso = page.getByRole('link', { name: 'aviso de privacidade' })
    if ((await linkAviso.getAttribute('target')) !== '_blank') {
      throw new Error('O aviso de privacidade deveria abrir em outra aba.')
    }
    await page.getByRole('checkbox').check()
    if (await botaoCriar.isDisabled()) throw new Error('Com o aviso aceito, o cadastro deveria liberar.')
    await botaoCriar.click()
    await page.waitForLoadState('networkidle')
    await page.getByText('Redação 1 — Testes diagnósticos').first().waitFor()
    await foto(page, '05-aluno-inicio')

    await page.goto(`${WEB}/privacidade`, { waitUntil: 'networkidle' })
    await page.getByText('O que é guardado').waitFor()
    await page.getByText('us-west-2').waitFor()
    await foto(page, '04-aviso-privacidade')
    await page.goto(`${WEB}/`, { waitUntil: 'networkidle' })

    const consentimento = await supabaseRest(
      `profiles?email=eq.${encodeURIComponent(ALUNO.email)}&select=consentimento_em`,
    )
    if (!consentimento?.[0]?.consentimento_em) {
      throw new Error('O consentimento do aviso de privacidade não foi gravado em profiles.')
    }

    // ---- 5. aluno envia a foto --------------------------------------------
    console.log('  ▸ 5/26 aluno fotografa e envia')
    await page.getByText('Redação 1 — Testes diagnósticos').first().click()
    await page.getByRole('button', { name: /Fotografar minha redação/ }).click()
    await page.waitForURL(/\/enviar$/)

    const foto_ = join(PASTA, 'redacao-exemplo.png')
    await writeFile(foto_, await paginaEscaneada(navegador))
    await page.locator('input[type=file]').first().setInputFiles(foto_)
    await page.getByRole('button', { name: 'Usar esta foto' }).click()
    await page.getByText('Confira a transcrição').waitFor({ timeout: 40000 })
    await foto(page, '06-transcricao')
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Enviar redação' }).click()
    await page.getByText('Redação enviada').waitFor()
    await foto(page, '06-aluno-enviado')

    // ---- 6. professor corrige ---------------------------------------------
    console.log('  ▸ 6/26 professor corrige')
    await sair(page)
    await entrar(page, PROFESSOR.email, PROFESSOR.senha)
    console.log(`     logado como professor, em ${page.url()}`)
    await page.goto(`${WEB}/prof/avaliacoes/${idAvaliacao}`, { waitUntil: 'networkidle' })
    console.log(`     avaliação aberta em ${page.url()}`)
    await page.getByRole('button', { name: /Corrigir 1 pendente/ }).click()
    await page.getByRole('button', { name: /Corrigir 0 pendente/ }).waitFor({ timeout: 60000 })
    await foto(page, '08-avaliacao-corrigida')

    // ---- 7. revisa, aprova e lança no SIGA --------------------------------
    console.log('  ▸ 7/26 revisa, aprova e lança no SIGA')
    await page.getByRole('button', { name: new RegExp(ALUNO.nome) }).click()
    await page.waitForURL(/\/revisao\//)
    await page.getByText('Nota por critério').waitFor()
    await foto(page, '09-revisao')
    await page.getByRole('button', { name: /Aprovar e liberar/ }).click()
    await page.getByText('Revisão salva').waitFor()
    await page.getByRole('button', { name: /Lançar .* no SIGA/ }).click()
    await page.getByText('Lançada no SIGA').waitFor({ timeout: 30000 })
    await foto(page, '10-lancado-siga')

    // ---- 8. aluno vê a devolutiva -----------------------------------------
    console.log('  ▸ 8/26 aluno vê a devolutiva')
    await sair(page)
    await entrar(page, ALUNO.email, ALUNO.senha)
    // com correção aprovada, o card do aluno já leva direto para a devolutiva
    await page.getByText('Redação 1 — Testes diagnósticos').first().click()
    await page.waitForURL(/\/devolutiva$/)
    await page.getByText('Pontos fortes').waitFor()
    // o aluno tem de saber que a sugestão veio de um modelo e que a nota é do professor
    await page.getByText(/modelo de linguagem .*aprovada pelo professor/i).waitFor()
    await foto(page, '11-devolutiva')
    const nota = await page.locator('body').innerText()

    // ---- 9. confere o registro do lançamento ------------------------------
    console.log('  ▸ 9/26 confere a trilha de auditoria')
    const lancamentos = await supabaseRest(
      `lancamentos_siga?turma_siga=eq.${encodeURIComponent(ALUNO.codigo)}&select=matricula,nota,sucesso,http_status,descricao_avaliacao`,
    )
    const ok = (lancamentos ?? []).filter((l) => l.sucesso)
    if (ok.length !== 1) throw new Error(`Esperava 1 lançamento no SIGA, encontrei ${ok.length}.`)
    // A nota enviada tem de ser a bruta convertida ao peso do SIGA: bruta/valor_total × peso.
    // Com o modelo simulado a bruta é sempre 15 de 20 e o "TVC 1" tem peso 10 → 7,5.
    const [avaliacaoLancada] = await supabaseRest(
      `avaliacoes?id=eq.${idAvaliacao}&select=valor_total,peso_siga`,
    )
    const subsDaAvaliacao = await supabaseRest(`submissoes?avaliacao_id=eq.${idAvaliacao}&select=id`)
    const [correcaoLancada] = await supabaseRest(
      `correcoes?submissao_id=eq.${subsDaAvaliacao[0].id}&select=nota_bruta`,
    )
    const esperada = Math.round((correcaoLancada.nota_bruta / avaliacaoLancada.valor_total) * avaliacaoLancada.peso_siga * 100) / 100
    if (Math.abs(ok[0].nota - esperada) > 0.01) {
      throw new Error(`Nota no SIGA deveria ser ${esperada} (${correcaoLancada.nota_bruta}/${avaliacaoLancada.valor_total} × ${avaliacaoLancada.peso_siga}); veio ${ok[0].nota}.`)
    }
    if (!/Pontos fortes/i.test(nota)) throw new Error('A devolutiva não exibiu os pontos fortes.')

// ---- 10. segunda avaliação (para o caminho sem IA) --------------------
    console.log('  ▸ 10/26 professor cria a segunda avaliação')
    await sair(page)
    await entrar(page, PROFESSOR.email, PROFESSOR.senha)
    await page.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
    await escolherTurmaDeTeste(page)
    await page.getByLabel('Título').fill('Redação 2 — Razão de chances')
    await page
      .locator('#tema')
      .fill('Explique o que é razão de chances (odds ratio) e interprete um OR de 2,5 em um estudo sobre hanseníase.')
    await page
      .locator('#instrucoes')
      .fill('Escreva de 15 a 25 linhas, à mão. Traga a fórmula e um exemplo numérico.')
    await page.getByLabel('Capítulo do livro').selectOption({ index: 5 })
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: /TVC 2/ }).click()
    await page.getByLabel('Data no SIGA').fill('2026-12-04')
    await page.getByRole('button', { name: 'Publicar avaliação' }).click()
    await page.waitForURL(/\/prof\/avaliacoes\/[0-9a-f-]{36}$/)
    const idAvaliacao2 = page.url().split('/').pop()
    console.log(`     avaliação ${idAvaliacao2}`)

    // ---- 11. aluno envia a segunda redação --------------------------------
    console.log('  ▸ 11/26 aluno envia a segunda redação')
    await sair(page)
    await entrar(page, ALUNO.email, ALUNO.senha)
    await page.getByText('Redação 2 — Razão de chances').first().click()
    await page.getByRole('button', { name: /Fotografar minha redação/ }).click()
    await page.waitForURL(/\/enviar$/)
    await page.locator('input[type=file]').first().setInputFiles(foto_)
    await page.getByRole('button', { name: 'Usar esta foto' }).click()
    await page.getByText('Confira a transcrição').waitFor({ timeout: 40000 })
    await page.getByRole('checkbox').check()
    await page.getByRole('button', { name: 'Enviar redação' }).click()
    await page.getByText('Redação enviada').waitFor()

    // ---- 12. correção manual (sem IA), aprovação e lançamento --------------
    console.log('  ▸ 12/26 professor corrige à mão e lança no SIGA')
    await sair(page)
    await entrar(page, PROFESSOR.email, PROFESSOR.senha)
    await page.goto(`${WEB}/prof/avaliacoes/${idAvaliacao2}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: new RegExp(ALUNO.nome) }).click()
    await page.waitForURL(/\/revisao\//)
    await page.getByText('Ainda sem correção da IA').waitFor()
    await page.getByRole('button', { name: 'Corrigir manualmente' }).click()
    await page.getByText('Nota por critério').waitFor({ timeout: 30000 })

    const campos = page.locator('input[type=number]')
    const quantos = await campos.count()
    if (quantos < 2) throw new Error(`Esperava os campos de nota por critério, encontrei ${quantos}.`)
    for (let i = 0; i < quantos; i++) {
      const maximo = Number(await campos.nth(i).getAttribute('max'))
      await campos.nth(i).fill(String(Math.min(5, maximo)))
    }
    await page.getByLabel('Pontos fortes').fill('Explica a ideia de razão de chances.\nUsa um exemplo numérico claro.')
    await page.getByLabel('A desenvolver').fill('Interpretar o intervalo de confiança do OR.')
    await foto(page, '12-corrigindo-a-mao')
    await page.getByRole('button', { name: /Salvar ajustes e liberar/ }).click()
    await page.getByText('Revisão salva').waitFor()

    // lançamento em lote, pela página da avaliação, com confirmação
    await page.goto(`${WEB}/prof/avaliacoes/${idAvaliacao2}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /Lançar 1 no SIGA/ }).click()
    await page.getByText(/Confirmar 1 lançamento/).waitFor()
    await foto(page, '13-confirmar-lancamento')
    await page.getByRole('button', { name: 'Confirmar lançamento' }).click()
    await page.getByText(/1 nota\(s\) lançadas no SIGA/).waitFor({ timeout: 40000 })
    await page.getByText('lançada').first().waitFor()
    await foto(page, '14-manual-lancada')


    const manuais = await supabaseRest(
      `lancamentos_siga?turma_siga=eq.${encodeURIComponent(ALUNO.codigo)}&descricao_avaliacao=eq.${encodeURIComponent('TVC 2')}&select=matricula,nota,sucesso`,
    )
    const okManual = (manuais ?? []).filter((l) => l.sucesso)
    if (okManual.length !== 1) throw new Error(`Esperava 1 lançamento manual, encontrei ${okManual.length}.`)
    if (!(okManual[0].nota > 0)) throw new Error('A nota da correção manual ficou zerada.')

    const correcaoManual = await supabaseRest(
      `correcoes?modelo=eq.manual&select=decisao,nota_final,pontos_fortes,submissao_id`,
    )
    const cm = (correcaoManual ?? [])[0]
    if (!cm) throw new Error('Não encontrei a correção manual no banco.')
    if (cm.decisao !== 'ajustada') throw new Error(`Decisão deveria ser "ajustada", veio "${cm.decisao}".`)
    if (!(cm.nota_final > 0)) throw new Error('A correção manual ficou com nota final 0.')
    if (!(cm.pontos_fortes ?? []).length) throw new Error('Os pontos fortes digitados não foram gravados.')

    // ---- 13. encerrar entregas -------------------------------------------
    console.log('  ▸ 13/26 professor cria a terceira avaliação e encerra as entregas')
    await page.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
    await escolherTurmaDeTeste(page)
    await page.getByLabel('Título').fill('Redação 3 — Intervalo de confiança')
    await page.locator('#tema').fill('O que um intervalo de confiança de 95% informa — e o que ele não informa?')
    await page.locator('#instrucoes').fill('Escreva de 10 a 20 linhas, à mão, com um exemplo.')
    await page.getByLabel('Capítulo do livro').selectOption({ index: 7 })
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: /TVC 2/ }).click()
    await page.getByLabel('Data no SIGA').fill('2026-12-11')
    await page.getByRole('button', { name: 'Publicar avaliação' }).click()
    await page.waitForURL(/\/prof\/avaliacoes\/[0-9a-f-]{36}$/)
    const idAvaliacao3 = page.url().split('/').pop()

    await page.getByRole('button', { name: /Encerrar entregas/ }).click()
    await page.getByText('Entregas encerradas. Os alunos continuam vendo').waitFor({ timeout: 20000 })
    await page.getByText('entregas encerradas').first().waitFor()
    await foto(page, '15-avaliacao-encerrada')

    // ---- 14. o banco recusa entrega nova ---------------------------------
    console.log('  ▸ 14/26 banco recusa entrega em avaliação encerrada')
    const login = await fetch(`${urlSb}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: ALUNO.email, password: ALUNO.senha }),
    })
    const sessao = await login.json()
    if (!sessao.access_token) throw new Error('Não consegui autenticar o aluno por REST.')
    const perfilAluno = await supabaseRest(`profiles?email=eq.${encodeURIComponent(ALUNO.email)}&select=id`)
    const tentativa = await fetch(`${urlSb}/rest/v1/submissoes`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${sessao.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ avaliacao_id: idAvaliacao3, aluno_id: perfilAluno[0].id }),
    })
    if (tentativa.status !== 403) {
      throw new Error(`RLS deveria recusar a entrega (403), veio ${tentativa.status}.`)
    }

    // ---- 15. aluno vê o bloqueio e o professor reabre --------------------
    console.log('  ▸ 15/26 aluno vê o bloqueio; professor reabre')
    const contextoAluno = await navegador.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    })
    const paginaAluno = await contextoAluno.newPage()
    paginaAluno.setDefaultTimeout(25000)
    await entrar(paginaAluno, ALUNO.email, ALUNO.senha)
    await paginaAluno.getByText('Redação 3 — Intervalo de confiança').first().waitFor()
    await paginaAluno.getByText('Entregas encerradas').first().waitFor()
    await paginaAluno.getByText('Redação 3 — Intervalo de confiança').first().click()
    await paginaAluno.getByText('O professor encerrou o recebimento desta redação').waitFor()
    if (await paginaAluno.getByRole('button', { name: /Fotografar minha redação/ }).count()) {
      throw new Error('A avaliação encerrada ainda oferece o botão de envio.')
    }
    await foto(paginaAluno, '16-aluno-entregas-encerradas')
    await contextoAluno.close()

    await page.getByRole('button', { name: /Reabrir entregas/ }).click()
    await page.getByText('Entregas reabertas').waitFor({ timeout: 20000 })



    // ---- 16. turma sem e-mail: lista só com matrícula e nome ------------
    console.log('  ▸ 16/26 lista sem e-mail e cadastro que informa o próprio e-mail')
    await page.goto(`${WEB}/prof/alunos`, { waitUntil: 'networkidle' })
    // com mais de uma turma na lista, nada vem selecionado por padrão
    await escolherTurmaDeTeste(page)
    const caixaExigir = page.getByRole('checkbox', { name: /Exigir o e-mail na lista/ })
    if (!(await caixaExigir.isChecked())) throw new Error('A exigência de e-mail deveria começar marcada.')
    await caixaExigir.uncheck()
    await page.getByText('Agora a lista pode vir só com matrícula e nome').waitFor({ timeout: 20000 })
    await page.locator('textarea').fill(`${RECLAMANTE.matricula};${RECLAMANTE.nome}`)
    await page.getByRole('button', { name: 'Conferir e importar' }).click()
    await page.getByText(/incluíd/).first().waitFor({ timeout: 20000 })
    await page.getByText('e-mail ainda não informado').first().waitFor()

    // ---- 17. o aluno informa o e-mail e a matrícula fica vinculada ------
    console.log('  ▸ 17/26 aluno sem e-mail na lista se cadastra informando o dele')
    const contextoRecl = await navegador.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    })
    const pagRecl = await contextoRecl.newPage()
    pagRecl.setDefaultTimeout(25000)
    await pagRecl.goto(`${WEB}/cadastrar`, { waitUntil: 'networkidle' })
    await escolherTurmaDeTeste(pagRecl)
    await pagRecl.getByLabel('Nome completo').fill(RECLAMANTE.nome)
    await pagRecl.getByLabel('Matrícula', { exact: true }).fill(RECLAMANTE.matricula)
    await pagRecl.getByLabel('E-mail institucional').fill(RECLAMANTE.email)
    await pagRecl.getByLabel('Curso').fill('Ciências Biológicas')
    await pagRecl.getByLabel('Senha', { exact: true }).fill(RECLAMANTE.senha)
    await pagRecl.getByLabel('Repita a senha').fill(RECLAMANTE.senha)
    await pagRecl.getByRole('checkbox').check()
    await pagRecl.getByRole('button', { name: 'Criar conta' }).click()
    await pagRecl.waitForFunction(() => !location.pathname.startsWith('/cadastrar'), null, { timeout: 30000 })
    await pagRecl.getByText('Redação 1 — Testes diagnósticos').first().waitFor({ timeout: 30000 })
    await foto(pagRecl, '17-aluno-sem-email-na-lista')
    await contextoRecl.close()

    const turmasTeste = await supabaseRest(`turmas?codigo_siga=eq.${ALUNO.codigo}&select=id`)
    const esperado = await supabaseRest(
      `alunos_esperados?turma_id=eq.${turmasTeste[0].id}&matricula=eq.${RECLAMANTE.matricula}&select=email,user_id`,
    )
    if (!esperado?.[0]?.user_id) throw new Error('O cadastro não vinculou a matrícula ao usuário.')
    if (esperado[0].email !== RECLAMANTE.email) {
      throw new Error(`O e-mail informado deveria ficar na lista; veio "${esperado[0].email}".`)
    }

    // ---- 18. avaliação que ainda não existe no SIGA ----------------------
    console.log('  ▸ 18/26 cria a avaliação direto no SIGA')
    await page.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
    await escolherTurmaDeTeste(page)
    await page.getByLabel('Título').fill('Redação 4 — Revisão de literatura')
    await page.locator('#tema').fill('Resuma um artigo científico em três parágrafos, destacando o desenho do estudo.')
    await page.locator('#instrucoes').fill('De 15 a 20 linhas, à mão, em folha A4.')
    await page.getByLabel('Capítulo do livro').selectOption({ index: 3 })
    // sem buscar no SIGA: digita uma descrição que ainda não existe lá
    await page.getByLabel('Descrição da avaliação no SIGA').fill('TVC 3')
    await page.getByLabel('Peso no SIGA').fill('20')
    await page.getByLabel('Data no SIGA').fill('2027-02-05')
    await page.getByRole('button', { name: 'Publicar avaliação' }).click()
    await page.waitForURL(/\/prof\/avaliacoes\/[0-9a-f-]{36}$/)
    await page.getByText('Esta avaliação ainda não existe no SIGA').waitFor({ timeout: 20000 })
    await foto(page, '18-avaliacao-fora-do-siga')
    await page.getByRole('button', { name: 'Criar no SIGA' }).click()
    await page.getByText('Avaliação criada no SIGA').waitFor({ timeout: 30000 })
    await page.getByText('Esta avaliação ainda não existe no SIGA').waitFor({ state: 'detached', timeout: 15000 })
    await foto(page, '19-avaliacao-criada-no-siga')

    // ---- 19. aluno edita os próprios dados e troca a senha ---------------
    console.log('  ▸ 19/26 aluno edita os dados e troca a senha')
    await sair(page)
    await entrar(page, ALUNO.email, ALUNO.senha)
    await page.goto(`${WEB}/perfil`, { waitUntil: 'networkidle' })
    const telefoneNovo = '(33) 9 8888-7777'
    await page.getByLabel('Telefone (opcional)').fill(telefoneNovo)
    await page.getByLabel('Curso').fill('Ciências Biológicas — teste')
    await page.getByRole('button', { name: 'Salvar alterações' }).click()
    await page.getByText('Dados atualizados.').waitFor({ timeout: 20000 })
    // recarrega para provar que gravou no banco, e não só na tela
    await page.reload({ waitUntil: 'networkidle' })
    const telefoneSalvo = await page.getByLabel('Telefone (opcional)').inputValue()
    if (telefoneSalvo !== telefoneNovo) throw new Error(`telefone não persistiu: "${telefoneSalvo}"`)
    await foto(page, '20-meus-dados')

    const senhaNova = 'Teste54321'
    await page.getByLabel('Nova senha', { exact: true }).fill(senhaNova)
    await page.getByLabel('Repita a nova senha', { exact: true }).fill(senhaNova)
    await page.getByRole('button', { name: 'Alterar senha' }).click()
    await page.getByText('Senha alterada.').waitFor({ timeout: 20000 })

    // a senha antiga não pode mais entrar; a nova, sim
    await sair(page)
    await page.goto(`${WEB}/entrar`, { waitUntil: 'networkidle' })
    await page.getByLabel('E-mail').fill(ALUNO.email)
    await page.getByLabel('Senha', { exact: true }).fill(ALUNO.senha)
    await page.getByRole('button', { name: 'Entrar' }).click()
    await page.getByText('E-mail ou senha incorretos.').waitFor({ timeout: 15000 })
    await entrar(page, ALUNO.email, senhaNova)
    await foto(page, '21-senha-trocada')

    // ---- 20. professor exclui uma avaliação criada por engano ------------
    console.log('  ▸ 20/26 professor exclui avaliação sem entregas (e não a com entregas)')
    await sair(page)
    await entrar(page, PROFESSOR.email, PROFESSOR.senha)

    // a primeira avaliação já recebeu redação: o app tem de recusar a exclusão
    await page.goto(`${WEB}/prof/avaliacoes/${idAvaliacao}`, { waitUntil: 'networkidle' })
    await page.getByText(/redação enviada.*não pode ser excluída/i).waitFor({ timeout: 20000 })
    if (await page.getByRole('button', { name: 'Quero excluir…' }).count()) {
      throw new Error('Ofereceu excluir uma avaliação que já tem entrega.')
    }

    // esta não recebeu nada: pode ser excluída
    const marca = Date.now().toString(36)
    const tituloDescartavel = `Redação descartável ${marca}`
    await page.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
    await escolherTurmaDeTeste(page)
    await page.getByLabel('Título').fill(tituloDescartavel)
    await page.locator('#tema').fill('Tema descartável.')
    await page.locator('#instrucoes').fill('Instruções descartáveis.')
    await page.getByLabel('Capítulo do livro').selectOption({ index: 2 })
    await page.getByRole('button', { name: 'Buscar' }).click()
    await page.getByRole('button', { name: /TVC 2/ }).click()
    await page.getByLabel('Data no SIGA').fill('2026-11-20')
    await page.getByRole('button', { name: 'Publicar avaliação' }).click()
    await page.waitForURL(/\/prof\/avaliacoes\/[0-9a-f-]{36}$/)

    await page.getByRole('button', { name: 'Quero excluir…' }).click()
    await page.getByLabel(/^Digite "/).fill(tituloDescartavel)
    await page.getByRole('button', { name: 'Excluir definitivamente' }).click()
    await page.waitForURL(/\/$/, { timeout: 20000 })
    const sobrou = await supabaseRest(`avaliacoes?titulo=eq.${encodeURIComponent(tituloDescartavel)}&select=id`)
    if ((sobrou ?? []).length) throw new Error('A avaliação descartável continuou no banco.')
    await foto(page, '22-avaliacao-excluida')

    // ---- 21. confere no SIGA o que foi lançado ---------------------------
    console.log('  ▸ 21/26 confere no SIGA o que o app enviou')
    // A rota devolve nomes e notas da turma: sem sessão de professor, tem de recusar.
    const semSessao = await fetch(`${WEB}/api/siga/notas?turma=TESTEE2E-A&periodo=2026/3`)
    if (semSessao.ok) throw new Error('A rota /api/siga/notas respondeu sem sessão de professor.')
    await page.goto(`${WEB}/prof/avaliacoes/${idAvaliacao}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Conferir agora' }).click()
    await page.getByText(/lido às/).waitFor({ timeout: 30000 })
    // a nota lançada no passo 7 tem de aparecer como conferida no quadro do SIGA
    const conferida = page.getByText('confere', { exact: true }).first()
    await conferida.waitFor({ timeout: 20000 })
    await foto(page, '23-conferencia-siga')

    // ---- 22. recuperação de senha pelo link do e-mail --------------------
    console.log('  ▸ 22/26 recupera a senha pelo link de e-mail')
    const linkRecuperacao = await gerarLinkRecuperacao(
      ALUNO.email,
      'https://estatistica-biocientistas-avaliacao.vercel.app/redefinir',
    )
    const contexto2 = await navegador.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
    })
    const pagina2 = await contexto2.newPage()
    try {
      await pagina2.goto(linkRecuperacao, { timeout: 60000 })
      await pagina2.waitForURL(/redefinir/, { timeout: 60000 })
      const senhaNova = 'NovaSenha98765'
      await pagina2.getByLabel('Nova senha', { exact: true }).fill(senhaNova)
      await pagina2.getByLabel('Repita a nova senha').fill(senhaNova)
      await pagina2.getByRole('button', { name: 'Salvar nova senha' }).click()
      await pagina2.getByText(/Senha alterada/i).waitFor({ timeout: 30000 })
      await foto(pagina2, '24-senha-redefinida')
    } finally {
      await contexto2.close()
    }
    await sair(page)
    await entrar(page, ALUNO.email, 'NovaSenha98765')
    await page.waitForURL(`${WEB}/`, { timeout: 20000 })
    await sair(page)

    // ---- 23. página de ajuda é pública -----------------------------------
    console.log('  ▸ 23/26 a página de ajuda abre sem login')
    await page.goto(`${WEB}/ajuda`, { waitUntil: 'networkidle' })
    if (new URL(page.url()).pathname !== '/ajuda') {
      throw new Error(`A ajuda exigiu login: caiu em ${page.url()}`)
    }
    await page.getByRole('heading', { name: 'Como enviar sua redação' }).waitFor({ timeout: 15000 })
    await page.getByText('Problemas comuns').waitFor({ timeout: 15000 })
    await foto(page, '25-ajuda-aluno')

    // ---- 24. professor muda e remove o prazo ------------------------------
    console.log('  ▸ 24/26 muda o prazo e confere a marca de atraso')
    await entrar(page, PROFESSOR.email, PROFESSOR.senha)
    await page.goto(`${WEB}/prof/avaliacoes/${idAvaliacao}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Definir um prazo' }).click()
    await page.locator('input[type="datetime-local"]').fill('2026-11-01T18:00')
    await page.getByRole('button', { name: 'Salvar prazo' }).click()
    await page.getByText(/Prazo atualizado/).waitFor({ timeout: 20000 })
    // a redação já enviada passa a estar depois do prazo: fica marcada, sem mexer na nota
    await page.getByText('· fora do prazo').waitFor({ timeout: 20000 })
    await foto(page, '26-prazo-mudado')

    await page.getByRole('button', { name: new RegExp(ALUNO.nome) }).click()
    await page.waitForURL(/\/revisao\//)
    await page.getByText('Entregue fora do prazo').waitFor({ timeout: 20000 })
    await page.getByRole('button', { name: '← Voltar para a lista' }).click()
    await page.waitForURL(/\/prof\/avaliacoes\/[^/]+$/)

    await page.getByRole('button', { name: 'Remover prazo' }).click()
    await page.getByText(/Prazo removido/).waitFor({ timeout: 20000 })
    if (await page.getByText('· fora do prazo').count()) {
      throw new Error('Sem prazo, a redação não deveria continuar marcada como fora do prazo.')
    }

    // ---- 25. peso diferente do SIGA ---------------------------------------
    console.log('  ▸ 25/26 avisa quando o peso aqui difere do peso no SIGA')
    await page.goto(`${WEB}/prof/avaliacoes/nova`, { waitUntil: 'networkidle' })
    await escolherTurmaDeTeste(page)
    await page.getByLabel('Título').fill('Redação 5 — Peso divergente')
    await page.locator('#tema').fill('Explique, em poucas linhas, o que é sensibilidade de um teste diagnóstico.')
    await page.locator('#instrucoes').fill('De 10 a 15 linhas, à mão, em folha A4.')
    await page.getByLabel('Capítulo do livro').selectOption({ index: 2 })
    // "TVC 1" já existe no SIGA com peso 10; aqui o peso fica 20 de propósito
    await page.getByLabel('Descrição da avaliação no SIGA').fill('TVC 1')
    await page.getByLabel('Peso no SIGA').fill('20')
    await page.getByRole('button', { name: 'Publicar avaliação' }).click()
    await page.waitForURL(/\/prof\/avaliacoes\/[0-9a-f-]{36}$/)
    const idRedacao5 = page.url().split('/').pop()
    await page.getByText('O peso aqui não é o peso do SIGA').waitFor({ timeout: 20000 })
    await page.getByText(/No SIGA, .* vale 10 pontos/).waitFor({ timeout: 15000 })
    await foto(page, '27-peso-divergente')

    await page.getByRole('button', { name: /Usar o peso do SIGA/ }).click()
    await page.getByText(/Peso alinhado com o SIGA/).waitFor({ timeout: 20000 })
    await page.getByText('O peso aqui não é o peso do SIGA').waitFor({ state: 'detached', timeout: 15000 })
    await page.getByText(/peso 10 ·/).first().waitFor({ timeout: 15000 })
    await foto(page, '28-peso-alinhado')

    // ---- 26. devolver e reenviar ------------------------------------------
    console.log('  ▸ 26/26 devolve, o aluno reenvia e a redação volta para a fila')
    const senhaAtual = 'NovaSenha98765'

    async function enviarNaRedacao5() {
      await page.goto(`${WEB}/avaliacoes/${idRedacao5}`, { waitUntil: 'networkidle' })
      await page.getByRole('button', { name: /Fotografar minha redação|Reenviar redação/ }).click()
      await page.waitForURL(/\/enviar$/)

      // No primeiro envio a tela pede a foto; no reenvio de uma redação devolvida
      // ela já abre no texto salvo. Os dois caminhos precisam funcionar.
      const arquivos = page.locator('input[type=file]')
      const conferir = page.getByText(/Confira a transcrição|Transcrição digitada/)
      await Promise.race([
        arquivos.first().waitFor({ state: 'attached', timeout: 30000 }),
        conferir.waitFor({ timeout: 30000 }),
      ])

      if ((await arquivos.count()) > 0) {
        // o último seletor é o da galeria (o primeiro abre a câmera)
        await arquivos.nth((await arquivos.count()) - 1).setInputFiles(foto_)
        await page.getByRole('button', { name: 'Usar esta foto' }).click()
      }

      // se a transcrição falhar, o erro fica na tela: mostre-o em vez de esperar em silêncio
      await Promise.race([
        conferir.waitFor({ timeout: 45000 }),
        page
          .getByText('Atenção')
          .waitFor({ timeout: 45000 })
          .then(async () => {
            throw new Error(`transcrição falhou: ${(await page.locator('main').innerText()).slice(0, 300)}`)
          }),
      ])

      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Enviar redação' }).click()
      await page.getByText('Redação enviada').waitFor({ timeout: 30000 })
    }

    // o aluno entrega
    await sair(page)
    await entrar(page, ALUNO.email, senhaAtual)
    await enviarNaRedacao5()
    await sair(page)

    // o professor corrige e devolve
    await entrar(page, PROFESSOR.email, PROFESSOR.senha)
    await page.goto(`${WEB}/prof/avaliacoes/${idRedacao5}`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: /Corrigir 1 pendente/ }).click()
    // espera a correção existir: sem ela, a revisão abre em "Ainda sem correção da IA"
    await page.getByRole('button', { name: /Corrigir 0 pendente/ }).waitFor({ timeout: 90000 })
    const linhaAluno = page.getByRole('button', { name: new RegExp(ALUNO.nome) })
    await linhaAluno.waitFor({ timeout: 30000 })
    await linhaAluno.click()
    await page.waitForURL(/\/revisao\//)
    await page.getByRole('button', { name: 'Devolver para o aluno reescrever' }).click()
    await page.waitForURL(/\/prof\/avaliacoes\/[^/]+$/, { timeout: 20000 })
    await sair(page)

    // o aluno vê a devolução e reenvia
    await entrar(page, ALUNO.email, senhaAtual)
    await page.goto(`${WEB}/avaliacoes/${idRedacao5}`, { waitUntil: 'networkidle' })
    await page.getByText('Devolvida para ajuste').waitFor({ timeout: 20000 })
    await foto(page, '29-aluno-devolvida')
    await enviarNaRedacao5()
    await sair(page)

    // o professor: a redação reenviada volta para "a revisar" e NÃO vai para o SIGA
    await entrar(page, PROFESSOR.email, PROFESSOR.senha)
    await page.goto(`${WEB}/prof/avaliacoes/${idRedacao5}`, { waitUntil: 'networkidle' })
    await page.getByText('a revisar', { exact: true }).first().waitFor({ timeout: 20000 })
    const botaoLancar = page.getByRole('button', { name: /Lançar \d+ no SIGA/ })
    const textoLancar = await botaoLancar.textContent()
    if (!/Lançar 0 no SIGA/.test(textoLancar ?? '')) {
      throw new Error(`Redação reenviada não pode ir para o SIGA sem nova aprovação (botão: "${textoLancar}")`)
    }
    if (!(await botaoLancar.isDisabled())) {
      throw new Error('Com 0 aprovações, o botão de lançar deveria estar desativado.')
    }
    // o professor precisa saber quem falta entregar antes de fechar o prazo
    await page.getByText(/1 de \d+ alunos da turma entregaram/).waitFor({ timeout: 10000 })
    await foto(page, '30-reenvio-na-fila')

    // ---- auditoria --------------------------------------------------------
    const acoes = (
      await supabaseRest(`auditoria?criado_em=gte.${encodeURIComponent(inicioDaRodada)}&select=acao`)
    ).map((l) => l.acao)
    const distintas = [...new Set(acoes)]
    for (const esperada of ['corrigir_ia', 'revisar_correcao', 'mudar_prazo']) {
      if (!distintas.includes(esperada)) {
        throw new Error(`Auditoria sem registro de "${esperada}" (achei: ${distintas.join(', ') || 'nenhum'})`)
      }
    }

    console.log('\n  ✓ Fluxo completo validado')
    console.log(`    IA:     matrícula ${ok[0].matricula} · nota ${ok[0].nota} · "${ok[0].descricao_avaliacao}"`)
    console.log(`    manual: matrícula ${okManual[0].matricula} · nota ${okManual[0].nota} · "${cm.decisao}"`)
    console.log(`    ${capturas.length} capturas em e2e/resultados/`)
    if (MANTER) {
      console.log(`\n  Dados mantidos para inspeção:`)
      console.log(`    professor: ${PROFESSOR.email} / ${PROFESSOR.senha}`)
      console.log(`    aluno:     ${ALUNO.email} / ${ALUNO.senha}`)
      console.log(`    ${WEB}/prof/avaliacoes/${idAvaliacao}`)
      console.log(`    ${WEB}/prof/avaliacoes/${idAvaliacao2}\n`)
    }
  } catch (erro) {
    await foto(page, 'erro').catch(() => {})
    const texto = await page.locator('body').innerText().catch(() => '')
    console.error(`\n  Página no momento da falha:\n${texto.slice(0, 1200)}\n`)
    throw erro
  } finally {
    await navegador.close().catch(() => {})
  }
}

/** Gera uma imagem "de redação manuscrita" para servir de foto no teste. */
async function paginaEscaneada(navegador) {
  const pagina = await navegador.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 })
  await pagina.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#f6f2e7;font-family:'Segoe Script','Comic Sans MS',cursive;color:#1f2a44}
    .folha{width:820px;height:1120px;padding:60px 70px;box-sizing:border-box;
           background:repeating-linear-gradient(#f6f2e7 0 44px,#c9d3e0 44px 45px)}
    h2{font-family:Georgia,serif;font-size:19px;margin:0 0 18px;letter-spacing:.5px}
    p{font-size:21px;line-height:45px;margin:0;text-indent:36px}
  </style></head><body><div class="folha">
    <h2>Redação — Testes diagnósticos</h2>
    <p>A sensibilidade de um teste mede a proporção de doentes que o teste identifica como positivos, ou seja, os verdadeiros positivos entre os doentes.</p>
    <p>A especificidade mede a proporção de sadios que o teste identifica como negativos. Um teste sensível serve para triagem; um teste específico serve para confirmar.</p>
    <p>O valor preditivo positivo depende da prevalência: em população com poucos doentes, mesmo um teste específico gera muitos falsos positivos.</p>
  </div></body></html>`)
  const bytes = await pagina.screenshot({ type: 'png' })
  await pagina.close()
  return bytes
}

process.on('SIGINT', () => {
  encerrar()
  process.exit(130)
})

main()
  .then(async () => {
    if (!MANTER) await limpar()
    encerrar()
    await espera(300)
    process.exit(0)
  })
  .catch(async (erro) => {
    console.error(`\n  ✗ ${erro.message}\n`)
    if (process.env.VERBOSE) console.error(erro)
    encerrar()
    await espera(300)
    process.exit(1)
  })
