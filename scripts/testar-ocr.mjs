import { createServer } from 'node:http'
import { generateKeyPairSync, createVerify } from 'node:crypto'
/**
 * Testa a etapa de OCR (Cloud Vision) sem gastar chamada real: sobe um servidor
 * local que imita o Google e confere o que o app envia e como trata a resposta.
 *
 *   pnpm test:ocr
 */
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
await mkdir(join(raiz, '.temp-api'), { recursive: true })
const entrada = join(raiz, '.temp-api', 'gcv.ts')
await writeFile(entrada, `export { transcreverImagem } from ${JSON.stringify(join(raiz, 'api/_lib/transcrever.ts'))}\n`)
const saida = join(raiz, '.temp-api', 'gcv.mjs')
await build({ entryPoints: [entrada], outfile: saida, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent' })

const digitado = 'A sensibilidade do teste é a proporção de doentes identificados. '.repeat(3)
let recebido = null
let jwtRecebido = null

const servidor = createServer((req, res) => {
  let corpo = ''
  req.on('data', (c) => (corpo += c))
  req.on('end', () => {
    if (req.url.startsWith('/token')) {
      const params = new URLSearchParams(corpo)
      jwtRecebido = params.get('assertion')
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ access_token: 'token-falso', token_type: 'Bearer', expires_in: 3600 }))
    }
    if (req.url.startsWith('/v1/images:annotate')) {
      recebido = { url: req.url, auth: req.headers.authorization, corpo: JSON.parse(corpo) }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ responses: [{ fullTextAnnotation: { text: digitado } }] }))
    }
    res.writeHead(404).end('{}')
  })
})
// Porta 0 = o sistema escolhe uma livre. Com porta fixa, um servidor de outro
// teste que ficou de pé derrubava esta suíte com EADDRINUSE, sem dizer o porquê.
await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
const PORTA = servidor.address().port
const BASE = `http://127.0.0.1:${PORTA}`

// --- 1. chave de API simples
process.env.VISION_PROVIDER = 'google-cloud'
process.env.VISION_API_KEY = 'chave-simples'
process.env.GOOGLE_VISION_BASE = BASE
let { transcreverImagem } = await import(saida + '?a=1')
const r1 = await transcreverImagem(new TextEncoder().encode('foto').buffer, 'image/jpeg')
console.log('1) chave simples →', r1.modelo, '| texto:', r1.texto.slice(0, 40) + '…')
console.log('   url:', recebido.url)
console.log('   feature:', JSON.stringify(recebido.corpo.requests[0].features), '| idioma:', JSON.stringify(recebido.corpo.requests[0].imageContext))
console.log('   imagem base64:', recebido.corpo.requests[0].image.content)

// --- 2. conta de serviço (JWT RS256)
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const conta = {
  client_email: 'visao@projeto.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  token_uri: `${BASE}/token`,
}
process.env.VISION_API_KEY = JSON.stringify(conta)
const mod = await import(saida + '?b=1')
const r2 = await mod.transcreverImagem(new TextEncoder().encode('foto').buffer, 'image/jpeg')
const partes = jwtRecebido.split('.')
const [cab, corpo] = [partes[0], partes[1]].map((p) => JSON.parse(Buffer.from(p, 'base64url').toString()))
const assinaturaOk = createVerify('RSA-SHA256').update(partes.slice(0, 2).join('.')).verify(publicKey, partes[2], 'base64url')
console.log('2) conta de serviço →', r2.modelo)
console.log('   jwt header:', JSON.stringify(cab))
console.log('   jwt claims:', JSON.stringify({ iss: corpo.iss, scope: corpo.scope, aud: corpo.aud, exp_min: Math.round((corpo.exp - corpo.iat) / 60) }))
console.log('   assinatura confere:', assinaturaOk)
console.log('   authorization enviado:', recebido.auth, '| url sem ?key:', !recebido.url.includes('key='))

// --- 3. erro do Google vira mensagem clara
process.env.VISION_API_KEY = 'chave-simples'
servidor.removeAllListeners('request')
servidor.on('request', (req, res) => {
  req.resume()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ responses: [{ error: { message: 'Bad image data.' } }] }))
})
try {
  await (await import(saida + '?c=1')).transcreverImagem(new ArrayBuffer(4), 'image/jpeg')
  console.log('3) deveria ter falhado')
} catch (e) {
  console.log('3) erro do Google →', e.codigo ?? e.status, '|', e.message)
}

// --- 4. chave recusada (403)
servidor.removeAllListeners('request')
servidor.on('request', (req, res) => {
  req.resume()
  res.writeHead(403, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: { code: 403, message: 'API key not valid.' } }))
})
try {
  await (await import(saida + '?d=1')).transcreverImagem(new ArrayBuffer(4), 'image/jpeg')
  console.log('4) deveria ter falhado')
} catch (e) {
  console.log('4) chave recusada →', e.codigo ?? e.status, '|', e.message)
}

// --- 5. página em branco (sem texto) vira orientação para o aluno
process.env.VISION_API_KEY = 'chave-simples'
servidor.removeAllListeners('request')
servidor.on('request', (req, res) => {
  req.resume()
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ responses: [{}] }))
})
try {
  await (await import(saida + '?e=1')).transcreverImagem(new ArrayBuffer(4), 'image/jpeg')
  console.log('5) deveria ter falhado')
} catch (e) {
  console.log('5) foto em branco →', e.codigo ?? e.status, '|', e.message)
}
servidor.close()
