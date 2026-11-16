#!/usr/bin/env node
/**
 * Corretor × modelo, sem modelo: um servidor falso no lugar do Coolify.
 *
 *   pnpm test:llm:mock
 *
 * O `pnpm test:llm` conversa com o modelo de verdade — e só roda quando as
 * credenciais existem. Isso deixa o caminho do erro sem teste: o que acontece
 * quando o Coolify responde 401, quando o modelo corta a resposta no limite de
 * tokens, quando devolve lixo no lugar de JSON, quando demora mais que o prazo?
 *
 * Aqui um servidor HTTP local faz o papel do modelo e responde o que cada caso
 * precisa. O que se verifica é o **contrato**: o pedido que o app manda (modelo,
 * temperatura, chave, prompt com tema e texto) e a decisão que ele toma com cada
 * resposta — inclusive quantas vezes ele tenta de novo. Uma retentativa a mais
 * num laço de correção é dinheiro e tempo do professor; a menos é nota que não
 * sai.
 */
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const raiz = dirname(dirname(fileURLToPath(import.meta.url)))
const pasta = join(raiz, '.temp-api')
await mkdir(pasta, { recursive: true })
const empacotado = join(pasta, 'rubrica-mock.mjs')

const { build } = await import('esbuild')
const saida = await build({
  entryPoints: [join(raiz, 'api', '_lib', 'rubrica.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'error',
})
await writeFile(empacotado, saida.outputFiles[0].text)
const { corrigirRedacao, llmConfigurado } = await import(pathToFileURL(empacotado).href)

// ---- a rubrica e a redação de teste ---------------------------------------
const rubrica = [
  { id: 'c1', nome: 'Precisão conceitual', descricao: 'Conceitos corretos.', valor: 6 },
  { id: 'c2', nome: 'Interpretação', descricao: 'Aplica a um caso.', valor: 4 },
  { id: 'c3', nome: 'Argumentação', descricao: 'Usa evidências.', valor: 6 },
  { id: 'c4', nome: 'Clareza', descricao: 'Texto organizado.', valor: 4 },
]
const TEXTO = 'A sensibilidade mede a proporção de doentes que o teste detecta. A especificidade mede os sadios.'
const entrada = {
  titulo: 'Redação 1 — Testes diagnósticos',
  tema: 'Explique sensibilidade e especificidade',
  instrucoes: '20 a 30 linhas, à mão',
  valor_total: 20,
  rubrica,
  texto: TEXTO,
}

// Cada valor está dentro da faixa do seu nível (bom 70–89%, regular 50–69%,
// insuficiente até 49%), então a normalização não altera nenhum número:
// 5 (de 6) + 2,5 (de 4) + 5 (de 6) + 1,5 (de 4) = 14 de 20 → 7,0
const CORRECAO = {
  criterios: [
    { id: 'c1', nivel: 'bom', valor: 5, justificativa: 'Define os dois conceitos.' },
    { id: 'c2', nivel: 'regular', valor: 2.5, justificativa: 'Exemplo incompleto.' },
    { id: 'c3', nivel: 'bom', valor: 5, justificativa: 'Argumenta com o exemplo.' },
    { id: 'c4', nivel: 'insuficiente', valor: 1.5, justificativa: 'Períodos longos.' },
  ],
  pontos_fortes: ['Define sensibilidade com precisão'],
  pontos_desenvolver: ['Traga um exemplo numérico'],
  comentario: 'Bom domínio conceitual; falta concretude no exemplo.',
  confianca: 0.7,
}

// ---- o servidor que faz o papel do modelo ---------------------------------
const estado = { modo: 'ok', pedidos: 0, corpo: null, cabecalhos: null }

const json = (res, status, objeto) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(objeto))
}
const respostaDoModelo = (res, conteudo, finish = 'stop') =>
  json(res, 200, { choices: [{ message: { content: conteudo }, finish_reason: finish }] })

const servidor = createServer(async (req, res) => {
  res.on('error', () => {}) // cliente pode abortar no caso de prazo
  if (!req.url.endsWith('/chat/completions')) {
    json(res, 404, { error: 'rota inesperada' })
    return
  }
  estado.pedidos++
  const pedacos = []
  for await (const p of req) pedacos.push(p)
  try {
    estado.corpo = JSON.parse(Buffer.concat(pedacos).toString('utf8'))
  } catch {
    estado.corpo = null
  }
  estado.cabecalhos = req.headers

  switch (estado.modo) {
    case 'ok':
      return respostaDoModelo(res, JSON.stringify(CORRECAO))
    case 'cercas':
      return respostaDoModelo(res, '```json\n' + JSON.stringify(CORRECAO) + '\n```')
    case 'lixo':
      return respostaDoModelo(res, 'Desculpe, não consegui avaliar esta redação.')
    case 'truncado':
      return respostaDoModelo(res, JSON.stringify(CORRECAO), 'length')
    case 'incompleto':
      return respostaDoModelo(res, JSON.stringify({ criterios: [{ id: 'c1', valor: 6 }] }))
    case 'erro500':
      return json(res, 500, { error: 'modelo fora do ar' })
    case 'erro401':
      return json(res, 401, { error: 'invalid api key' })
    case 'demora':
      // espera mais que o prazo configurado no caso (7 s) para provar o aborto
      await new Promise((ok) => setTimeout(ok, 7600))
      return respostaDoModelo(res, JSON.stringify(CORRECAO))
  }
})

