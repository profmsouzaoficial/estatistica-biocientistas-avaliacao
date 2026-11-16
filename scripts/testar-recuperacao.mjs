#!/usr/bin/env node
/**
 * Testes do link de recuperação de senha (`src/lib/linkRecuperacao.ts`).
 *
 *   pnpm test:recuperacao
 *
 * É o caminho mais esquecido do app: quem clica no link já está sem acesso e
 * sem paciência. Se a tela não explicar o que houve, a pessoa clica de novo no
 * mesmo link e conclui que o sistema não funciona.
 *
 * Os hashes abaixo são os formatos reais do Supabase (GoTrue):
 *   sucesso  #access_token=...&refresh_token=...&type=recovery
 *   expirado #error=access_denied&error_code=otp_expired&error_description=...
 */
import { build } from 'esbuild'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const pasta = mkdtempSync(join(tmpdir(), 'recuperacao-'))
const saida = join(pasta, 'link.mjs')
await build({
  entryPoints: [join(import.meta.dirname, '..', 'src', 'lib', 'linkRecuperacao.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: saida,
  logLevel: 'error',
})
const { lerErroDoLink } = await import(pathToFileURL(saida).href)

let total = 0
let falhas = 0

function caso(nome, [hash, busca], esperado) {
  total += 1
  const r = lerErroDoLink(hash, busca)
  const erros = []
  if (esperado === null) {
    if (r !== null) erros.push(`esperava null, veio ${JSON.stringify(r)}`)
  } else {
    if (r === null) erros.push('esperava um erro, veio null')
    else {
      if (esperado.contem && !r.mensagem.includes(esperado.contem)) {
        erros.push(`mensagem sem "${esperado.contem}": ${JSON.stringify(r.mensagem)}`)
      }
      if (esperado.codigo && r.codigo !== esperado.codigo) {
        erros.push(`codigo: esperava ${esperado.codigo}, veio ${r.codigo}`)
      }
      // o aluno nunca deve ler inglês cru do Supabase
      if (/\b(invalid|expired|denied)\b/i.test(r.mensagem)) {
        erros.push(`mensagem vazou texto em inglês: ${JSON.stringify(r.mensagem)}`)
      }
    }
  }
  if (erros.length) {
    falhas += 1
    console.log(`  ✗ ${nome}`)
    for (const e of erros) console.log(`      ${e}`)
  } else {
    console.log(`  ✓ ${nome}`)
  }
}

console.log('\n  Link de recuperação\n')

caso(
  'link expirado: explica que expirou e manda pedir outro',
  ['#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired', ''],
  { contem: 'expirou', codigo: 'otp_expired' },
)

caso(
  'link já usado: não promete que dá para usar de novo',
  ['#error=access_denied&error_code=otp_expired&error_description=invalid', ''],
  { contem: 'peça outro', codigo: 'otp_expired' },
)

caso(
  'erro só com descrição (sem código)',
  ['#error_description=Token+has+expired+or+is+invalid', ''],
  { contem: 'expirou' },
)

caso('erro na query (fluxo PKCE), não no hash', ['', '?error=access_denied&error_code=otp_expired'], {
  contem: 'expirou',
  codigo: 'otp_expired',
})

caso('erro desconhecido: mensagem genérica em português', ['#error=server_error', ''], {
  contem: 'Não foi possível',
  codigo: 'server_error',
})

caso('link que funcionou: sem erro', ['#access_token=abc&refresh_token=def&type=recovery&expires_in=3600', ''], null)
caso('hash vazio', ['', ''], null)
caso('página comum com busca', ['', '?turma=CBV018GV-A'], null)
caso('hash de âncora qualquer', ['#secao-2', ''], null)

console.log('')
if (falhas > 0) {
  console.log(`✗ ${falhas} de ${total} verificações falharam\n`)
  process.exit(1)
}
console.log(`✓ ${total} verificações do link de recuperação passaram\n`)
