/**
 * Transcrição da foto da redação manuscrita.
 *
 * O modelo de linguagem que corrige (Llama, locado no Coolify) é de TEXTO: ele
 * não enxerga imagem. Por isso a leitura da letra acontece aqui, num provedor de
 * visão em nuvem, e o resultado vira texto para o corretor.
 *
 * Provedores aceitos em VISION_PROVIDER:
 *   - deepseek             → /v1/tools/ocr da DeepSeek (recomendado: devolve o texto
 *     da página sem passar por um modelo de chat, então não "arruma" a escrita)
 *   - openrouter / openai  → qualquer endpoint compatível com /chat/completions
 *   - google               → Gemini (generativelanguage.googleapis.com)
 *   - google-cloud         → Cloud Vision, DOCUMENT_TEXT_DETECTION (aceita chave de
 *     API simples ou o JSON da conta de serviço)
 *
 * Com VISION_PROVIDER=deepseek, a mesma LLM_API_KEY serve para ler e para corrigir:
 * um provedor só, uma fatura só.
 */
import { createSign } from 'node:crypto'
import { ErroHttp, buscar, envOpcional } from './http.js'

export interface ResultadoTranscricao {
  texto: string
  modelo: string
}

const PROMPT = `Transcreva fielmente, em português, o texto manuscrito que aparece nesta imagem.

Regras:
- Reproduza exatamente o que está escrito, inclusive erros de ortografia, de concordância e rasuras legíveis.
- Preserve a divisão em parágrafos.
- Não acrescente títulos, comentários, notas ou correções.
- Se algum trecho estiver ilegível, escreva [ilegível] no lugar.
- Se a imagem não contiver texto manuscrito, responda apenas: SEM_TEXTO

Responda somente com a transcrição.`

export function provedorDeVisao(): string {
  return (envOpcional('VISION_PROVIDER') ?? 'openrouter').toLowerCase()
}

export function ocrConfigurado(): boolean {
  if (envOpcional('VISION_API_KEY')) return true
  // DeepSeek usa a chave da correção para ler a foto: não faz sentido exigir duas.
  return provedorDeVisao() === 'deepseek' && Boolean(envOpcional('LLM_API_KEY'))
}

export async function transcreverImagem(bytes: ArrayBuffer, mimetype: string): Promise<ResultadoTranscricao> {
  const provedor = provedorDeVisao()
  const chave = envOpcional('VISION_API_KEY') ?? (provedor === 'deepseek' ? envOpcional('LLM_API_KEY') : undefined)
  if (!chave) {
    throw new ErroHttp(
      503,
      'OCR_NAO_CONFIGURADO',
      'A transcrição automática não está configurada no servidor (falta VISION_API_KEY). Digite o texto da redação para continuar.',
    )
  }

  if (provedor === 'deepseek') {
    return transcricaoDeepSeek(chave, bytes, mimetype)
  }

  const base64 = Buffer.from(bytes).toString('base64')

  if (provedor === 'google' || provedor === 'gemini') {
    return transcricaoGoogle(chave, base64, mimetype)
  }
  if (provedor === 'google-cloud' || provedor === 'gcv' || provedor === 'google-vision') {
    return transcricaoCloudVision(chave, base64)
  }
  if (provedor === 'openrouter' || provedor === 'openai' || provedor === 'azure-openai') {
    return transcricaoCompativel(chave, base64, mimetype)
  }
  throw new ErroHttp(503, 'OCR_PROVEDOR_DESCONHECIDO', `VISION_PROVIDER="${provedor}" não é suportado.`)
}

// ---------------------------------------------------------------------------

/**
 * Prazo do OCR, lido a cada chamada.
 *
 * Ler `process.env` no topo do módulo congela o valor no import — em produção o
 * ambiente não muda, mas em teste (e no lote) muda. Foi assim que o OCR do teste
 * esperou 25 s e devolveu "sem texto legível" quando o serviço só estava lento.
 */
const configOcr = (servico = 'serviço de leitura da foto (OCR)', prazoPadrao = 25_000) => ({
  servico,
  dica: 'A redação não foi transcrita. Tente de novo; se persistir, digite o texto — ele vale como entrega.',
  prazoMs: Number(envOpcional('OCR_TIMEOUT_MS') ?? prazoPadrao),
  codigoRede: 'OCR_INALCANCAVEL',
  codigoTempo: 'OCR_DEMOROU',
})

/**
 * OCR da DeepSeek — `POST /v1/tools/ocr` (multipart).
 *
 * O texto vem da página, não de um modelo de chat: ele não reescreve a redação do
 * aluno "para melhorar". Uma redação tem uma página; se vier mais de uma, juntamos
 * em ordem. Se alguma página vier truncada (`finish_reason: "length"`), preferimos
 * recusar a entregar meia redação para correção — a nota sairia injusta.
 */
const EXTENSAO_POR_TIPO: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
}

