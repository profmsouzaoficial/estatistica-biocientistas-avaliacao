#!/usr/bin/env node
/**
 * Qual versão está publicada?
 *
 *   pnpm versao
 *
 * A rodada 31 terminou com uma pergunta sem resposta: o deploy da Vercel foi
 * recusado pela cota diária (100 deployments no plano Hobby) e a produção ficou
 * três commits atrás do repositório. Sem uma marca de build no site, ninguém — nem
 * eu, nem o professor — sabia dizer qual código estava no ar.
 *
 * O `vite.config.ts` injeta `<meta name="app-versao" content="abc1234">` no HTML.
 * Este script compara essa marca com o commit atual. Sai com 0 quando batem,
 * 1 quando divergem e 2 quando o site não responde — assim serve de guarda para
 * o `pnpm publicar`, que não gasta deploy quando não há nada novo.
 *
 *   node scripts/versao.mjs            # tabela legível
 *   node scripts/versao.mjs --json     # para scripts
 */
import { execFileSync, spawnSync } from 'node:child_process'

export const SITE = process.env.SITE_AVALIACOES ?? 'https://estatistica-biocientistas-avaliacao.vercel.app'

/** Lê a marca de versão do HTML. Aceita atributos em qualquer ordem. */
export function lerVersaoDoHtml(html) {
  if (typeof html !== 'string') return null
  const meta = html.match(/<meta\b[^>]*\bname=["']app-versao["'][^>]*>/i)
  if (!meta) return null
  const conteudo = meta[0].match(/\bcontent=["']([^"']*)["']/i)
  return conteudo ? conteudo[1].trim() || null : null
}

/** Arquivos alterados e ainda não commitados (vazio = árvore limpa). */
export function mudancasNaoCommitadas(cwd = process.cwd()) {
  try {
    const saida = execFileSync('git', ['status', '--porcelain'], { cwd, encoding: 'utf8' }).trim()
    return saida ? saida.split('\n').length : 0
  } catch {
    return 0
  }
}

/**
 * O que mudou entre dois commits mexeu no aplicativo?
 *
 * Mudança só em documento, script de teste ou `e2e/` não altera o que o aluno e
 * o professor usam — e o `vercel.json` manda a Vercel pular o build nesses casos
 * (cota de 100 deploys/dia). Sem esta conta, o `pnpm versao` diria "atrasada"
 * para sempre depois de um commit de documentação.
 *
 * Devolve true/false, ou null quando o commit publicado não existe aqui.
 */
export function mudouApp(desde, ate = 'HEAD', cwd = process.cwd()) {
  if (!desde) return null
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${desde}^{commit}`], { cwd, stdio: 'ignore' })
  } catch {
    return null
  }
  const r = spawnSync(
    'git',
    [
      'diff',
      '--quiet',
      desde,
      ate,
      '--',
      '.',
      ':(exclude)*.md',
      ':(exclude)**/*.md',
      ':(exclude)docs/**',
      ':(exclude)scripts/**',
      ':(exclude)e2e/**',
    ],
    { cwd },
  )
  if (r.status === 0) return false
  if (r.status === 1) return true
  return null
}

/** Commit do repositório local (curto). */
export function commitLocal(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/**
 * O que a Vercel respondeu sobre este commit, no GitHub.
 *
 * Quando o deployment automático não aparece, há duas causas possíveis e elas
 * pedem ações opostas: build quebrado (corrigir o build) ou cota estourada
 * (esperar). A Vercel publica o motivo como status do commit — em 16/11/2026,
 * "Deployment rate limited — retry in 24 hours". Ler isso é a diferença entre
 * insistir e esperar.
 */
export async function statusDoCommit(sha, { cwd = process.cwd(), timeoutMs = 10000 } = {}) {
  let slug = null
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd, encoding: 'utf8' }).trim()
    const m = url.match(/(?:github\.com[:/])([^/]+\/[^/.]+)(?:\.git)?$/)
    slug = m ? m[1] : null
  } catch {
    slug = null
  }
  if (!slug || !sha) return null

  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), timeoutMs)
  try {
    const r = await fetch(`https://api.github.com/repos/${slug}/commits/${sha}/statuses`, {
      signal: controle.signal,
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'estatistica-avaliacoes' },
    })
    if (!r.ok) return null
    const lista = await r.json()
    const vercel = Array.isArray(lista) ? lista.find((x) => /vercel/i.test(x?.context ?? '')) : null
    if (!vercel) return null
    return { estado: vercel.state, descricao: vercel.description, detalhe: vercel.target_url, quando: vercel.created_at }
  } catch {
    return null
  } finally {
    clearTimeout(relogio)
  }
}

