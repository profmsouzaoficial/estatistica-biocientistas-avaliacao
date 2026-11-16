#!/usr/bin/env node
/**
 * Toda chamada externa precisa de prazo — e de um erro que diga o que fazer.
 *
 *   pnpm test:rede
 *
 * O banco, o Storage, o login, o SIGA e o OCR não tinham prazo: se um deles
 * engasgava, a função da Vercel era morta pela plataforma e o navegador recebia
 * um 504 **sem corpo**. A tela mostrava "erro de rede" e o professor tentava de
 * novo, sem saber se o problema era o Supabase, o SIGA ou o modelo.
 *
 * Aqui um servidor local faz o papel de cada serviço e responde o que o caso
 * precisa: devagar até estourar o prazo, recusar a conexão, devolver 500 com
 * mensagem. O que se verifica é o **código** e a **mensagem** que chegam ao app,
 * e o tempo: um prazo de 700 ms tem de desistir em menos de 2 s.
 */
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const pasta = join(raiz, '.temp-api')
await mkdir(pasta, { recursive: true })

const { build } = await import('esbuild')
async function carregar(entrada, nome) {
  const arquivo = join(pasta, `${nome}.mjs`)
  const saida = await build({
    entryPoints: [join(raiz, 'api', '_lib', entrada)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'error',
  })
  await writeFile(arquivo, saida.outputFiles[0].text)
  return import(pathToFileURL(arquivo).href)
}

const http = await carregar('http.ts', 'http-rede')
const siga = await carregar('siga.ts', 'siga-rede')
const ocr = await carregar('transcrever.ts', 'ocr-rede')

// ---- servidor programável ---------------------------------------------------
const estado = { modo: 'ok', pedidos: 0 }

const servidor = createServer(async (req, res) => {
  res.on('error', () => {})
  estado.pedidos++
  for await (const _ of req) {
    /* drena o corpo */
  }

  const json = (status, objeto) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(objeto))
  }

  switch (estado.modo) {
    case 'ok':
      return json(200, [{ id: 'aluno-1', nome: 'Ana' }])
    case 'demora':
      await new Promise((ok) => setTimeout(ok, 5000))
      return json(200, [])
    case 'erro500':
      return json(500, { message: 'relation "alunos" does not exist' })
    case 'texto503':
      res.writeHead(503, { 'content-type': 'text/html' })
      return res.end('<html>Service Unavailable</html>')
    case 'corpoTravado':
      // cabeçalho Ok e corpo que nunca termina: o prazo tem de cobrir a leitura
      res.writeHead(200, { 'content-type': 'application/json' })
      res.write('[')
      return new Promise(() => {})
    case 'sigaOk':
      return json(200, { ok: true })
    case 'ocrOk':
      return json(200, {
        choices: [
          {
            message: {
              content:
                'A sensibilidade de um teste diagnóstico é a proporção de pessoas doentes que o teste ' +
                'identifica corretamente. A especificidade é a proporção de pessoas sadias que o teste ' +
                'classifica como negativas. Um teste com alta sensibilidade erra pouco ao excluir a doença, ' +
                'mas costuma produzir mais resultados falsos positivos quando aplicado em população de baixa ' +
                'prevalência, o que exige confirmação por um segundo exame.',
            },
          },
        ],
      })
  }
})

await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
const BASE = `http://127.0.0.1:${servidor.address().port}`

const fechado = createServer(() => {})
await new Promise((ok) => fechado.listen(0, '127.0.0.1', ok))
const PORTA_FECHADA = fechado.address().port
await new Promise((ok) => fechado.close(ok))

// ---- utilidades -------------------------------------------------------------
let falhas = 0
let total = 0
function conferir(nome, condicao, detalhe = '') {
  total++
  const marca = condicao ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${marca} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  if (!condicao) falhas++
}

const ambienteOriginal = { ...process.env }
function ambienteURL(url = BASE, extra = {}) {
  process.env.SUPABASE_URL = url
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste'
  process.env.SUPABASE_ANON_KEY = 'anon-teste'
  process.env.SIGA_API_BASE = url
  process.env.SIGA_API_KEY = 'siga-teste'
  process.env.VISION_PROVIDER = 'openai'
  process.env.VISION_API_KEY = 'vision-teste'
  process.env.VISION_BASE_URL = `${url}/v1`
  process.env.HTTP_TIMEOUT_MS = '700'
  process.env.STORAGE_TIMEOUT_MS = '700'
  process.env.OCR_TIMEOUT_MS = '700'
  process.env.SIGA_TIMEOUT_MS = '700'
  Object.assign(process.env, extra)
}

async function capturar(fn) {
  const inicio = Date.now()
  try {
    await fn()
    return { erro: null, ms: Date.now() - inicio }
  } catch (erro) {
    return { erro, ms: Date.now() - inicio }
  }
}

console.log('\n  Rede · prazo, código e mensagem em cada serviço externo\n')

// 1. caminho normal continua funcionando
ambienteURL()
estado.modo = 'ok'
const lista = await http.selecionar('alunos', 'select=*')
conferir('uma resposta normal passa', lista?.[0]?.nome === 'Ana', JSON.stringify(lista))

