#!/usr/bin/env node
/**
 * Configura a IA (correção + leitura da foto) em um comando.
 *
 *   pnpm configurar:ia --ensaio \
 *     --base https://llm.sualoja.coolify.app/v1 --modelo Qwen2.5-7B-Instruct --chave sk-...
 *
 *   pnpm configurar:ia --base ... --modelo ... --chave ...            (grava e publica)
 *   pnpm configurar:ia ... --visao-modelo Qwen2.5-VL-7B-Instruct      (modelo que enxerga)
 *   pnpm configurar:ia ... --visao-base URL --visao-chave K           (visão em outro serviço)
 *   pnpm configurar:ia ... --foto ~/foto-redacao.jpg                  (testa o OCR na foto)
 *
 * O que ele faz, nesta ordem:
 *   1. grava LLM_* e VISION_* em ~/.dsh/secrets/avaliacoes.env (sem apagar o resto);
 *   2. publica as mesmas variáveis na Vercel (Production) pela API;
 *   3. refaz o deploy de produção;
 *   4. roda `pnpm test:llm` (correção) e, se houver foto, `pnpm test:ocr` (leitura);
 *   5. confere que o app em produção responde com a IA ligada.
 *
 * `--ensaio` mostra tudo isso sem escrever nada — nem arquivo, nem Vercel.
 *
 * Sobre a visão: o app aceita qualquer endpoint compatível com OpenAI. Se o
 * modelo do Coolify enxerga imagem (Qwen2.5-VL, MiniCPM-V, Llama 3.2 Vision),
 * basta `--visao-modelo` e a MESMA chave/base — não precisa de Google Cloud.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { arquivosEnv, carregarEnv, raiz } from './_env.mjs'

const args = process.argv.slice(2)
const ler = (nome) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : undefined
}
const ensaio = args.includes('--ensaio')

const base = ler('--base')?.replace(/\/+$/, '')
const modelo = ler('--modelo')
const chave = ler('--chave')
const visaoBase = (ler('--visao-base') ?? base)?.replace(/\/+$/, '')
const visaoModelo = ler('--visao-modelo')
const visaoChave = ler('--visao-chave') ?? chave
const foto = ler('--foto')
const pularDeploy = args.includes('--sem-deploy')
const pularTestes = args.includes('--sem-testes')
const somenteArquivo = args.includes('--somente-arquivo')
const pularVercel = somenteArquivo || args.includes('--sem-vercel')

const ARQUIVO_SEGREDOS = ler('--arquivo') ?? arquivosEnv[0]
const VERDE = '\x1b[32m'
const VERMELHO = '\x1b[31m'
const AMARELO = '\x1b[33m'
const FRACO = '\x1b[2m'
const FIM = '\x1b[0m'

function falhar(mensagem) {
  console.error(`\n  ${VERMELHO}✗${FIM} ${mensagem}\n`)
  process.exit(1)
}

console.log(`\n  Configurar a IA · Análise de Dados para Biocientistas${ensaio ? '  (ensaio: nada será gravado)' : ''}\n`)

if (!base || !modelo || !chave) {
  falhar(
    'faltam dados. Uso:\n' +
      '    pnpm configurar:ia --ensaio --base https://SEU-SERVICO/v1 --modelo NOME --chave sk-...\n' +
      '    (--visao-modelo NOME se o mesmo modelo lê imagem; --visao-base/--visao-chave se a visão é outro serviço)',
  )
}

const planejado = [
  ['LLM_BASE_URL', base],
  ['LLM_MODEL', modelo],
  ['LLM_API_KEY', chave],
  ['LLM_MAX_TOKENS', ler('--max-tokens') ?? '2000'],
  ['LLM_TIMEOUT_MS', ler('--timeout') ?? '55000'],
]
if (visaoModelo) {
  planejado.push(['VISION_PROVIDER', 'openai'])
  planejado.push(['VISION_BASE_URL', visaoBase])
  planejado.push(['VISION_MODEL', visaoModelo])
  planejado.push(['VISION_API_KEY', visaoChave])
}

const SEGREDOS = /(_API_KEY|_SECRET|SENHA|^VERCEL_TOKEN$)/i
const mascarar = (k, v) =>
  SEGREDOS.test(k) ? `${v.slice(0, 4)}…${v.slice(-4)} (${v.length} caracteres)` : v

console.log('  Variáveis:')
for (const [k, v] of planejado) {
  console.log(`    ${FRACO}${k.padEnd(16)}${FIM} ${mascarar(k, String(v))}`)
}

// ---- 1. arquivo de segredos -------------------------------------------------
function gravarSegredos() {
  const atual = existsSync(ARQUIVO_SEGREDOS) ? readFileSync(ARQUIVO_SEGREDOS, 'utf8') : ''
  const linhas = atual.split(/\r?\n/)
  const novas = new Map(planejado.map(([k, v]) => [k, String(v)]))

  const saida = linhas.map((linha) => {
    const igual = linha.indexOf('=')
    if (igual > 0 && !linha.trim().startsWith('#')) {
      const k = linha.slice(0, igual).trim()
      if (novas.has(k)) {
        const v = novas.get(k)
        novas.delete(k)
        return `${k}=${v}`
      }
    }
    return linha
  })
  const restantes = [...novas.entries()].map(([k, v]) => `${k}=${v}`)
  const corpo = [...saida.filter((l, i) => !(l === '' && i === saida.length - 1)), ...restantes].join('\n')
  writeFileSync(ARQUIVO_SEGREDOS, `${corpo}\n`, { mode: 0o600 })
}

// ---- 2. Vercel --------------------------------------------------------------
/**
 * A Vercel aceita dois caminhos de autenticação: um token em VERCEL_TOKEN ou o
 * token que o próprio CLI guardou quando alguém rodou `vercel login`. O segundo
 * é o que esta máquina usa (VERCEL_TOKEN está vazio), então ele entra como
 * reserva — assim o script funciona sem pedir mais nada.
 */
