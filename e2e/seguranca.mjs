#!/usr/bin/env node
/**
 * Teste de isolamento entre alunos — roda contra o Supabase de produção.
 *
 * A promessa feita ao aluno é: "sua redação e sua devolutiva ficam visíveis só
 * para você e para o professor". Este script cria duas contas descartáveis,
 * envia uma redação com foto pela primeira e tenta, com a segunda, ler o que não
 * é dela. Também confere que aluno não consegue apagar turma.
 *
 * Nada é lançado no SIGA. Tudo o que é criado é apagado no final.
 *
 *   pnpm test:seguranca
 */
import { carregarEnv, chaveServico, supabaseRest, urlSupabase } from '../scripts/_env.mjs'

carregarEnv()

const base = urlSupabase()
const servico = chaveServico()
const anon = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY
if (!anon) {
  console.error('\n✗ Falta SUPABASE_ANON_KEY (ou VITE_SUPABASE_ANON_KEY).\n')
  process.exit(1)
}

const marca = String(Date.now()).slice(-6)
const colaboradores = []
let turmaId = null
let fotoPath = null
const resultados = []

function registrar(nome, passou, detalhe) {
  resultados.push({ nome, passou, detalhe })
  const icone = passou ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${icone} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
}

const servicoHeaders = { apikey: servico, Authorization: `Bearer ${servico}`, 'Content-Type': 'application/json' }

async function criarUsuario(email, senha, nome, { turmaId, matricula }) {
  const resposta = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers: servicoHeaders,
    body: JSON.stringify({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome_completo: nome, turma_id: turmaId, matricula, curso: 'Ciências Biológicas' },
    }),
  })
  const dados = await resposta.json()
  if (!resposta.ok) throw new Error(`Não criei ${email}: ${JSON.stringify(dados).slice(0, 200)}`)
  colaboradores.push(dados.id)
  return dados.id
}

