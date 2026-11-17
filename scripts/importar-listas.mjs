/**
 * Pré-cadastro das turmas e dos alunos a partir das listas do SIGA.
 *
 *   pnpm importar:listas -- --pasta ~/.dsh/dados/2026-3 --ensaio
 *   pnpm importar:listas -- --pasta ~/.dsh/dados/2026-3
 *
 * O que faz, por turma encontrada na pasta (nome do arquivo = código do SIGA):
 *   1. cria/atualiza a turma (disciplina, horário, período);
 *   2. cria/atualiza a lista de alunos esperados (matrícula, nome, e-mail);
 *   3. cria a conta de cada aluno com login = e-mail e senha inicial = e-mail;
 *   4. marca `precisa_trocar_senha`, para o app pedir a troca no primeiro acesso.
 *
 * É idempotente: quem já tem conta não é recriado nem tem a senha trocada.
 * Use `--redefinir-senhas` só quando quiser devolver a senha inicial a todos.
 */
import { readdir, readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'

import { carregarEnv } from './_env.mjs'

carregarEnv()

const SUPA = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY
const PERIODO = '2026/3'

/** Nome de exibição e horário vêm do cabeçalho da FAE; aqui ficam só os metadados. */
const TURMAS = {
  'CBV018GV-A': {
    disciplina: 'Introdução à Bioestatística e à Ciência de Dados na Saúde',
    horario: 'Sexta-feira, 15:00 às 18:00 — Sala 8',
    curso: 'Ciências Biológicas',
  },
  'CBV018GV-B': {
    disciplina: 'Introdução à Bioestatística e à Ciência de Dados na Saúde',
    horario: 'Quinta-feira, 08:00 às 11:00 — Sala 4',
    curso: 'Ciências Biológicas',
  },
  'CBV044GV-A': {
    disciplina: 'Noções de Bioestatística',
    horario: 'Sexta-feira, 14:00 às 15:00 — Sala 8',
    curso: 'Ciências Biológicas',
  },
  'EST006GV-A': {
    disciplina: 'Bioestatística',
    horario: 'Sexta-feira, 15:00 às 18:00 — Sala 8',
    curso: 'Ciências Biológicas',
  },
}

if (!SUPA || !SERVICO) {
  console.error('\n✗ Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (rode com o arquivo de segredos).\n')
  process.exit(1)
}

const args = process.argv.slice(2)
const valor = (nome) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : undefined
}
const ENSAIO = args.includes('--ensaio')
const REDEFINIR = args.includes('--redefinir-senhas')
const pasta = valor('--pasta') ?? join(homedir(), '.dsh', 'dados', '2026-3')

const cabecalhos = {
  apikey: SERVICO,
  Authorization: `Bearer ${SERVICO}`,
  'Content-Type': 'application/json',
}

