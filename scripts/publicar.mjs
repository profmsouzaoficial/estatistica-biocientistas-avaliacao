#!/usr/bin/env node
/**
 * Publica na Vercel — e confere que o que está no ar é o código testado.
 *
 *   pnpm publicar            # publica só se a produção estiver atrás
 *   pnpm publicar --forcar   # publica mesmo que as versões batam
 *
 * Por que este script existe: o plano Hobby da Vercel aceita 100 deployments por
 * dia. Em 16/11/2026 a conta bateu o teto no meio de uma rodada e a produção ficou
 * três commits atrás do repositório, descoberto só quando o teste de fumaça
 * procurou uma tela que existia no código e não no site.
 *
 * O script faz três coisas, nesta ordem:
 *   1. compara a versão publicada (`app-versao` no HTML) com o commit atual;
 *   2. se já batem, não gasta deploy — imprime e sai com 0;
 *   3. se publicar, espera a versão nova aparecer no ar, em vez de confiar que
 *      o `vercel --prod` terminou bem.
 *
 * Sai com 0 em sucesso, 1 em falha e 2 quando a Vercel recusa por cota diária
 * (a mensagem explica quando tentar de novo).
 */
import { spawnSync } from 'node:child_process'
import { commitLocal, versaoPublicada } from './versao.mjs'

const FORCAR = process.argv.includes('--forcar')
const ESPERA_MAXIMA = 8 * 60 * 1000

function publicarAgora() {
  const r = spawnSync('npx', ['--yes', 'vercel@latest', '--prod', '--yes'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 540000,
  })
  const saida = `${r.stdout ?? ''}${r.stderr ?? ''}`
  return { ok: r.status === 0, saida }
}

async function esperarNoAr(commit) {
  const inicio = Date.now()
  while (Date.now() - inicio < ESPERA_MAXIMA) {
    const { versao } = await versaoPublicada()
    if (versao === commit) return true
    await new Promise((r) => setTimeout(r, 10000))
  }
  return false
}

async function principal() {
  const commit = commitLocal()
  if (!commit) {
    console.error('\n✗ Não estou dentro de um repositório git; não sei qual versão publicar.\n')
    process.exit(1)
  }

  console.log('\n  Publicar\n')
  const antes = await versaoPublicada()
  console.log(`  commit        ${commit}`)
  console.log(`  no ar         ${antes.versao ?? `(${antes.motivo})`}`)

  if (antes.versao === commit && !FORCAR) {
    console.log('\n  ✓ a produção já roda este commit — nenhum deploy gasto.\n')
    process.exit(0)
  }

  console.log('\n  ▸ enviando para a Vercel…')
  const { ok, saida } = publicarAgora()
  if (saida.includes('api-deployments-free-per-day')) {
    console.log('\n  ! a Vercel recusou: cota de deploys do dia esgotada (plano Hobby: 100/dia).')
    console.log('    O contador zera à meia-noite UTC (21h de Brasília). Nada foi publicado.\n')
    process.exit(2)
  }
  if (!ok) {
    console.log('\n  ✗ o deploy falhou. Últimas linhas:\n')
    console.log(saida.split('\n').slice(-12).map((l) => `    ${l}`).join('\n'))
    console.log()
    process.exit(1)
  }

  console.log('  ▸ deploy aceito; esperando a versão nova aparecer no ar…')
  const noAr = await esperarNoAr(commit)
  if (!noAr) {
    console.log('\n  ✗ o deploy passou, mas o site ainda não mostra este commit.')
    console.log('    Confira com `pnpm versao` (pode ser cache de borda; tente de novo em 1 min).\n')
    process.exit(1)
  }
  console.log(`\n  ✓ publicado: ${commit} está no ar.\n`)
}

principal()
