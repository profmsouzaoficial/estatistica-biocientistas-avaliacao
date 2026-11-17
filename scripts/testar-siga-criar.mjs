#!/usr/bin/env node
/**
 * “Criar no SIGA” não pode criar duas vezes.
 *
 *   pnpm test:siga:criar
 *
 * Criar avaliação é a única escrita do app que muda estrutura no SIGA — e o SIGA
 * não tem rota para apagar. Um clique duplo, um F5 depois de um timeout ou um
 * professor impaciente deixariam “Trabalho sobre Probabilidades” duplicado numa
 * disciplina real, para sempre.
 *
 * O teste sobe um SIGA falso e um Supabase falso (banco + login + auditoria) e
 * chama a rota de verdade, por HTTP. O que se mede: quantas vezes o SIGA foi
 * chamado, o que a auditoria guardou e qual mensagem o professor recebe.
 */
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const pasta = join(raiz, '.temp-api')
await mkdir(pasta, { recursive: true })

const { build } = await import('esbuild')
const saida = join(pasta, 'siga-avaliacao.mjs')
const bundle = await build({
  entryPoints: [join(raiz, 'api', 'siga', 'avaliacao.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'error',
})
await writeFile(saida, bundle.outputFiles[0].text)

// ---------------------------------------------------------------------------
// Mundo falso: Supabase + SIGA no mesmo servidor
// ---------------------------------------------------------------------------
const estado = {
  papel: 'professor',
  avaliacao: {
    id: 'av-1',
    turma_id: 'turma-1',
    titulo: 'Redação 1 — Testes diagnósticos',
    descricao_siga: 'TVC 3',
    peso_siga: 30,
    data_siga: '2026-11-20',
  },
  turma: { id: 'turma-1', codigo_siga: 'CBV018GV-A', periodo: '2026/3' },
  auditoria: [],
  proximoId: 1,
  sigaChamadas: 0,
  sigaModo: 'ok',
  ultimoPedidoSiga: null,
}

const agora = () => new Date().toISOString()

const upstream = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  let corpo = ''
  for await (const parte of req) corpo += parte
  const json = (status, dados) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(dados))
  }
  const post = corpo ? JSON.parse(corpo) : null

  // Supabase Auth
  if (url.pathname === '/auth/v1/user') return json(200, { id: 'prof-1', email: 'marcio.souza@ufjf.br' })

  // Supabase REST
  if (url.pathname === '/rest/v1/profiles') {
    return json(200, [
      {
        id: 'prof-1',
        papel: estado.papel,
        nome_completo: 'Marcio Souza',
        matricula: null,
        turma_id: estado.turma.id,
      },
    ])
  }
  if (url.pathname === '/rest/v1/avaliacoes') return json(200, [{ ...estado.avaliacao }])
  if (url.pathname === '/rest/v1/turmas') return json(200, [{ ...estado.turma }])

  if (url.pathname === '/rest/v1/auditoria') {
    if (req.method === 'GET') {
      const acao = (url.searchParams.get('acao') ?? 'eq.').replace(/^eq\./, '')
      const entidade = (url.searchParams.get('entidade_id') ?? 'eq.').replace(/^eq\./, '')
      const linhas = estado.auditoria
        .filter((a) => a.acao === acao && a.entidade_id === entidade)
        .sort((a, b) => (a.criado_em < b.criado_em ? 1 : a.criado_em > b.criado_em ? -1 : b.id - a.id))
      return json(200, linhas.slice(0, 1))
    }
    if (req.method === 'POST') {
      const linha = { id: estado.proximoId++, criado_em: agora(), ...post }
      estado.auditoria.push(linha)
      return json(201, [linha])
    }
    if (req.method === 'PATCH') {
      const id = Number((url.searchParams.get('id') ?? '').replace(/^eq\./, ''))
      const linha = estado.auditoria.find((a) => a.id === id)
      if (!linha) return json(404, { message: 'não achei' })
      Object.assign(linha, post)
      return json(200, [linha])
    }
  }

  // SIGA
  if (url.pathname === '/api/criar-avaliacao' && req.method === 'POST') {
    estado.sigaChamadas++
    estado.ultimoPedidoSiga = post
    if (estado.sigaModo === 'erro') return json(422, { detail: 'Já existe uma avaliação com essa descrição.' })
    return json(200, { id: 500 + estado.sigaChamadas, mensagem: 'criada' })
  }

  json(404, { message: `sem rota: ${req.method} ${url.pathname}` })
})
await new Promise((ok) => upstream.listen(0, '127.0.0.1', ok))
const BASE = `http://127.0.0.1:${upstream.address().port}`

