#!/usr/bin/env node
/**
 * A leitura da foto pela DeepSeek (`POST /v1/tools/ocr`).
 *
 *   pnpm test:ocr:deepseek
 *
 * Sem chave e sem gastar chamada: um servidor local imita o endpoint de OCR e o
 * teste confere o que o app envia (multipart, `purpose=text_recognition`), como
 * junta as páginas e — o mais importante — o que ele faz quando dá errado. Uma
 * leitura truncada não pode virar nota: é melhor pedir outra foto do que corrigir
 * metade da redação.
 */
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const pasta = join(raiz, '.temp-api')
await mkdir(pasta, { recursive: true })

const { build } = await import('esbuild')
const saida = join(pasta, 'ocr-deepseek.mjs')
const bundle = await build({
  entryPoints: [join(raiz, 'api', '_lib', 'transcrever.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  write: false,
  logLevel: 'error',
})
await writeFile(saida, bundle.outputFiles[0].text)

const TEXTO_LONGO =
  'A sensibilidade de um teste diagnóstico é a proporção de pessoas doentes que o teste identifica corretamente. ' +
  'A especificidade é a proporção de pessoas sadias que o teste classifica como negativas. ' +
  'Um teste sensível evita falsos negativos; um teste específico evita falsos positivos.'

const estado = {
  modo: 'ok',
  ultimaRequisicao: null,
}
const { transcreverImagem, ocrConfigurado } = await import(pathToFileURL(saida).href)

const servidor = createServer((req, res) => {
  const partes = []
  req.on('data', (c) => partes.push(c))
  req.on('end', () => {
    const corpo = Buffer.concat(partes).toString('latin1')
    const json = (status, dados) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(dados))
    }

    if (req.url === '/v1/tools/ocr' && req.method === 'POST') {
      estado.ultimaRequisicao = {
        url: req.url,
        auth: req.headers.authorization,
        tipo: req.headers['content-type'],
        temPurpose: /name="purpose"/.test(corpo) && /text_recognition/.test(corpo),
        nomeArquivo: corpo.match(/filename="([^"]+)"/)?.[1] ?? null,
      }
      if (estado.modo === 'demora') return // nunca responde: quem corta é o prazo
      if (estado.modo === '429') return json(429, { error: { message: 'too many' } })
      if (estado.modo === '400') return json(400, { error: { message: 'unsupported file' } })
      if (estado.modo === 'truncada') {
        return json(200, {
          id: 'ocr-1',
          object: 'ocr.result',
          purpose: 'text_recognition',
          page_count: 1,
          pages: [{ index: 0, text: TEXTO_LONGO.slice(0, 80), finish_reason: 'length' }],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        })
      }
      if (estado.modo === 'vazia') {
        return json(200, {
          id: 'ocr-2',
          object: 'ocr.result',
          purpose: 'text_recognition',
          page_count: 1,
          pages: [{ index: 0, text: '', finish_reason: 'stop' }],
          usage: { input_tokens: 1, output_tokens: 0, total_tokens: 1 },
        })
      }
      if (estado.modo === 'repetida') {
        // laço real: o mesmo parágrafo devolvido várias vezes, com finish "stop"
        return json(200, {
          id: 'ocr-5',
          object: 'ocr.result',
          purpose: 'text_recognition',
          page_count: 1,
          pages: [{ index: 0, text: Array(8).fill(TEXTO_LONGO).join('\n'), finish_reason: 'stop' }],
        })
      }
      if (estado.modo === 'curta') {
        return json(200, {
          id: 'ocr-3',
          object: 'ocr.result',
          purpose: 'text_recognition',
          page_count: 1,
          pages: [{ index: 0, text: 'Texto curto.', finish_reason: 'stop' }],
        })
      }
      return json(200, {
        id: 'ocr-4',
        object: 'ocr.result',
        purpose: 'text_recognition',
        page_count: 2,
        pages: [
          { index: 0, text: TEXTO_LONGO, finish_reason: 'stop' },
          { index: 1, text: 'Segunda página: conclusão da redação.', finish_reason: 'stop' },
        ],
      })
    }
    json(404, { erro: 'sem rota' })
  })
})
await new Promise((r) => servidor.listen(0, '127.0.0.1', r))
const BASE = `http://127.0.0.1:${servidor.address().port}`

// AbortSignal.timeout usa timer unref: sem algo segurando o event loop, o
// processo sai antes do prazo e o teste "passa" sem testar nada.
const segura = setInterval(() => {}, 500)

process.env.VISION_PROVIDER = 'deepseek'
process.env.VISION_BASE_URL = BASE
process.env.LLM_API_KEY = 'sk-chave-da-correcao'
process.env.OCR_TIMEOUT_MS = '700'
delete process.env.VISION_API_KEY

const foto = new TextEncoder().encode('foto-falsa').buffer

function ehErro(erro, codigo) {
  return erro && typeof erro === 'object' && 'codigo' in erro && erro.codigo === codigo
}

