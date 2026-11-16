#!/usr/bin/env node
/**
 * Testa o `pnpm configurar:ia` no pedaço que ele pode estragar: o arquivo de
 * segredos.
 *
 *   pnpm test:configuracao
 *
 * O arquivo `~/.dsh/secrets/avaliacoes.env` guarda Supabase, SIGA, Vercel e (a
 * partir de hoje) a IA. Se o script reescrevesse o arquivo errado, apagasse uma
 * linha ou duplicasse uma chave, a configuração que já funciona iria embora junto.
 * Por isso o teste usa um arquivo temporário e confere linha por linha.
 */
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const raiz = join(import.meta.dirname, '..')
const verificacoes = []

function conferir(nome, ok, detalhe = '') {
  verificacoes.push(ok)
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
}

function rodar(arquivo, extra = []) {
  return spawnSync(
    'node',
    [
      join(raiz, 'scripts/configurar-ia.mjs'),
      '--arquivo',
      arquivo,
      '--somente-arquivo',
      '--base',
      'https://llm.exemplo/v1',
      '--modelo',
      'Qwen2.5-7B-Instruct',
      '--chave',
      'sk-nova-chave-987654',
      ...extra,
    ],
    { cwd: raiz, encoding: 'utf8' },
  )
}

const lerEnv = (arquivo) => {
  const mapa = new Map()
  for (const linha of readFileSync(arquivo, 'utf8').split(/\r?\n/)) {
    const igual = linha.indexOf('=')
    if (igual > 0 && !linha.trim().startsWith('#')) mapa.set(linha.slice(0, igual).trim(), linha.slice(igual + 1))
  }
  return mapa
}

console.log('\n  Configurar a IA · integridade do arquivo de segredos\n')

// ---- 1. arquivo novo --------------------------------------------------------
const pasta = mkdtempSync(join(tmpdir(), 'cfg-'))
const novo = join(pasta, 'novo.env')
const r1 = rodar(novo)
conferir('arquivo novo é criado', r1.status === 0, `exit ${r1.status}`)
const mapaNovo = lerEnv(novo)
conferir('grava LLM_BASE_URL', mapaNovo.get('LLM_BASE_URL') === 'https://llm.exemplo/v1', mapaNovo.get('LLM_BASE_URL'))
conferir('grava LLM_MODEL', mapaNovo.get('LLM_MODEL') === 'Qwen2.5-7B-Instruct')
conferir('grava LLM_API_KEY', mapaNovo.get('LLM_API_KEY') === 'sk-nova-chave-987654')
conferir('não grava VISION_* sem --visao-modelo', !mapaNovo.has('VISION_MODEL'))
conferir('permissão 600 (só o dono lê)', (statSync(novo).mode & 0o777) === 0o600, (statSync(novo).mode & 0o777).toString(8))

// ---- 2. arquivo existente: preserva o resto, atualiza a chave --------------
const existente = join(pasta, 'existente.env')
writeFileSync(
  existente,
  [
    '# segredos do projeto',
    'SUPABASE_URL=https://abc.supabase.co',
    'SUPABASE_SERVICE_ROLE_KEY=chave-antiga',
    '',
    'LLM_MODEL=llama3:latest',
    'SIGA_API_KEY=outra-chave',
    '',
  ].join('\n'),
)
const r2 = rodar(existente)
conferir('rodar sobre arquivo existente não falha', r2.status === 0, `exit ${r2.status}`)
const mapaExistente = lerEnv(existente)
const linhas = readFileSync(existente, 'utf8').split(/\r?\n/)
conferir('mantém SUPABASE_URL', mapaExistente.get('SUPABASE_URL') === 'https://abc.supabase.co')
conferir('mantém SUPABASE_SERVICE_ROLE_KEY', mapaExistente.get('SUPABASE_SERVICE_ROLE_KEY') === 'chave-antiga')
conferir('mantém SIGA_API_KEY', mapaExistente.get('SIGA_API_KEY') === 'outra-chave')
conferir('atualiza LLM_MODEL no lugar', mapaExistente.get('LLM_MODEL') === 'Qwen2.5-7B-Instruct', mapaExistente.get('LLM_MODEL'))
conferir('LLM_MODEL aparece uma vez só', linhas.filter((l) => l.startsWith('LLM_MODEL=')).length === 1)
conferir('mantém os comentários', linhas.some((l) => l.startsWith('# segredos do projeto')))

// ---- 3. visão no mesmo serviço ---------------------------------------------
const comVisao = join(pasta, 'visao.env')
const r3 = rodar(comVisao, ['--visao-modelo', 'Qwen2.5-VL-7B-Instruct'])
const mapaVisao = lerEnv(comVisao)
conferir('com --visao-modelo grava VISION_MODEL', mapaVisao.get('VISION_MODEL') === 'Qwen2.5-VL-7B-Instruct', `exit ${r3.status}`)
conferir('VISION_PROVIDER vira openai', mapaVisao.get('VISION_PROVIDER') === 'openai')
conferir('VISION_BASE_URL herda a base do LLM', mapaVisao.get('VISION_BASE_URL') === 'https://llm.exemplo/v1')
conferir('VISION_API_KEY herda a chave do LLM', mapaVisao.get('VISION_API_KEY') === 'sk-nova-chave-987654')

// ---- 4. visão em outro serviço ---------------------------------------------
const visaoSeparada = join(pasta, 'visao2.env')
rodar(visaoSeparada, ['--visao-modelo', 'gemini-2.5-flash', '--visao-base', 'https://outro/v1', '--visao-chave', 'sk-visao'])
const mapa2 = lerEnv(visaoSeparada)
conferir('visão em outro serviço não contamina o LLM', mapa2.get('LLM_BASE_URL') === 'https://llm.exemplo/v1')
conferir('visão em outro serviço usa a própria base', mapa2.get('VISION_BASE_URL') === 'https://outro/v1')
conferir('visão em outro serviço usa a própria chave', mapa2.get('VISION_API_KEY') === 'sk-visao')

// ---- 5. ensaio não escreve nada --------------------------------------------
const naoDeveExistir = join(pasta, 'ensaio.env')
const r5 = spawnSync(
  'node',
  [
    join(raiz, 'scripts/configurar-ia.mjs'),
    '--ensaio',
    '--arquivo',
    naoDeveExistir,
    '--base',
    'https://llm.exemplo/v1',
    '--modelo',
    'X',
    '--chave',
    'sk-1',
  ],
  { cwd: raiz, encoding: 'utf8' },
)
conferir('--ensaio não cria arquivo', r5.status === 0 && !existsSync(naoDeveExistir), `exit ${r5.status}`)
conferir('--ensaio explica o plano', r5.stdout.includes('nenhum arquivo foi escrito'))

// ---- 6. sem dados, explica o uso e sai com erro ----------------------------
const r6 = spawnSync('node', [join(raiz, 'scripts/configurar-ia.mjs')], { cwd: raiz, encoding: 'utf8' })
conferir('sem argumentos, falha com instrução', r6.status === 1 && r6.stderr.includes('pnpm configurar:ia'))

const falhas = verificacoes.filter((v) => !v).length
console.log('')
if (falhas) {
  console.log(`\x1b[31m${falhas} de ${verificacoes.length} verificações falharam.\x1b[0m\n`)
  process.exit(1)
}
console.log(`\x1b[32m${verificacoes.length} verificações da configuração passaram.\x1b[0m\n`)