/** Busca o HTML publicado e devolve a versão (null se não der para ler). */
export async function versaoPublicada(site = SITE, { timeoutMs = 15000 } = {}) {
  const controle = new AbortController()
  const relogio = setTimeout(() => controle.abort(), timeoutMs)
  try {
    const resposta = await fetch(site, {
      signal: controle.signal,
      cache: 'no-store',
      headers: { 'cache-control': 'no-cache' },
    })
    if (!resposta.ok) return { versao: null, motivo: `HTTP ${resposta.status}` }
    const html = await resposta.text()
    const versao = lerVersaoDoHtml(html)
    return {
      versao,
      motivo: versao ? null : 'site no ar, mas sem a marca app-versao (build anterior ao marcador)',
    }
  } catch (e) {
    return { versao: null, motivo: e instanceof Error ? e.message : 'falha de rede' }
  } finally {
    clearTimeout(relogio)
  }
}

async function principal() {
  const json = process.argv.includes('--json')
  const local = commitLocal()
  const sujas = mudancasNaoCommitadas()
  const { versao: publicada, motivo } = await versaoPublicada()

  // "igual" = mesmo commit; "mesmo app" = commits diferentes, mas só documento/script mudou.
  const soDocumentacao = publicada && publicada !== local ? mudouApp(publicada) === false : false
  const estado = !publicada
    ? 'desconhecida'
    : publicada === local
      ? 'igual'
      : soDocumentacao
        ? 'mesmo-app'
        : 'atrasada'
  if (json) {
    console.log(JSON.stringify({ commit: local, publicado: publicada, estado, motivo, site: SITE, sujas }))
    process.exit(!publicada ? 2 : estado === 'atrasada' ? 1 : 0)
  }

  console.log('\n  Versão publicada × repositório\n')
  console.log(`  site          ${SITE}`)
  console.log(`  repositório   ${local ?? '(sem git)'}`)
  console.log(`  publicado     ${publicada ?? `(não consegui ler${motivo ? `: ${motivo}` : ''})`}`)
  if (sujas) console.log(`  árvore        ${sujas} arquivo(s) não commitado(s)`)
  // Por que o commit não subiu? Build quebrado e cota estourada pedem ações opostas.
  const status = estado === 'igual' ? null : await statusDoCommit(local)
  if (status) console.log(`  github        ${status.estado}: ${status.descricao ?? '(sem descrição)'}`)
  console.log()
  if (estado === 'igual') console.log('  ✓ produção roda o mesmo código do repositório.\n')
  else if (estado === 'mesmo-app')
    console.log(
      '  ✓ o app no ar é o mesmo do repositório (desde o deploy mudaram só documentos, scripts ou testes).\n',
    )
  else if (estado === 'atrasada' && status && status.estado !== 'success' && status.estado !== 'pending') {
    console.log(`  ! a Vercel recusou o deploy deste commit; o app no ar é o de ${publicada}.`)
    if (/rate limit/i.test(status.descricao ?? '')) {
      console.log('    Cota de deployments do plano Hobby: espere a janela de 24 h. O site continua funcionando.')
    }
    console.log()
  } else if (estado === 'atrasada') console.log('  ! produção está atrás. Rode `pnpm publicar`.\n')
  else console.log('  ! não consegui conferir a versão publicada.\n')

  process.exit(!publicada ? 2 : estado === 'atrasada' ? 1 : 0)
}

// Só roda quando chamado direto (o publicar.mjs importa as funções).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  principal()
}