async function entrar(email, senha) {
  const resposta = await fetch(`${base}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: senha }),
  })
  const dados = await resposta.json()
  if (!resposta.ok) throw new Error(`Login de ${email} falhou: ${JSON.stringify(dados).slice(0, 160)}`)
  return dados.access_token
}

/** GET no PostgREST em nome de um usuário (RLS vale). */
async function consultar(token, caminho) {
  const resposta = await fetch(`${base}/rest/v1/${caminho}`, {
    headers: { apikey: anon, Authorization: `Bearer ${token}` },
  })
  const texto = await resposta.text()
  return { status: resposta.status, dados: texto ? JSON.parse(texto) : null }
}

async function rpc(token, funcao, corpo) {
  const resposta = await fetch(`${base}/rest/v1/rpc/${funcao}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const texto = await resposta.text()
  return { status: resposta.status, dados: texto ? JSON.parse(texto) : null }
}

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

try {
  console.log(`\n  Segurança · isolamento entre alunos\n  projeto: ${base}\n`)

  // ---- preparação (service role) -------------------------------------------
  const turma = (
    await supabaseRest('turmas', {
      metodo: 'POST',
      prefer: 'return=representation',
      corpo: {
        nome: `Segurança ${marca}`,
        codigo_siga: `SEG-${marca}`,
        periodo: '2026/3',
        curso: 'Ciências Biológicas',
        exige_email: true,
      },
    })
  )[0]
  turmaId = turma.id

  const emailA = `seg.a.${marca}@estudante.ufjf.br`
  const emailB = `seg.b.${marca}@estudante.ufjf.br`
  const senha = 'Seguranca123'

  // A lista da turma vem antes das contas: o trigger de cadastro confere a
  // matrícula contra `alunos_esperados` e cria o perfil sozinho.
  const pessoas = [
    { email: emailA, nome: 'Aluna A', matricula: `70${marca}A` },
    { email: emailB, nome: 'Aluno B', matricula: `70${marca}B` },
  ]
  for (const pessoa of pessoas) {
    await supabaseRest('alunos_esperados', {
      metodo: 'POST',
      corpo: { turma_id: turmaId, matricula: pessoa.matricula, nome_completo: pessoa.nome, email: pessoa.email },
    })
  }
  const idA = await criarUsuario(emailA, senha, 'Aluna A', { turmaId, matricula: pessoas[0].matricula })
  const idB = await criarUsuario(emailB, senha, 'Aluno B', { turmaId, matricula: pessoas[1].matricula })

  const avaliacao = (
    await supabaseRest('avaliacoes', {
      metodo: 'POST',
      prefer: 'return=representation',
      corpo: {
        turma_id: turmaId,
        titulo: `Segurança ${marca}`,
        tema: 'Tema do teste de isolamento.',
        instrucoes: 'Instruções do teste.',
        valor_total: 10,
        rubrica: [{ id: 'c1', nome: 'Critério', descricao: 'Critério único.', valor: 10 }],
        status: 'publicada',
      },
    })
  )[0]

  const tokenA = await entrar(emailA, senha)
  const tokenB = await entrar(emailB, senha)

  // A envia a redação (insert permitido pela RLS) e sobe a foto
  const submissao = (
    await fetch(`${base}/rest/v1/submissoes?select=*`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ avaliacao_id: avaliacao.id, aluno_id: idA, status: 'enviada' }),
    })
  )
  const linhas = await submissao.json()
  if (!Array.isArray(linhas) || !linhas[0]) throw new Error(`A não conseguiu enviar a redação: ${JSON.stringify(linhas).slice(0, 200)}`)

  fotoPath = `${idA}/${linhas[0].id}.jpg`
  const upload = await fetch(`${base}/storage/v1/object/redacoes/${fotoPath}`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${tokenA}`, 'Content-Type': 'image/jpeg' },
    body: png,
  })
  registrar('aluna A consegue enviar redação e foto', upload.ok, `foto ${fotoPath.slice(0, 8)}…`)

  // correção do professor (para testar leitura da devolutiva)
  await supabaseRest('correcoes', {
    metodo: 'POST',
    corpo: {
      submissao_id: linhas[0].id,
      nota_bruta: 7,
      nota_final: 7,
      criterios: [{ id: 'c1', nome: 'Critério', valor: 7, justificativa: 'Teste.' }],
      pontos_fortes: ['Teste'],
      pontos_desenvolver: ['Teste'],
      comentario_professor: 'Correção de teste.',
      decisao: 'aprovada',
    },
  })

  // ---- o que a aluna A vê --------------------------------------------------
  const submA = await consultar(tokenA, 'submissoes?select=id,aluno_id')
  registrar('A vê a própria submissão', submA.dados?.length === 1, `${submA.dados?.length ?? 0} linha(s)`)

  const corrA = await consultar(tokenA, 'correcoes?select=id,nota_final')
  registrar('A vê a própria devolutiva', corrA.dados?.length === 1, `nota ${corrA.dados?.[0]?.nota_final}`)

  const perfilA = await consultar(tokenA, 'profiles?select=id,nome_completo')
  registrar('A vê só o próprio perfil', perfilA.dados?.length === 1 && perfilA.dados[0].id === idA, `${perfilA.dados?.length ?? 0} perfil(is)`)

  const fotoA = await fetch(`${base}/storage/v1/object/authenticated/redacoes/${fotoPath}`, {
    headers: { apikey: anon, Authorization: `Bearer ${tokenA}` },
  })
  registrar('A baixa a própria foto', fotoA.ok, `HTTP ${fotoA.status}`)

  // ---- o que o aluno B não pode -------------------------------------------
  const submB = await consultar(tokenB, 'submissoes?select=id,aluno_id')
  registrar('B NÃO vê a submissão de A', Array.isArray(submB.dados) && submB.dados.length === 0, `${submB.dados?.length ?? 'erro'} linha(s)`)

  const corrB = await consultar(tokenB, 'correcoes?select=id,nota_final')
  registrar('B NÃO vê a devolutiva de A', Array.isArray(corrB.dados) && corrB.dados.length === 0, `${corrB.dados?.length ?? 'erro'} linha(s)`)

  const perfilB = await consultar(tokenB, 'profiles?select=id,nome_completo')
  registrar(
    'B vê apenas o próprio perfil',
    Array.isArray(perfilB.dados) && perfilB.dados.length === 1 && perfilB.dados[0].id === idB,
    `${perfilB.dados?.length ?? 'erro'} perfil(is)`,
  )

  const fotoB = await fetch(`${base}/storage/v1/object/authenticated/redacoes/${fotoPath}`, {
    headers: { apikey: anon, Authorization: `Bearer ${tokenB}` },
  })
  registrar('B NÃO baixa a foto de A', !fotoB.ok, `HTTP ${fotoB.status}`)

  const forjar = await fetch(`${base}/rest/v1/submissoes?select=*`, {
    method: 'POST',
    headers: { apikey: anon, Authorization: `Bearer ${tokenB}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ avaliacao_id: avaliacao.id, aluno_id: idA, status: 'enviada' }),
  })
  registrar('B NÃO envia redação no nome de A', !forjar.ok, `HTTP ${forjar.status}`)

  const apagar = await rpc(tokenB, 'apagar_turma', { p_turma: turmaId })
  registrar(
    'aluno NÃO apaga turma',
    apagar.dados?.ok !== true,
    apagar.dados?.motivo ?? `HTTP ${apagar.status}`,
  )

  const resumo = await rpc(tokenB, 'resumo_turma', { p_turma: turmaId })
  registrar('aluno NÃO lê o resumo da turma', resumo.dados?.ok !== true, resumo.dados?.motivo ?? `HTTP ${resumo.status}`)

  const anonimo = await fetch(`${base}/rest/v1/submissoes?select=id,aluno_id`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  })
  const corpoAnonimo = await anonimo.text()
  let linhasAnonimas = null
  try {
    linhasAnonimas = JSON.parse(corpoAnonimo)
  } catch {
    linhasAnonimas = null
  }
  const vazou = Array.isArray(linhasAnonimas) && linhasAnonimas.length > 0
  registrar(
    'sem login, ninguém lê submissões',
    !vazou,
    `HTTP ${anonimo.status} · ${Array.isArray(linhasAnonimas) ? `${linhasAnonimas.length} linha(s)` : 'sem corpo JSON'}`,
  )
} finally {
  // ---- limpeza -------------------------------------------------------------
  try {
    if (turmaId) await supabaseRest(`turmas?id=eq.${turmaId}`, { metodo: 'DELETE' })
    if (fotoPath) {
      await fetch(`${base}/storage/v1/object/redacoes`, {
        method: 'DELETE',
        headers: servicoHeaders,
        body: JSON.stringify({ prefixes: [fotoPath] }),
      })
    }
    for (const id of colaboradores) {
      await fetch(`${base}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: servicoHeaders })
    }
    console.log('\n  · dados do teste removidos')
  } catch (erro) {
    console.error(`\n  ⚠ falha na limpeza: ${erro instanceof Error ? erro.message : erro}`)
  }

  const falhas = resultados.filter((r) => !r.passou)
  if (falhas.length) {
    console.log(`\n  \x1b[31m${falhas.length} verificação(ões) falharam.\x1b[0m\n`)
    process.exit(1)
  }
  console.log(`\n  \x1b[32m${resultados.length} verificações de isolamento passaram.\x1b[0m\n`)
}
