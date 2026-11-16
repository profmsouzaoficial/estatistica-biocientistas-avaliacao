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
import { execFileSync } from 'node:child_process'

export const SITE = process.env.SITE_AVALIACOES ?? 'https://estatistica-biocientistas-avaliacao.vercel.app'

/** Lê a marca de versão do HTML. Aceita atributos em qualquer ordem. */
export function lerVersaoDoHtml(html) {
  if (typeof html !== 'string') return null
  const meta = html.match(/<meta\b[^>]*\bname=["']app-versao["'][^>]*>/i)
  if (!meta) return null
  const conteudo = meta[0].match(/\bcontent=["']([^"']*)["']/i)
  return conteudo ? conteudo[1].trim() || null : null
}

/** Commit do repositório local (curto). */
export function commitLocal(cwd = process.cwd()) {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' }).trim()
  } catch {
    return null
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
  const { versao: publicada, motivo } = await versaoPublicada()

  const estado = !publicada ? 'desconhecida' : publicada === local ? 'igual' : 'atrasada'
  if (json) {
    console.log(JSON.stringify({ commit: local, publicado: publicada, estado, motivo, site: SITE }))
    process.exit(!publicada ? 2 : publicada === local ? 0 : 1)
  }

  console.log('\n  Versão publicada × repositório\n')
  console.log(`  site          ${SITE}`)
  console.log(`  repositório   ${local ?? '(sem git)'}`)
  console.log(`  publicado     ${publicada ?? `(não consegui ler${motivo ? `: ${motivo}` : ''})`}`)
  console.log()
  if (estado === 'igual') console.log('  ✓ produção roda o mesmo código do repositório.\n')
  else if (estado === 'atrasada') console.log('  ! produção está atrás. Publique com `pnpm publicar`.\n')
  else console.log('  ! não consegui conferir a versão publicada.\n')

  process.exit(!publicada ? 2 : publicada === local ? 0 : 1)
}

// Só roda quando chamado direto (o publicar.mjs importa as funções).
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  principal()
}