async function transcricaoDeepSeek(chave: string, bytes: ArrayBuffer, mimetype: string): Promise<ResultadoTranscricao> {
  const base = (envOpcional('VISION_BASE_URL') ?? 'https://api.deepseek.com').replace(/\/+$/, '')
  const tipo = mimetype || 'image/jpeg'
  const arquivo = new Blob([bytes], { type: tipo })
  const formulario = new FormData()
  formulario.append('purpose', 'text_recognition')
  formulario.append('file', arquivo, `redacao.${EXTENSAO_POR_TIPO[tipo] ?? 'jpg'}`)

  const resposta = await buscar(
    `${base}/v1/tools/ocr`,
    { method: 'POST', headers: { Authorization: `Bearer ${chave}` }, body: formulario },
    // A DeepSeek aceita até 180 s no total; 35 s é o que uma página leva com folga
    // e ainda cabe no orçamento da função e no prazo que o navegador espera.
    configOcr('leitura da foto (OCR da DeepSeek)', 35_000),
  )

  const bruto = await resposta.text()
  if (!resposta.ok) {
    const dica =
      resposta.status === 413
        ? 'A foto é grande demais para a leitura. Tire outra em resolução menor.'
        : resposta.status === 429
          ? 'A leitura está ocupada agora. Tente de novo em alguns segundos.'
          : resposta.status === 400
            ? 'A leitura não aceitou o arquivo. Tire outra foto (JPEG ou PNG).'
            : 'A leitura da foto falhou. Tente de novo; se persistir, digite o texto.'
    throw new ErroHttp(502, 'OCR_FALHOU', `A DeepSeek respondeu ${resposta.status}. ${dica}`, bruto.slice(0, 600))
  }

  let dados: { pages?: { index?: number; text?: string; finish_reason?: string }[] }
  try {
    dados = JSON.parse(bruto) as typeof dados
  } catch {
    throw new ErroHttp(502, 'OCR_FALHOU', 'A leitura da foto respondeu algo que não é JSON.', bruto.slice(0, 600))
  }

  const paginas = dados.pages ?? []
  if (paginas.some((p) => p.finish_reason === 'length')) {
    throw new ErroHttp(
      422,
      'OCR_INCOMPLETO',
      'A leitura parou no meio da página — a foto tem texto demais ou pouco contraste. Tire outra, com a folha inteira e boa luz.',
    )
  }
  const conteudo = paginas.map((p) => p.text ?? '').join('\n\n')
  return finalizar(conteudo, 'deepseek:ocr')
}

async function transcricaoCompativel(chave: string, base64: string, mimetype: string): Promise<ResultadoTranscricao> {
  const base = (envOpcional('VISION_BASE_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const modelo = envOpcional('VISION_MODEL') ?? 'google/gemini-2.5-flash'
  const rotulo = base.includes('openrouter') ? 'openrouter' : 'openai-compativel'

  const resposta = await buscar(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
      ...(base.includes('openrouter') ? { 'HTTP-Referer': 'https://estatistica-biocientistas.vercel.app' } : {}),
    },
    body: JSON.stringify({
      model: modelo,
      temperature: 0,
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:${mimetype};base64,${base64}` } },
          ],
        },
      ],
    }),
  }, configOcr())

  const texto = await resposta.text()
  if (!resposta.ok) {
    throw new ErroHttp(502, 'OCR_FALHOU', `O provedor de visão respondeu ${resposta.status}.`, texto.slice(0, 600))
  }
  const dados = JSON.parse(texto) as { choices?: { message?: { content?: string } }[] }
  const conteudo = dados.choices?.[0]?.message?.content ?? ''
  return finalizar(conteudo, `${rotulo}:${modelo}`)
}

async function transcricaoGoogle(chave: string, base64: string, mimetype: string): Promise<ResultadoTranscricao> {
  const modelo = envOpcional('VISION_MODEL') ?? 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`

  const resposta = await buscar(url, {
    method: 'POST',
    headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: PROMPT }, { inline_data: { mime_type: mimetype, data: base64 } }],
        },
      ],
      generationConfig: { temperature: 0, maxOutputTokens: 2000 },
    }),
  }, configOcr())

  const texto = await resposta.text()
  if (!resposta.ok) {
    throw new ErroHttp(502, 'OCR_FALHOU', `O Google respondeu ${resposta.status}.`, texto.slice(0, 600))
  }
  const dados = JSON.parse(texto) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const conteudo = (dados.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  return finalizar(conteudo, `google:${modelo}`)
}

// ---------------------------------------------------------------------------
// Google Cloud Vision — DOCUMENT_TEXT_DETECTION
//
// Duas formas de credencial, ambas na mesma variável:
//   - chave de API simples  → vai na URL (?key=...)
//   - JSON da conta de serviço → troca por um token OAuth (JWT assinado RS256)
// ---------------------------------------------------------------------------

interface ContaServico {
  client_email?: string
  private_key?: string
  token_uri?: string
}

function pareceJson(chave: string): boolean {
  return chave.trim().startsWith('{')
}

function baseVision(): string {
  return (envOpcional('GOOGLE_VISION_BASE') ?? 'https://vision.googleapis.com').replace(/\/+$/, '')
}

