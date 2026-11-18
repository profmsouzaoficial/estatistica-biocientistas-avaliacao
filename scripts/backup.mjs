#!/usr/bin/env node
/**
 * Backup completo do banco (e, opcionalmente, das fotos) para um arquivo JSON.
 *
 * Por que existe: nota de aluno é documento. Se a conta do Supabase for suspensa,
 * se alguém apagar uma turma por engano ou se uma migration der errado, o dado
 * precisa existir em outro lugar — e o arquivo tem de ser legível sem este app.
 *
 * Uso:
 *   pnpm backup                → backups/AAAA-MM-DDTHH-MM.json
 *   pnpm backup --fotos        → também baixa as fotos do bucket privado
 *   pnpm backup --dir /caminho → grava em outra pasta
 *
 * O arquivo usa a service role, então contém dados pessoais: fica em backups/
 * (ignorado pelo git) e não deve ser compartilhado.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { carregarEnv, chaveServico, raiz, supabaseRest, urlSupabase } from './_env.mjs'

const origens = carregarEnv()
console.log('\n  Backup · Análise de Dados para Biocientistas')
if (origens.length) console.log(`  env: ${origens.join(', ')}`)
console.log(`  projeto: ${urlSupabase()}`)

const argumentos = process.argv.slice(2)
const lerArg = (nome) => {
  const i = argumentos.indexOf(nome)
  return i >= 0 ? argumentos[i + 1] : undefined
}
const comFotos = argumentos.includes('--fotos')
const dir = lerArg('--dir') ?? join(raiz, 'backups')

// A ordem importa só para leitura humana: as "pai" primeiro.
const tabelas = [
  'turmas',
  'professores_autorizados',
  'alunos_esperados',
  'profiles',
  'avaliacoes',
  'submissoes',
  'correcoes',
  'lancamentos_siga',
  'frequencias',
  'auditoria',
]

const agora = new Date()
const carimbo = agora.toISOString().slice(0, 16).replace(/[:T]/g, '-')

async function baixarTabela(nome) {
  // O PostgREST corta em 1000 linhas por padrão; paginamos para não perder nada.
  const pagina = 1000
  const todas = []
  for (let inicio = 0; ; inicio += pagina) {
    const fim = inicio + pagina - 1
    const linhas = await supabaseRest(`${nome}?select=*&order=id&offset=${inicio}&limit=${pagina}`, {
      prefer: 'count=exact',
    }).catch((e) => {
      // Tabela sem coluna `id` ou inexistente: tenta sem ordenação.
      if (String(e.message).includes('id')) return supabaseRest(`${nome}?select=*&offset=${inicio}&limit=${pagina}`)
      throw e
    })
    const lista = Array.isArray(linhas) ? linhas : []
    todas.push(...lista)
    if (lista.length < pagina) break
  }
  return todas
}

const dados = {}
for (const tabela of tabelas) {
  try {
    dados[tabela] = await baixarTabela(tabela)
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro)
    // Numa instalação nova alguma tabela pode não existir ainda: avisa e segue.
    if (mensagem.includes('does not exist') || mensagem.includes('PGRST205')) {
      dados[tabela] = []
      console.log(`  · ${tabela}: tabela ainda não existe`)
      continue
    }
    throw erro
  }
}

const contagens = Object.fromEntries(Object.entries(dados).map(([t, linhas]) => [t, linhas.length]))

await mkdir(dir, { recursive: true })
const arquivo = join(dir, `backup-${carimbo}.json`)
await writeFile(
  arquivo,
  JSON.stringify(
    {
      gerado_em: agora.toISOString(),
      projeto: urlSupabase(),
      aplicacao: 'Avaliações — Análise de Dados para Biocientistas',
      contagens,
      tabelas: dados,
    },
    null,
    2,
  ),
)

console.log('\n  Tabelas:')
for (const [tabela, n] of Object.entries(contagens)) console.log(`    ${tabela.padEnd(24)} ${n}`)
console.log(`\n  ✓ ${arquivo}`)

if (comFotos) {
  const bucket = 'redacoes'
  const pastaFotos = join(dir, `fotos-${carimbo}`)
  await mkdir(pastaFotos, { recursive: true })

  async function listar(prefixo) {
    const resposta = await fetch(`${urlSupabase()}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: {
        apikey: chaveServico(),
        Authorization: `Bearer ${chaveServico()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: prefixo, limit: 100, offset: 0, sortBy: { column: 'name', order: 'asc' } }),
    })
    if (!resposta.ok) throw new Error(`Storage recusou a listagem: ${resposta.status} ${(await resposta.text()).slice(0, 160)}`)
    return resposta.json()
  }

  let baixadas = 0
  const pastasDoAluno = (await listar('')).filter((o) => !o.metadata || o.id === null)
  for (const pasta of pastasDoAluno) {
    const arquivos = (await listar(pasta.name)).filter((o) => o.id && o.metadata)
    for (const arquivoFoto of arquivos) {
      const caminho = `${pasta.name}/${arquivoFoto.name}`
      const resposta = await fetch(`${urlSupabase()}/storage/v1/object/${bucket}/${caminho}`, {
        headers: { apikey: chaveServico(), Authorization: `Bearer ${chaveServico()}` },
      })
      if (!resposta.ok) {
        console.log(`    ⚠ ${caminho}: ${resposta.status}`)
        continue
      }
      const destino = join(pastaFotos, pasta.name)
      await mkdir(destino, { recursive: true })
      await writeFile(join(destino, arquivoFoto.name), Buffer.from(await resposta.arrayBuffer()))
      baixadas++
    }
  }
  console.log(`  ✓ ${baixadas} foto(s) em ${pastaFotos}`)
}

console.log('\n  Guarde este arquivo fora do repositório: ele tem dados pessoais dos alunos.\n')