let falhas = 0
let total = 0
function conferir(nome, condicao, detalhe = '') {
  total++
  const marca = condicao ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${marca} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  if (!condicao) falhas++
}

console.log('\n  Leitura da foto pela DeepSeek · /v1/tools/ocr\n')

conferir('sem VISION_API_KEY, a chave da correção já basta', ocrConfigurado() === true)

// 1. caminho feliz
estado.modo = 'ok'
const r = await transcreverImagem(foto, 'image/jpeg')
const req = estado.ultimaRequisicao
conferir('chama /v1/tools/ocr', req?.url === '/v1/tools/ocr', String(req?.url))
conferir('com a chave da LLM no Authorization', req?.auth === 'Bearer sk-chave-da-correcao', String(req?.auth))
conferir('envia multipart/form-data', String(req?.tipo ?? '').startsWith('multipart/form-data'), String(req?.tipo))
conferir('com purpose=text_recognition', req?.temPurpose === true)
conferir('e nome de arquivo com extensão (detecção pelo conteúdo)', req?.nomeArquivo === 'redacao.jpg', String(req?.nomeArquivo))
conferir('junta as páginas em ordem', r.texto.endsWith('Segunda página: conclusão da redação.') && r.texto.includes(TEXTO_LONGO), r.texto.slice(0, 40) + '…')
conferir('identifica o modelo como deepseek:ocr', r.modelo === 'deepseek:ocr', r.modelo)

// 2. página truncada: não dá para corrigir meia redação
estado.modo = 'truncada'
try {
  await transcreverImagem(foto, 'image/jpeg')
  conferir('página truncada é recusada', false)
} catch (e) {
  conferir('página truncada é recusada', ehErro(e, 'OCR_INCOMPLETO'), String(e?.codigo))
  conferir('com instrução para tirar outra foto', /outra/i.test(String(e?.message)), String(e?.message).slice(0, 60))
}

// 3. foto sem texto
estado.modo = 'vazia'
try {
  await transcreverImagem(foto, 'image/jpeg')
  conferir('foto sem texto é recusada', false)
} catch (e) {
  conferir('foto sem texto é recusada', ehErro(e, 'SEM_TEXTO'), String(e?.codigo))
}

// 4. texto curto (foto tremida/cortada)
estado.modo = 'curta'
try {
  await transcreverImagem(foto, 'image/jpeg')
  conferir('texto curto é recusado', false)
} catch (e) {
  conferir('texto curto é recusado', ehErro(e, 'TEXTO_CURTO'), String(e?.codigo))
}

// 4b. laço do modelo (mesmo parágrafo repetido) não pode virar redação
estado.modo = 'repetida'
try {
  await transcreverImagem(foto, 'image/jpeg')
  conferir('leitura em laço é recusada', false)
} catch (e) {
  conferir('leitura em laço é recusada', ehErro(e, 'OCR_REPETIDO'), String(e?.codigo))
}

// 5. limites do serviço viram mensagens que o aluno entende
estado.modo = '429'
try {
  await transcreverImagem(foto, 'image/jpeg')
  conferir('429 do serviço vira erro tratado', false)
} catch (e) {
  conferir('429 do serviço vira erro tratado', ehErro(e, 'OCR_FALHOU') && /ocupada/i.test(String(e?.message)), String(e?.message).slice(0, 70))
}

estado.modo = '400'
try {
  await transcreverImagem(foto, 'image/jpeg')
  conferir('400 sugere outra foto', false)
} catch (e) {
  conferir('400 sugere outra foto', /outra foto/i.test(String(e?.message)), String(e?.message).slice(0, 70))
}

// 6. prazo: o serviço que não responde não pode pendurar a função
estado.modo = 'demora'
const inicio = Date.now()
try {
  await transcreverImagem(foto, 'image/jpeg')
  conferir('serviço que não responde é interrompido', false)
} catch (e) {
  const decorrido = Date.now() - inicio
  conferir('serviço que não responde é interrompido', ehErro(e, 'OCR_DEMOROU'), String(e?.codigo))
  conferir('no prazo configurado, não em 25 s', decorrido < 2000, `${decorrido} ms`)
}

// 7. chave específica de visão tem prioridade
estado.modo = 'ok'
process.env.VISION_API_KEY = 'chave-visao'
await transcreverImagem(foto, 'image/jpeg')
conferir('VISION_API_KEY, quando existe, tem prioridade', estado.ultimaRequisicao?.auth === 'Bearer chave-visao', String(estado.ultimaRequisicao?.auth))

clearInterval(segura)
servidor.closeAllConnections()
servidor.close()

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) da leitura DeepSeek falharam\x1b[0m\n`)
} else {
  console.log(`  \x1b[32m✓ ${total} verificações da leitura DeepSeek passaram\x1b[0m\n`)
}
process.exit(falhas ? 1 : 0)
