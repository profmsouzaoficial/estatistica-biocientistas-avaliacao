/**
 * Carrega variáveis de ambiente para os scripts de linha de comando.
 * Ordem: ~/.dsh/secrets/avaliacoes.env → .env.local → .env
 * Variáveis já definidas no shell têm prioridade.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

export const raiz = dirname(dirname(fileURLToPath(import.meta.url)))

export const arquivosEnv = [
  join(process.env.HOME ?? '', '.dsh/secrets/avaliacoes.env'),
  join(raiz, '.env.local'),
  join(raiz, '.env'),
]

export function carregarEnv() {
  const origens = []
  for (const arquivo of arquivosEnv) {
    if (!existsSync(arquivo)) continue
    let aplicadas = 0
    for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
      const limpa = linha.trim()
      if (!limpa || limpa.startsWith('#')) continue
      const igual = limpa.indexOf('=')
      if (igual <= 0) continue
      const chave = limpa.slice(0, igual).trim()
      let valor = limpa.slice(igual + 1).trim()
      if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
        valor = valor.slice(1, -1)
      }
      if (!valor || process.env[chave] !== undefined) continue
      process.env[chave] = valor
      aplicadas++
    }
    if (aplicadas) origens.push(`${arquivo} (${aplicadas})`)
  }
  return origens
}

export function exigir(nome) {
  const valor = process.env[nome]
  if (!valor || !valor.trim()) {
    console.error(`\n✗ Falta ${nome}. Preencha em ~/.dsh/secrets/avaliacoes.env ou em .env.local.\n`)
    process.exit(1)
  }
  return valor.trim()
}

export function urlSupabase() {
  return exigir('SUPABASE_URL').replace(/\/+$/, '')
}

export function chaveServico() {
  return exigir('SUPABASE_SERVICE_ROLE_KEY')
}

export function refDoProjeto() {
  const url = urlSupabase()
  const achado = url.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i)
  if (!achado) {
    console.error(`✗ Não consegui extrair o ref do projeto de SUPABASE_URL=${url}`)
    process.exit(1)
  }
  return achado[1]
}

/** REST do Supabase com a chave de serviço. */
export async function supabaseRest(caminho, { metodo = 'GET', corpo, prefer } = {}) {
  const resposta = await fetch(`${urlSupabase()}/rest/v1/${caminho}`, {
    method: metodo,
    headers: {
      apikey: chaveServico(),
      Authorization: `Bearer ${chaveServico()}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
  const texto = await resposta.text()
  let dados = null
  if (texto) {
    try {
      dados = JSON.parse(texto)
    } catch {
      dados = texto
    }
  }
  if (!resposta.ok) {
    const detalhe = dados && typeof dados === 'object' && 'message' in dados ? dados.message : texto
    throw new Error(`Supabase ${resposta.status}: ${detalhe}`)
  }
  return dados
}