process.env.SUPABASE_URL = BASE
process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-servico'
process.env.SUPABASE_ANON_KEY = 'chave-anon'
process.env.SIGA_API_BASE = BASE
process.env.SIGA_API_KEY = 'siga-teste'
process.env.SIGA_ESCALA = 'pontos'

const rota = (await import(pathToFileURL(saida).href)).default
const app = createServer((req, res) => {
  rota(req, res)
})
await new Promise((ok) => app.listen(0, '127.0.0.1', ok))
const API = `http://127.0.0.1:${app.address().port}`

async function chamar(corpo, token = 'token-professor') {
  const r = await fetch(API, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const texto = await r.text()
  let dados = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }
  return { status: r.status, dados }
}

// ---------------------------------------------------------------------------
let falhas = 0
let total = 0
function conferir(nome, condicao, detalhe = '') {
  total++
  const marca = condicao ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${marca} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  if (!condicao) falhas++
}

console.log('\n  Criar no SIGA · uma vez só, com auditoria\n')

// 1. primeira criação
let r = await chamar({ avaliacao_id: 'av-1' })
conferir('primeira criação responde 200', r.status === 200, String(r.status))
conferir('e diz que não é repetição', r.dados?.repetido === false, String(r.dados?.repetido))
conferir('o SIGA foi chamado uma vez', estado.sigaChamadas === 1, `${estado.sigaChamadas} chamada(s)`)
conferir('a descrição vai como está no banco', estado.ultimoPedidoSiga?.descricao === 'TVC 3', estado.ultimoPedidoSiga?.descricao)
conferir('o número da TVC foi extraído', estado.ultimoPedidoSiga?.num_tvc === 3, String(estado.ultimoPedidoSiga?.num_tvc))
conferir('o peso vai junto', estado.ultimoPedidoSiga?.peso === 30, String(estado.ultimoPedidoSiga?.peso))
conferir('a data vai em DD/MM/AAAA', estado.ultimoPedidoSiga?.data === '20/11/2026', estado.ultimoPedidoSiga?.data)
conferir('o período da turma vai junto', estado.ultimoPedidoSiga?.periodo === '2026/3', String(estado.ultimoPedidoSiga?.periodo))
conferir('a auditoria guardou o sucesso', estado.auditoria.length === 1 && estado.auditoria[0].detalhe.estado === 'ok', String(estado.auditoria.length))
conferir('com o autor certo', estado.auditoria[0].ator === 'prof-1', String(estado.auditoria[0].ator))
conferir('e o pedido enviado', estado.auditoria[0].detalhe.pedido?.descricao === 'TVC 3', JSON.stringify(estado.auditoria[0].detalhe.pedido ?? null))

// 2. clique duplo / repetição idêntica
r = await chamar({ avaliacao_id: 'av-1' })
conferir('repetir o mesmo pedido responde 200', r.status === 200, String(r.status))
conferir('e avisa que é repetição', r.dados?.repetido === true, String(r.dados?.repetido))
conferir('sem chamar o SIGA de novo', estado.sigaChamadas === 1, `${estado.sigaChamadas} chamada(s)`)
conferir('sem gravar auditoria nova', estado.auditoria.length === 1, String(estado.auditoria.length))

// 3. pedido diferente: criar de novo duplicaria
estado.avaliacao.peso_siga = 40
r = await chamar({ avaliacao_id: 'av-1' })
conferir('peso diferente sem confirmar vira 409', r.status === 409, String(r.status))
conferir('com código SIGA_JA_CRIADA', r.dados?.codigo === 'SIGA_JA_CRIADA', String(r.dados?.codigo))
conferir('a mensagem avisa que vai duplicar', /duplicar/i.test(r.dados?.erro ?? ''), (r.dados?.erro ?? '').slice(0, 70))
conferir('o SIGA continua com uma chamada', estado.sigaChamadas === 1, `${estado.sigaChamadas} chamada(s)`)