// 2. banco que não responde
estado.modo = 'demora'
let r = await capturar(() => http.selecionar('alunos', 'select=*'))
conferir('banco travado vira SUPABASE_DEMOROU', r.erro?.codigo === 'SUPABASE_DEMOROU', r.erro?.codigo ?? 'sem erro')
conferir('o prazo desiste em menos de 2 s', r.ms < 2000, `${r.ms} ms`)
conferir('a mensagem diz quantos segundos esperou', /1 s/.test(r.erro?.message ?? ''), r.erro?.message ?? '')
conferir('a mensagem diz onde olhar', /supabase/i.test(r.erro?.message ?? ''))

// 3. banco fora do ar (conexão recusada)
process.env.SUPABASE_URL = `http://127.0.0.1:${PORTA_FECHADA}`
r = await capturar(() => http.selecionar('alunos', 'select=*'))
conferir('porta fechada vira SUPABASE_INALCANCAVEL', r.erro?.codigo === 'SUPABASE_INALCANCAVEL', r.erro?.codigo ?? 'sem erro')

// 4. resposta de erro do banco mantém a mensagem original
ambienteURL()
estado.modo = 'erro500'
r = await capturar(() => http.selecionar('alunos', 'select=*'))
conferir('erro 500 continua SUPABASE_FALHOU', r.erro?.codigo === 'SUPABASE_FALHOU', r.erro?.codigo ?? 'sem erro')
conferir('a mensagem do banco chega inteira', /does not exist/.test(r.erro?.message ?? ''), r.erro?.message ?? '')

// 5. erro sem JSON no corpo
estado.modo = 'texto503'
r = await capturar(() => http.selecionar('alunos', 'select=*'))
conferir('corpo sem JSON não quebra a leitura', r.erro?.codigo === 'SUPABASE_FALHOU', r.erro?.codigo ?? 'sem erro')
conferir('o status aparece na mensagem', /503/.test(r.erro?.message ?? ''), r.erro?.message ?? '')

// 6. cabeçalho chega, corpo trava: o prazo precisa cobrir a leitura
estado.modo = 'corpoTravado'
r = await capturar(() => http.selecionar('alunos', 'select=*'))
conferir('corpo que nunca termina também estoura o prazo', r.erro?.codigo === 'SUPABASE_DEMOROU', r.erro?.codigo ?? 'sem erro')
conferir('e desiste rápido, não espera o servidor', r.ms < 2000, `${r.ms} ms`)

// 7. login (auth) tem prazo próprio
estado.modo = 'demora'
r = await capturar(() => http.exigirUsuario({ cabecalhos: { authorization: 'Bearer token-teste' }, corpo: {} }))
conferir('login travado vira AUTH_DEMOROU', r.erro?.codigo === 'AUTH_DEMOROU', r.erro?.codigo ?? 'sem erro')

// 8. download de foto
estado.modo = 'demora'
r = await capturar(() => http.baixarObjeto('redacoes', 'demo/foto.jpg'))
conferir('download travado vira STORAGE_DEMOROU', r.erro?.codigo === 'STORAGE_DEMOROU', r.erro?.codigo ?? 'sem erro')

// 9. SIGA
ambienteURL()
estado.modo = 'demora'
r = await capturar(() => siga.lancarNotas({ turma: 'CBV018GV-A', descricao_avaliacao: 'Prova 1', notas: { '2026999001GV': 7.5 } }))
conferir('SIGA travado vira SIGA_DEMOROU', r.erro?.codigo === 'SIGA_DEMOROU', r.erro?.codigo ?? 'sem erro')
conferir('a mensagem avisa que a nota não foi lançada', /não foi lançada/.test(r.erro?.message ?? ''), r.erro?.message ?? '')

estado.modo = 'sigaOk'
const lancamento = await siga.lancarNotas({ turma: 'CBV018GV-A', descricao_avaliacao: 'Prova 1', notas: { '2026999001GV': 7.5 } })
conferir('SIGA respondendo normalmente passa', lancamento?.status === 200, `status ${lancamento?.status}`)

process.env.SIGA_API_BASE = `http://127.0.0.1:${PORTA_FECHADA}`
r = await capturar(() => siga.lancarNotas({ turma: 'CBV018GV-A', descricao_avaliacao: 'Prova 1', notas: {} }))
conferir('SIGA fora do ar vira SIGA_INALCANCAVEL', r.erro?.codigo === 'SIGA_INALCANCAVEL', r.erro?.codigo ?? 'sem erro')

// 10. OCR
ambienteURL()
estado.modo = 'demora'
r = await capturar(() => ocr.transcreverImagem(new ArrayBuffer(8), 'image/jpeg'))
conferir('OCR travado vira OCR_DEMOROU', r.erro?.codigo === 'OCR_DEMOROU', r.erro?.codigo ?? 'sem erro')
conferir('a mensagem oferece digitar o texto', /digite o texto/.test(r.erro?.message ?? ''), r.erro?.message ?? '')

estado.modo = 'ocrOk'
const transcricao = await ocr.transcreverImagem(new ArrayBuffer(8), 'image/jpeg')
conferir('OCR respondendo normalmente passa', /sensibilidade/i.test(transcricao?.texto ?? ''), (transcricao?.texto ?? '').slice(0, 40) + '…')

// limpeza
process.env = ambienteOriginal
servidor.closeAllConnections()
await new Promise((ok) => servidor.close(ok))

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) de rede falharam\x1b[0m\n`)
  process.exit(1)
}
console.log(`  \x1b[32m✓ ${total} verificações de rede passaram\x1b[0m\n`)