function tokenDaVercel() {
  const doAmbiente = process.env.VERCEL_TOKEN?.trim()
  if (doAmbiente) return doAmbiente
  const arquivo = join(process.env.HOME ?? '', '.local/share/com.vercel.cli/auth.json')
  try {
    const { token } = JSON.parse(readFileSync(arquivo, 'utf8'))
    if (token) return String(token)
  } catch {
    /* sem login do CLI */
  }
  return null
}

async function vercel(método, caminho, corpo) {
  const token = tokenDaVercel()
  if (!token) falhar('sem credencial da Vercel: rode `npx vercel login` ou preencha VERCEL_TOKEN.')
  const api = process.env.VERCEL_API_BASE ?? 'https://api.vercel.com'
  const r = await fetch(`${api}${caminho}`, {
    method: método,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  })
  const texto = await r.text()
  let dados = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }
  return { status: r.status, dados }
}

async function idDoProjeto() {
  const nome = ler('--projeto') ?? 'estatistica-biocientistas-avaliacao'
  const { status, dados } = await vercel('GET', `/v9/projects/${nome}`)
  if (status !== 200) falhar(`não encontrei o projeto "${nome}" na Vercel (HTTP ${status}).`)
  return dados.id
}

async function publicarNaVercel(projetoId) {
  const existentes = await vercel('GET', `/v10/projects/${projetoId}/env?decrypt=false`)
  const porChave = new Map((existentes.dados?.envs ?? []).map((e) => [e.key, e]))
  for (const [chaveEnv, valor] of planejado) {
    const atual = porChave.get(chaveEnv)
    if (atual) {
      const r = await vercel('PATCH', `/v10/projects/${projetoId}/env/${atual.id}`, { value: String(valor), target: ['production'] })
      if (r.status >= 300) falhar(`Vercel recusou atualizar ${chaveEnv}: HTTP ${r.status} ${JSON.stringify(r.dados).slice(0, 200)}`)
      console.log(`    ${VERDE}✓${FIM} ${chaveEnv} atualizada na Vercel`)
    } else {
      const r = await vercel('POST', `/v10/projects/${projetoId}/env`, {
        key: chaveEnv,
        value: String(valor),
        type: 'encrypted',
        target: ['production'],
      })
      if (r.status >= 300) falhar(`Vercel recusou criar ${chaveEnv}: HTTP ${r.status} ${JSON.stringify(r.dados).slice(0, 200)}`)
      console.log(`    ${VERDE}✓${FIM} ${chaveEnv} criada na Vercel`)
    }
  }
}