async function rest(caminho, opcoes = {}) {
  const resposta = await fetch(`${SUPA}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: { ...cabecalhos, ...(opcoes.headers ?? {}) },
  })
  const texto = await resposta.text()
  if (!resposta.ok) throw new Error(`${caminho} → HTTP ${resposta.status}: ${texto.slice(0, 240)}`)
  return texto ? JSON.parse(texto) : null
}

async function auth(caminho, opcoes = {}) {
  const resposta = await fetch(`${SUPA}/auth/v1/${caminho}`, {
    ...opcoes,
    headers: { ...cabecalhos, ...(opcoes.headers ?? {}) },
  })
  const texto = await resposta.text()
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null }
}

function lerCsv(bruto) {
  const texto = new TextDecoder('windows-1252').decode(bruto)
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim())
  const cabecalho = linhas[0].split(';').map((c) => c.trim())
  return linhas.slice(1).map((linha) => {
    const campos = linha.split(';')
    const registro = {}
    cabecalho.forEach((nome, i) => (registro[nome] = (campos[i] ?? '').trim()))
    return registro
  })
}

/** Cria a conta com senha inicial = e-mail. O trigger do banco cria o profile. */
async function criarConta(aluno, turmaId) {
  const { status, corpo } = await auth('admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email: aluno.email,
      password: aluno.email,
      email_confirm: true,
      user_metadata: {
        nome_completo: aluno.nome,
        matricula: aluno.matricula,
        turma_id: turmaId,
      },
    }),
  })
  if (status === 200 || status === 201) return corpo
  if (corpo?.error_code === 'email_exists' || corpo?.msg?.includes('already')) {
    return { existente: true }
  }
  throw new Error(`criar conta ${aluno.email} → HTTP ${status}: ${JSON.stringify(corpo).slice(0, 240)}`)
}

async function contasExistentes() {
  const mapa = new Map()
  for (let pagina = 1; pagina <= 20; pagina++) {
    const { corpo } = await auth(`admin/users?page=${pagina}&per_page=200`)
    const usuarios = corpo?.users ?? []
    for (const u of usuarios) if (u.email) mapa.set(u.email.toLowerCase(), u)
    if (usuarios.length < 200) break
  }
  return mapa
}

const arquivos = (await readdir(pasta)).filter((f) => /^[A-Z]{3}\d{3}GV_[AB]_\d{4}_\d\.csv$/i.test(f))
if (!arquivos.length) {
  console.error(`\n✗ Nenhum CSV de turma em ${pasta}. Esperado algo como CBV018GV_A_2026_3.csv.\n`)
  process.exit(1)
}

console.log(`\nPré-cadastro · ${ENSAIO ? 'ENSAIO (nada será gravado)' : 'valendo'}`)
console.log(`pasta: ${pasta} · ${arquivos.length} turma(s)\n`)

const contas = await contasExistentes()
let totalAlunos = 0
let criadas = 0
let jaTinham = 0
let semEmail = 0

for (const arquivo of arquivos.sort()) {
  // CBV018GV_A_2026_3.csv → CBV018GV-A
  const codigo = basename(arquivo).split('_').slice(0, 2).join('-')
  const meta = TURMAS[codigo]
  if (!meta) {
    console.warn(`  ⚠ ${codigo}: sem metadados em TURMAS — pulando`)
    continue
  }
  const linhas = lerCsv(await readFile(join(pasta, arquivo)))
  const alunos = linhas
    .map((l) => ({
      matricula: (l.MATRICULA ?? '').trim(),
      nome: (l.NOME ?? '').replace(/\s+/g, ' ').replace(/\.+$/, '').trim(),
      email: (l['E-MAIL CONTA GSUITE'] || l['E-MAIL DE CONTATO'] || '').trim().toLowerCase(),
      situacao: (l.SITUACAO ?? '').trim(),
    }))
    .filter((a) => a.matricula && a.nome)

  console.log(`  ${codigo} · ${alunos.length} aluno(s) · ${meta.disciplina}`)
  if (ENSAIO) {
    totalAlunos += alunos.length
    semEmail += alunos.filter((a) => !a.email).length
    continue
  }

  const [turma] = await rest('turmas?on_conflict=codigo_siga,periodo', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify([
      {
        nome: meta.disciplina,
        disciplina: meta.disciplina,
        horario: meta.horario,
        curso: meta.curso,
        codigo_siga: codigo,
        periodo: PERIODO,
        ativo: true,
      },
    ]),
  })

  for (const aluno of alunos) {
    totalAlunos++
    if (!aluno.email) {
      semEmail++
      console.warn(`     ⚠ ${aluno.matricula}: sem e-mail na lista — conta não criada`)
      continue
    }

    const [esperado] = await rest('alunos_esperados?on_conflict=turma_id,matricula', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify([
        {
          turma_id: turma.id,
          matricula: aluno.matricula,
          nome_completo: aluno.nome,
          email: aluno.email,
        },
      ]),
    })

    if (esperado.user_id && !REDEFINIR) {
      jaTinham++
      continue
    }

    const existente = contas.get(aluno.email)
    if (existente) {
      // Conta já existe no Auth (de uma rodada anterior): só religa a lista.
      await rest('alunos_esperados?turma_id=eq.' + turma.id + '&matricula=eq.' + encodeURIComponent(aluno.matricula), {
        method: 'PATCH',
        body: JSON.stringify({ user_id: existente.id, email: aluno.email }),
      })
      await rest('profiles?id=eq.' + existente.id, {
        method: 'PATCH',
        body: JSON.stringify({ precisa_trocar_senha: true, turma_id: turma.id }),
      })
      if (REDEFINIR) {
        await auth(`admin/users/${existente.id}`, {
          method: 'PUT',
          body: JSON.stringify({ password: aluno.email }),
        })
      }
      jaTinham++
      continue
    }

    const criado = await criarConta(aluno, turma.id)
    if (criado?.existente) {
      console.warn(`     ⚠ ${aluno.email} já existe no Auth mas não está na lista — confira manualmente`)
      jaTinham++
      continue
    }
    await rest('profiles?id=eq.' + criado.id, {
      method: 'PATCH',
      body: JSON.stringify({ precisa_trocar_senha: true }),
    })
    criadas++
    process.stdout.write('.')
  }
  console.log('')
}

console.log(`\n  alunos na lista .... ${totalAlunos}`)
console.log(`  contas criadas ..... ${criadas}`)
console.log(`  já tinham conta .... ${jaTinham}`)
console.log(`  sem e-mail ......... ${semEmail}`)
console.log(
  ENSAIO
    ? '\n  Ensaio: nada gravado. Rode sem --ensaio para valer.\n'
    : '\n  ✓ Pronto. Login = e-mail institucional · senha inicial = o mesmo e-mail.\n',
)