await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok))
const porta = servidor.address().port
const BASE = `http://127.0.0.1:${porta}`

// porta fechada, para o caso "serviço fora do ar"
const fechado = createServer(() => {})
await new Promise((ok) => fechado.listen(0, '127.0.0.1', ok))
const portaFechada = fechado.address().port
await new Promise((ok) => fechado.close(ok))

// ---- utilidades ------------------------------------------------------------
let falhas = 0
let total = 0
function conferir(nome, condicao, detalhe = '') {
  total++
  const marca = condicao ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${marca} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  if (!condicao) falhas++
}

async function esperaErro(fn) {
  try {
    await fn()
    return null
  } catch (erro) {
    return erro
  }
}

const ambienteOriginal = { ...process.env }
function configurar(extra = {}) {
  process.env.LLM_BASE_URL = BASE
  process.env.LLM_MODEL = 'llama-teste'
  process.env.LLM_API_KEY = 'chave-teste'
  delete process.env.LLM_TIMEOUT_MS
  delete process.env.LLM_MAX_TOKENS
  delete process.env.LLM_MAX_PALAVRAS
  delete process.env.LLM_JSON_MODE
  Object.assign(process.env, extra)
}

async function caso(modo, extra) {
  estado.modo = modo
  estado.pedidos = 0
  estado.corpo = null
  estado.cabecalhos = null
  configurar(extra)
  return esperaErro(() => corrigirRedacao(entrada))
}

console.log('\n  Corretor × modelo · contrato e falhas (servidor falso)\n')

// 1. caminho feliz
estado.modo = 'ok'
estado.pedidos = 0
configurar()
let erro = null
const boa = await corrigirRedacao(entrada)
conferir('a correção sai sem erro', erro === null)
conferir('soma dos critérios', boa.nota_bruta === 14, `${boa.nota_bruta}/20`)
conferir('nota final de 0 a 10', boa.nota_final === 7, `${boa.nota_final}`)
conferir('pontos fortes vêm do modelo', boa.pontos_fortes[0] === 'Define sensibilidade com precisão')
conferir('confiança é preservada', boa.confianca === 0.7)
conferir('o modelo que assinou é o configurado', boa.modelo === 'llama-teste', boa.modelo)
conferir('a versão do prompt fica registrada', /^rubrica-v\d+$/.test(boa.prompt_versao), boa.prompt_versao)

// 2. o pedido que o app manda
conferir('o corpo leva o modelo configurado', estado.corpo?.model === 'llama-teste')
conferir('temperatura baixa (0.1)', estado.corpo?.temperature === 0.1)
conferir('padrão de tokens de resposta', estado.corpo?.max_tokens === 1400, String(estado.corpo?.max_tokens))
conferir('duas mensagens: sistema e usuário', estado.corpo?.messages?.length === 2)
conferir('a primeira é o prompt de sistema', estado.corpo?.messages?.[0]?.role === 'system')
const mensagemUsuario = estado.corpo?.messages?.[1]?.content ?? ''
conferir('o tema entra no pedido', mensagemUsuario.includes(entrada.tema))
conferir('a redação entra no pedido', mensagemUsuario.includes('A sensibilidade mede'))
conferir(
  'a rubrica entra com nome e valor de cada critério',
  entrada.rubrica.every((c) => mensagemUsuario.includes(c.nome)) && /6/.test(mensagemUsuario),
)
conferir('a chave vai no cabeçalho Authorization', estado.cabecalhos?.authorization === 'Bearer chave-teste')

// 3. JSON entre cercas de markdown — modelo adora
erro = await caso('cercas')
conferir('JSON entre ```json``` é aceito', erro === null, erro?.message ?? '')

// 4. resposta sem JSON nenhum → tenta duas vezes e desiste
erro = await caso('lixo')
conferir('resposta sem JSON vira RESPOSTA_INVALIDA', erro?.codigo === 'RESPOSTA_INVALIDA', erro?.codigo ?? 'sem erro')
conferir('tenta de novo antes de desistir', estado.pedidos === 2, `${estado.pedidos} pedido(s)`)

