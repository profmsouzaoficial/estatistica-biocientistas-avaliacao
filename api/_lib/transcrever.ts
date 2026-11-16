/**
 * Transcrição da foto da redação manuscrita.
 *
 * O modelo de linguagem que corrige (Llama, locado no Coolify) é de TEXTO: ele
 * não enxerga imagem. Por isso a leitura da letra acontece aqui, num provedor de
 * visão em nuvem, e o resultado vira texto para o corretor.
 *
 * Provedores aceitos em VISION_PROVIDER:
 *   - openrouter / openai  → qualquer endpoint compatível com /chat/completions
 *   - google               → Gemini (generativelanguage.googleapis.com)
 */
import { ErroHttp, envOpcional } from './http'

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
  return Boolean(envOpcional('VISION_API_KEY'))
}

export async function transcreverImagem(bytes: ArrayBuffer, mimetype: string): Promise<ResultadoTranscricao> {
  const chave = envOpcional('VISION_API_KEY')
  if (!chave) {
    throw new ErroHttp(
      503,
      'OCR_NAO_CONFIGURADO',
      'A transcrição automática não está configurada no servidor (falta VISION_API_KEY). Digite o texto da redação para continuar.',
    )
  }

  const provedor = provedorDeVisao()
  const base64 = Buffer.from(bytes).toString('base64')

  if (provedor === 'google' || provedor === 'gemini') {
    return transcricaoGoogle(chave, base64, mimetype)
  }
  if (provedor === 'openrouter' || provedor === 'openai' || provedor === 'azure-openai') {
    return transcricaoCompativel(chave, base64, mimetype)
  }
  throw new ErroHttp(503, 'OCR_PROVEDOR_DESCONHECIDO', `VISION_PROVIDER="${provedor}" não é suportado.`)
}

// ---------------------------------------------------------------------------

async function transcricaoCompativel(chave: string, base64: string, mimetype: string): Promise<ResultadoTranscricao> {
  const base = (envOpcional('VISION_BASE_URL') ?? 'https://openrouter.ai/api/v1').replace(/\/+$/, '')
  const modelo = envOpcional('VISION_MODEL') ?? 'google/gemini-2.5-flash'
  const rotulo = base.includes('openrouter') ? 'openrouter' : 'openai-compativel'

  const resposta = await fetch(`${base}/chat/completions`, {
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
  })

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

  const resposta = await fetch(url, {
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
  })

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
  if (texto.replace(/\s/g, '').length < 40) {
    throw new ErroHttp(
      422,
      'TEXTO_CURTO',
      'A transcrição saiu muito curta — provavelmente a foto está tremida, escura ou cortou a folha.',
    )
  }
  return { texto, modelo }
}
