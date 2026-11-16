#!/usr/bin/env node
/**
 * Cria (ou conserta) a conta de professor.
 *
 * Ordem importa: primeiro o e-mail entra em `professores_autorizados`; só então o
 * usuário é criado no Auth, porque o gatilho handle_new_user decide o papel na
 * hora do insert. Sem isso, a conta nasceria como aluno e seria rejeitada pela
 * validação da lista de presença.
 *
 * Uso:
 *   pnpm professor:criar --email marcio.souza@ufjf.br --nome "Márcio Luís Moreira de Souza"
 *   pnpm professor:criar --email x@y.br --nome "Fulano" --senha "senhaProvisoria123"
 *
 * Sem --senha, uma senha aleatória é gerada e impressa uma única vez.
 */
import { randomBytes } from 'node:crypto'
import { carregarEnv, chaveServico, exigir, supabaseRest, urlSupabase } from './_env.mjs'

carregarEnv()

const argumentos = process.argv.slice(2)
const lerArg = (nome) => {
  const i = argumentos.indexOf(nome)
  return i >= 0 ? argumentos[i + 1] : undefined
}

const email = (lerArg('--email') ?? '').trim().toLowerCase()
const nome = (lerArg('--nome') ?? '').trim()
let senha = lerArg('--senha')

if (!email || !email.includes('@')) {
  console.error('\n✗ Informe o e-mail: pnpm professor:criar --email marcio.souza@ufjf.br --nome "Márcio Souza"\n')
  process.exit(1)
}
if (!nome) {
  console.error('\n✗ Informe o nome completo com --nome "Nome Sobrenome"\n')
  process.exit(1)
}
if (!senha) {
  senha = `Ufjf-${randomBytes(9).toString('base64url')}`
  console.log(`\n  Senha provisória gerada: ${senha}`)
  console.log('  (guarde agora — ela não será mostrada de novo)')
}

exigir('SUPABASE_URL')
chaveServico()

console.log(`\n  Conta de professor · ${email}\n`)

// 1. autoriza o e-mail ANTES de criar o usuário
process.stdout.write('  · autorizando e-mail em professores_autorizados … ')
await supabaseRest('professores_autorizados?on_conflict=email', {
  metodo: 'POST',
  corpo: { email },
  prefer: 'resolution=ignore-duplicates,return=minimal',
})
console.log('ok')

// 2. cria o usuário no Auth (ou reaproveita, se já existir)
async function procurarUsuario() {
  const resposta = await fetch(`${urlSupabase()}/auth/v1/admin/users?page=1&per_page=200`, {
    headers: { apikey: chaveServico(), Authorization: `Bearer ${chaveServico()}` },
  })
  if (!resposta.ok) return null
  const dados = await resposta.json()
  return (dados.users ?? []).find((u) => (u.email ?? '').toLowerCase() === email) ?? null
}

let usuario = await procurarUsuario()

if (usuario) {
  console.log(`  · usuário já existia (${usuario.id.slice(0, 8)}…) — atualizando a senha`)
  const resposta = await fetch(`${urlSupabase()}/auth/v1/admin/users/${usuario.id}`, {
    method: 'PUT',
    headers: {
      apikey: chaveServico(),
      Authorization: `Bearer ${chaveServico()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: senha, email_confirm: true, user_metadata: { nome_completo: nome } }),
  })
  if (!resposta.ok) {
    console.error(`\n✗ Não consegui atualizar o usuário: ${resposta.status} ${await resposta.text()}\n`)
    process.exit(1)
  }
} else {
  process.stdout.write('  · criando usuário no Auth … ')
  const resposta = await fetch(`${urlSupabase()}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: chaveServico(),
      Authorization: `Bearer ${chaveServico()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome_completo: nome },
    }),
  })
  const texto = await resposta.text()
  if (!resposta.ok) {
    console.log('FALHOU')
    console.error(`\n✗ ${resposta.status}: ${texto}\n`)
    process.exit(1)
  }
  usuario = JSON.parse(texto)
  console.log('ok')
}

// 3. garante o perfil como professor (o gatilho já criou; isto é rede de segurança)
process.stdout.write('  · garantindo perfil de professor … ')
await supabaseRest('profiles?on_conflict=id', {
  metodo: 'POST',
  corpo: {
    id: usuario.id,
    papel: 'professor',
    nome_completo: nome,
    email,
    precisa_trocar_senha: false,
  },
  prefer: 'resolution=merge-duplicates,return=minimal',
})
console.log('ok')

console.log(`\n  ✓ Pronto. Entre em ${process.env.APP_URL ?? 'http://127.0.0.1:3210'}/entrar`)
console.log(`    e-mail: ${email}`)
console.log(`    senha:  ${senha}\n`)
console.log('  Recomendado: troque a senha em "Perfil" no primeiro acesso.\n')