// 5. JSON válido, mas sem todos os critérios → também tenta duas vezes
erro = await caso('incompleto')
conferir('critério faltando vira RESPOSTA_INCOMPLETA', erro?.codigo === 'RESPOSTA_INCOMPLETA', erro?.codigo ?? 'sem erro')
conferir('a resposta incompleta também é retentada', estado.pedidos === 2, `${estado.pedidos} pedido(s)`)

// 6. limite de tokens: a resposta veio cortada de propósito
erro = await caso('truncado')
conferir('resposta cortada vira RESPOSTA_TRUNCADA', erro?.codigo === 'RESPOSTA_TRUNCADA', erro?.codigo ?? 'sem erro')
conferir('a mensagem diz para aumentar LLM_MAX_TOKENS', /LLM_MAX_TOKENS/.test(erro?.message ?? ''))
conferir('não retenta resposta truncada (gastaria o dobro)', estado.pedidos === 1, `${estado.pedidos} pedido(s)`)

// 7. o modelo respondeu erro
erro = await caso('erro500')
conferir('HTTP 500 vira LLM_FALHOU', erro?.codigo === 'LLM_FALHOU', erro?.codigo ?? 'sem erro')
conferir('o status aparece na mensagem', /500/.test(erro?.message ?? ''), erro?.message ?? '')
conferir('erro de servidor não é retentado', estado.pedidos === 1, `${estado.pedidos} pedido(s)`)

// 8. chave recusada
erro = await caso('erro401')
conferir('HTTP 401 vira LLM_FALHOU', erro?.codigo === 'LLM_FALHOU', erro?.codigo ?? 'sem erro')
conferir('o 401 aparece na mensagem', /401/.test(erro?.message ?? ''), erro?.message ?? '')

// 9. demora além do prazo
erro = await caso('demora', { LLM_TIMEOUT_MS: '7000' })
conferir('prazo estourado vira LLM_DEMOROU', erro?.codigo === 'LLM_DEMOROU', erro?.codigo ?? 'sem erro')
conferir('a mensagem cita o prazo em segundos', /7 s/.test(erro?.message ?? ''), erro?.message ?? '')
conferir('prazo estourado não é retentado', estado.pedidos === 1, `${estado.pedidos} pedido(s)`)

// 9b. prazo configurado curto demais: recusa antes de gastar uma chamada
erro = await caso('ok', { LLM_TIMEOUT_MS: '1200' })
conferir('prazo curto demais vira LLM_DEMOROU', erro?.codigo === 'LLM_DEMOROU', erro?.codigo ?? 'sem erro')
conferir('a mensagem diz qual variável ajustar', /LLM_TIMEOUT_MS=1200/.test(erro?.message ?? ''), erro?.message ?? '')
conferir('nem chega a chamar o modelo', estado.pedidos === 0, `${estado.pedidos} pedido(s)`)

// 10. serviço fora do ar
erro = await caso('ok', { LLM_BASE_URL: `http://127.0.0.1:${portaFechada}` })
conferir('porta fechada vira LLM_INALCANCAVEL', erro?.codigo === 'LLM_INALCANCAVEL', erro?.codigo ?? 'sem erro')
conferir('a mensagem manda conferir LLM_BASE_URL', /LLM_BASE_URL/.test(erro?.message ?? ''))

// 11. sem configuração
delete process.env.LLM_BASE_URL
delete process.env.LLM_MODEL
conferir('llmConfigurado() é falso sem variáveis', llmConfigurado() === false)
erro = await esperaErro(() => corrigirRedacao(entrada))
conferir('sem LLM_BASE_URL a correção se recusa a rodar', erro?.codigo === 'CONFIGURACAO_AUSENTE', erro?.codigo ?? 'sem erro')

// 12. ajustes opcionais
await caso('ok', { LLM_MAX_PALAVRAS: '5' })
const textoEnviado = estado.corpo?.messages?.[1]?.content ?? ''
conferir('LLM_MAX_PALAVRAS trunca o texto enviado', textoEnviado.includes('[… texto truncado]'))

await caso('ok', { LLM_JSON_MODE: '1' })
conferir(
  'LLM_JSON_MODE pede JSON estrito ao servidor',
  estado.corpo?.response_format?.type === 'json_object',
  JSON.stringify(estado.corpo?.response_format),
)

// limpeza
process.env = ambienteOriginal
servidor.closeAllConnections()
await new Promise((ok) => servidor.close(ok))

console.log()
if (falhas) {
  console.log(`  \x1b[31m${falhas} verificação(ões) do corretor falharam\x1b[0m\n`)
  process.exit(1)
}
console.log(`  \x1b[32m✓ ${total} verificações do corretor passaram\x1b[0m\n`)
