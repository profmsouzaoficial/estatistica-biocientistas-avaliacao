#!/usr/bin/env node
/**
 * Confere se a produção alcançou o repositório — e só publica à mão se precisar.
 *
 *   pnpm publicar           # espera o deploy automático do GitHub
 *   pnpm publicar --manual  # força um deploy pela CLI (gasta uma cota do dia)
 *
 * O projeto está ligado ao GitHub: todo push em `master` cria um deployment de
 * produção. Isso foi descoberto do jeito difícil — em 16/11/2026 a conta bateu o
 * teto de 100 deployments/dia do plano Hobby (janela móvel de 24 h), a CLI passou
 * a responder `api-deployments-free-per-day`, e a conclusão errada foi "a produção
 * está parada". Estava: o push das 21:25 já tinha publicado o commit, e o das
 * 21:42 também. O que faltava era saber olhar.
 *
 * Então o padrão deste script é esperar, não publicar:
 *   1. compara a marca `app-versao` do site com o commit atual;
 *   2. se a produção está atrás, espera o build do GitHub aparecer (até 5 min);
 *   3. se não aparecer, explica o motivo provável (cota/rollout) e como forçar;
 *   4. `--manual` pula a espera e roda `vercel --prod` — gastando uma cota.
 *
 * Recusa publicar com a árvore suja: o `vercel --prod` envia os arquivos do disco,
 * não o commit, e a marca de versão passaria a mentir.
 */
import { spawnSync } from 'node:child_process'
import { commitLocal, mudancasNaoCommitadas, mudouApp, statusDoCommit, versaoPublicada } from './versao.mjs'

const MANUAL = process.argv.includes('--manual')
const ESPERA_AUTOMATICA = 5 * 60 * 1000
const ESPERA_MANUAL = 8 * 60 * 1000

async function esperarNoAr(commit, limite) {
  const inicio = Date.now()
  let ultima = null
  while (Date.now() - inicio < limite) {
    const { versao } = await versaoPublicada()
    if (versao === commit) return { ok: true, versao }
    if (versao) ultima = versao
    await new Promise((r) => setTimeout(r, 10000))
  }
  return { ok: false, versao: ultima }
}

function publicarPelaCli() {
  const r = spawnSync('npx', ['--yes', 'vercel@latest', '--prod', '--yes'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 540000,
  })
  return { ok: r.status === 0, saida: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

function commitEnviado() {
  try {
    const r = spawnSync('git', ['rev-parse', 'origin/master'], { encoding: 'utf8' })
    return r.status === 0 ? r.stdout.trim().slice(0, 7) : null
  } catch {
    return null
  }
}

async function principal() {
  const commit = commitLocal()
  if (!commit) {
    console.error('\n✗ Não estou dentro de um repositório git; não sei qual versão conferir.\n')
    process.exit(1)
  }

  console.log('\n  Publicar\n')

  if (MANUAL) {
    const sujas = mudancasNaoCommitadas()
    if (sujas) {
      console.log(`  ! há ${sujas} arquivo(s) com mudanças não commitadas.`)
      console.log('    Commit antes: o deploy pela CLI envia o disco, não o commit.\n')
      process.exit(1)
    }
  }

  const antes = await versaoPublicada()
  console.log(`  commit        ${commit}`)
  console.log(`  no ar         ${antes.versao ?? `(${antes.motivo})`}`)

  if (antes.versao === commit) {
    console.log('\n  ✓ a produção já roda este commit — nada a publicar.\n')
    process.exit(0)
  }

  if (antes.versao && mudouApp(antes.versao) === false) {
    console.log('\n  ✓ desde o deploy mudaram só documentos, scripts ou testes — o app no ar é o mesmo.')
    console.log('    O `vercel.json` pula o build nesses casos; nenhuma cota é gasta.\n')
    process.exit(0)
  }

  if (!MANUAL) {
    const enviado = commitEnviado()
    if (enviado && enviado !== commit) {
      console.log('\n  ! este commit ainda não foi enviado ao GitHub (origin/master está em ' + enviado + ').')
      console.log('    O deploy automático só acontece depois do push.\n')
      process.exit(1)
    }

    // Antes de esperar cinco minutos, pergunta ao GitHub o que a Vercel
    // respondeu: build quebrado e cota estourada pedem ações opostas.
    const status = await statusDoCommit(commit)
    if (status && status.estado !== 'success' && status.estado !== 'pending') {
      console.log(`\n  ! a Vercel recusou este commit: “${status.descricao}”.`)
      if (/rate limit/i.test(status.descricao ?? '')) {
        console.log('    É a cota de deployments do plano Hobby (100 por 24 h) — não é erro do código.')
        console.log('    O app que está no ar continua funcionando. Tente de novo depois da janela.')
      } else if (status.detalhe) {
        console.log(`    Detalhes: ${status.detalhe}`)
      }
      console.log()
      process.exit(2)
    }

    console.log('\n  ▸ esperando o deploy automático do GitHub (até 5 min)…')
    const r = await esperarNoAr(commit, ESPERA_AUTOMATICA)
    if (r.ok) {
      console.log(`\n  ✓ publicado pelo GitHub: ${commit} está no ar.\n`)
      process.exit(0)
    }
    console.log('\n  ! o deploy automático não apareceu.')
    console.log('    Causas comuns: cota de 100 deployments/dia esgotada (janela móvel de 24 h)')
    console.log('    ou o build do GitHub falhou. Acompanhe em vercel.com → Deployments.')
    console.log('    Para forçar pela CLI: `pnpm publicar --manual`.\n')
    process.exit(2)
  }

  console.log('\n  ▸ publicando pela CLI (usa uma cota do dia)…')
  const { ok, saida } = publicarPelaCli()
  if (saida.includes('api-deployments-free-per-day')) {
    console.log('\n  ! a Vercel recusou: cota de deploys do dia esgotada (plano Hobby).')
    console.log('    A janela é móvel: cada deployment de 24 h atrás libera uma vaga.')
    console.log('    O caminho normal é o push — o GitHub publica sozinho.\n')
    process.exit(2)
  }
  if (!ok) {
    console.log('\n  ✗ o deploy falhou. Últimas linhas:\n')
    console.log(saida.split('\n').slice(-12).map((l) => `    ${l}`).join('\n'))
    console.log()
    process.exit(1)
  }

  const depois = await esperarNoAr(commit, ESPERA_MANUAL)
  if (!depois.ok) {
    console.log('\n  ✗ o deploy passou, mas o site ainda não mostra este commit.')
    console.log('    Confira com `pnpm versao` (cache de borda costuma resolver em 1 min).\n')
    process.exit(1)
  }
  console.log(`\n  ✓ publicado: ${commit} está no ar.\n`)
}

principal()