// 4. confirmação explícita
r = await chamar({ avaliacao_id: 'av-1', forcar: true })
conferir('com forcar:true cria de novo', r.status === 200 && estado.sigaChamadas === 2, `${r.status} · ${estado.sigaChamadas}`)
conferir('a nova tentativa usa o peso novo', estado.ultimoPedidoSiga?.peso === 40, String(estado.ultimoPedidoSiga?.peso))
conferir('e fica registrada na auditoria', estado.auditoria.length === 2, String(estado.auditoria.length))

// 5. falha do SIGA não bloqueia a próxima tentativa
estado.auditoria = []
estado.sigaChamadas = 0
estado.avaliacao.peso_siga = 30
estado.sigaModo = 'erro'
r = await chamar({ avaliacao_id: 'av-1' })
conferir('recusa do SIGA chega como erro', r.status === 502, String(r.status))
conferir('com código SIGA_RECUSOU', r.dados?.codigo === 'SIGA_RECUSOU', String(r.dados?.codigo))
conferir('e fica na auditoria como falha', estado.auditoria[0]?.detalhe?.estado === 'falha', String(estado.auditoria[0]?.detalhe?.estado))
conferir('guardando o status do SIGA', estado.auditoria[0]?.detalhe?.http_status === 422, String(estado.auditoria[0]?.detalhe?.http_status))
estado.sigaModo = 'ok'
r = await chamar({ avaliacao_id: 'av-1' })
conferir('tentar de novo depois da falha é permitido', r.status === 200 && estado.sigaChamadas === 2, `${r.status} · ${estado.sigaChamadas}`)

// 6. requisição em andamento
estado.auditoria.push({
  id: 99,
  criado_em: agora(),
  acao: 'siga.criar-avaliacao',
  entidade: 'avaliacoes',
  entidade_id: 'av-1',
  detalhe: { estado: 'andamento', pedido: { descricao: 'TVC 3' } },
})
const antes = estado.sigaChamadas
r = await chamar({ avaliacao_id: 'av-1' })
conferir('pedido em andamento vira 409', r.status === 409, String(r.status))
conferir('com código SIGA_EM_ANDAMENTO', r.dados?.codigo === 'SIGA_EM_ANDAMENTO', String(r.dados?.codigo))
conferir('sem chegar ao SIGA', estado.sigaChamadas === antes, `${estado.sigaChamadas} chamada(s)`)

// 7. criação abandonada (>2 min) não trava para sempre
estado.auditoria[estado.auditoria.length - 1].criado_em = new Date(Date.now() - 5 * 60_000).toISOString()
r = await chamar({ avaliacao_id: 'av-1', forcar: true })
conferir('registro velho de andamento é ignorado', r.status === 200, String(r.status))

// 8. validações continuam valendo
estado.avaliacao.descricao_siga = 'Revisão de probabilidades'
r = await chamar({ avaliacao_id: 'av-1', forcar: true })
conferir('sem número de TVC responde 422', r.status === 422 && r.dados?.codigo === 'SEM_NUMERO_TVC', `${r.status} ${r.dados?.codigo}`)
estado.avaliacao.descricao_siga = 'TVC 3'

estado.papel = 'aluno'
r = await chamar({ avaliacao_id: 'av-1' })
conferir('aluno não cria avaliação', r.status === 403 && r.dados?.codigo === 'SOMENTE_PROFESSOR', `${r.status} ${r.dados?.codigo}`)
estado.papel = 'professor'

r = await chamar({})
conferir('sem avaliacao_id responde 400', r.status === 400, String(r.status))

// 9. data ausente usa hoje (formato DD/MM/AAAA)
estado.auditoria = []
estado.sigaChamadas = 0
estado.avaliacao.data_siga = null
await chamar({ avaliacao_id: 'av-1' })
conferir('sem data usa hoje em DD/MM/AAAA', /^\d{2}\/\d{2}\/\d{4}$/.test(estado.ultimoPedidoSiga?.data ?? ''), estado.ultimoPedidoSiga?.data)

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) de “criar no SIGA” falharam\x1b[0m\n`)
} else {
  console.log(`  \x1b[32m✓ ${total} verificações de “criar no SIGA” passaram\x1b[0m\n`)
}

app.closeAllConnections()
upstream.closeAllConnections()
app.close()
upstream.close()
process.exit(falhas ? 1 : 0)