async function tokenDaContaDeServico(conta: ContaServico): Promise<string> {
  if (!conta.client_email || !conta.private_key) {
    throw new ErroHttp(503, 'OCR_CREDENCIAL', 'O JSON da conta de serviço precisa de client_email e private_key.')
  }
  const agora = Math.floor(Date.now() / 1000)
  const cabecalho = { alg: 'RS256', typ: 'JWT' }
  const corpo = {
    iss: conta.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-vision',
    aud: conta.token_uri ?? 'https://oauth2.googleapis.com/token',
    iat: agora,
    exp: agora + 3600,
  }
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const semAssinatura = `${b64(cabecalho)}.${b64(corpo)}`
  const assinatura = createSign('RSA-SHA256').update(semAssinatura).sign(conta.private_key, 'base64url')
  const jwt = `${semAssinatura}.${assinatura}`

  const resposta = await buscar(
    corpo.aud,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
    },
    configOcr('login da conta de serviço do Google'),
  )
  const texto = await resposta.text()
  if (!resposta.ok) {
    throw new ErroHttp(502, 'OCR_CREDENCIAL', 'O Google recusou a conta de serviço.', texto.slice(0, 600))
  }
  const dados = JSON.parse(texto) as { access_token?: string }
  if (!dados.access_token) throw new ErroHttp(502, 'OCR_CREDENCIAL', 'O Google não devolveu access_token.')
  return dados.access_token
}

async function transcricaoCloudVision(chave: string, base64: string): Promise<ResultadoTranscricao> {
  let url = `${baseVision()}/v1/images:annotate`
  const cabecalhos: Record<string, string> = { 'Content-Type': 'application/json' }

  if (pareceJson(chave)) {
    const conta = JSON.parse(chave) as ContaServico
    cabecalhos.Authorization = `Bearer ${await tokenDaContaDeServico(conta)}`
  } else {
    url += `?key=${encodeURIComponent(chave)}`
  }

  const resposta = await buscar(url, {
    method: 'POST',
    headers: cabecalhos,
    body: JSON.stringify({
      requests: [
        {
          image: { content: base64 },
          features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
          imageContext: { languageHints: ['pt-BR', 'pt'] },
        },
      ],
    }),
  }, configOcr())

  const texto = await resposta.text()
  if (!resposta.ok) {
    throw new ErroHttp(502, 'OCR_FALHOU', `O Cloud Vision respondeu ${resposta.status}.`, texto.slice(0, 600))
  }
  const dados = JSON.parse(texto) as {
    responses?: {
      fullTextAnnotation?: { text?: string }
      textAnnotations?: { description?: string }[]
      error?: { message?: string }
    }[]
  }
  const primeira = dados.responses?.[0]
  if (primeira?.error?.message) {
    throw new ErroHttp(502, 'OCR_FALHOU', `Cloud Vision: ${primeira.error.message}`, texto.slice(0, 600))
  }
  const conteudo = primeira?.fullTextAnnotation?.text ?? primeira?.textAnnotations?.[0]?.description ?? ''
  return finalizar(conteudo, 'google-vision:document-text')
}

// ---------------------------------------------------------------------------

function finalizar(bruto: string, modelo: string): ResultadoTranscricao {
  const texto = bruto
    .replace(/^```[a-z]*\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()

  if (!texto || /^SEM_TEXTO$/i.test(texto)) {
    throw new ErroHttp(
      422,
      'SEM_TEXTO',
      'Não encontrei texto manuscrito legível na foto. Tente outra foto, com mais luz e a folha inteira no enquadramento.',
    )
  }
  // Modelo de OCR também entra em laço: numa foto densa, a DeepSeek já devolveu o
  // mesmo parágrafo 17 vezes (31 mil caracteres para uma página). Sem esta guarda,
  // o lixo entra na correção e a nota sai sobre um texto que o aluno não escreveu.
  // Anda de 1 em 1 (e não de 20 em 20): o laço repete o parágrafo com um período
  // que não é múltiplo do passo, e amostrar de 20 em 20 deixava o teste passar.
  const janela = 80
  const vistos = new Map<string, number>()
  for (let i = 0; i + janela <= texto.length; i++) {
    const bloco = texto.slice(i, i + janela)
    const repeticoes = (vistos.get(bloco) ?? 0) + 1
    vistos.set(bloco, repeticoes)
    if (repeticoes >= 5) {
      throw new ErroHttp(
        422,
        'OCR_REPETIDO',
        'A leitura da foto se repetiu, como se o mesmo trecho tivesse sido escrito várias vezes. Tire outra foto com a folha inteira e bem iluminada — ou digite o texto, que vale como entrega.',
      )
    }
  }
  if (texto.replace(/\s/g, '').length < 40) {
    throw new ErroHttp(
      422,
      'TEXTO_CURTO',
      'A transcrição saiu muito curta — provavelmente a foto está tremida, escura ou cortou a folha.',
    )
  }
  return { texto, modelo }
}