function rodar(comando, argumentos, env = {}) {
  return new Promise((ok) => {
    const p = spawn(comando, argumentos, { cwd: raiz, env: { ...process.env, ...env }, stdio: 'inherit' })
    p.on('exit', (c) => ok(c ?? 1))
  })
}

// ---- execução ---------------------------------------------------------------
if (ensaio) {
  console.log('\n  Ensaio: nenhum arquivo foi escrito e a Vercel não foi tocada.')
  console.log('  Sem --ensaio, o script faria:')
  console.log(`    1. gravar as ${planejado.length} variáveis em ${ARQUIVO_SEGREDOS}`)
  console.log('    2. publicar as mesmas variáveis na Vercel (Production) — usando o login do CLI')
  console.log('    3. rodar: npx vercel --prod --yes')
  console.log('    4. rodar: pnpm test:llm' + (foto ? ` e pnpm test:ocr:foto ${foto}` : ''))
  console.log('    5. consultar /api/saude em produção para confirmar que a IA está ligada\n')
  process.exit(0)
}

console.log('')
gravarSegredos()
console.log(`    ${VERDE}✓${FIM} gravadas em ${ARQUIVO_SEGREDOS} (permissão 600)`)

if (somenteArquivo) {
  console.log(`\n  ${VERDE}✓ pronto${FIM} (--somente-arquivo: Vercel, deploy e testes foram pulados)\n`)
  process.exit(0)
}

if (!pularVercel) {
  const projetoId = await idDoProjeto()
  await publicarNaVercel(projetoId)
}

if (!pularDeploy) {
  console.log(`\n  Publicando em produção…`)
  const codigo = await rodar('npx', ['--yes', 'vercel@latest', '--prod', '--yes'])
  if (codigo !== 0) falhar('o deploy falhou; as variáveis estão gravadas, mas a produção não foi atualizada.')
}

if (!pularTestes) {
  carregarEnv()
  console.log('\n  Testando a correção com o modelo configurado…\n')
  const llm = await rodar('node', ['scripts/testar-llm.mjs'])
  if (llm !== 0) {
    console.log(`\n  ${AMARELO}!${FIM} a correção não passou. Veja a mensagem acima: o serviço responde? o modelo existe?`)
    process.exit(1)
  }
  if (foto) {
    console.log('\n  Testando a leitura da foto…\n')
    const ocr = await rodar('node', ['scripts/ocr-real.mjs', foto])
    if (ocr !== 0) {
      console.log(`\n  ${AMARELO}!${FIM} a correção funciona, mas a leitura da foto não.`)
      process.exit(1)
    }
  }
}

// ---- 5. o app em produção está com a IA ligada? ----------------------------
const dominio = ler('--dominio') ?? 'estatistica-biocientistas-avaliacao.vercel.app'
if (!pularDeploy) {
  try {
    const r = await fetch(`https://${dominio}/api/saude`, { headers: { Accept: 'application/json' } })
    if (r.status === 401) {
      console.log(`\n  ${FRACO}· /api/saude pede login (esperado); a configuração foi publicada${FIM}`)
    } else if (r.ok) {
      const s = await r.json()
      const linha = (rotulo, v) => `    ${s?.[v]?.configurado ? VERDE + '✓' : VERMELHO + '✗'}${FIM} ${rotulo}${s?.[v]?.modelo ? ` ${FRACO}(${s[v].modelo})${FIM}` : ''}`
      console.log('\n  Configuração em produção:')
      console.log(linha('corretor (LLM)', 'corretor'))
      console.log(linha('leitura da foto', 'ocr'))
      console.log(linha('SIGA', 'siga'))
    }
  } catch {
    console.log(`\n  ${FRACO}· não consegui consultar /api/saude agora; confira depois em Configurações${FIM}`)
  }
}

console.log(`\n  ${VERDE}✓ IA configurada${FIM} — correção${foto ? ' e leitura de foto' : ''} publicada em produção.`)
if (!foto) console.log(`  ${FRACO}(sem --foto, a leitura da foto não foi testada)${FIM}`)
console.log('\n  Guarde a chave em local seguro; ela não aparece de novo aqui.\n')
