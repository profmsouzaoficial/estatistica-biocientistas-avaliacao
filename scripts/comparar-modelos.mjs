#!/usr/bin/env node
/**
 * Compara modelos na MESMA redação, com a MESMA rubrica e o MESMO prompt do app.
 *
 * Serve para duas coisas:
 *   1. ver se o modelo separa redações fraca, média e boa (se não separa, a nota
 *      dele não serve para avaliar);
 *   2. medir tempo e comportamento (JSON quebrado, nota inflada) antes de escolher
 *      o modelo que vai rodar no Coolify.
 *
 * Uso:
 *   LLM_BASE_URL=http://127.0.0.1:11434/v1 LLM_API_KEY=ollama \
 *     node scripts/comparar-modelos.mjs [modelo1,modelo2]
 *
 * Sem argumento, compara os dois modelos instalados por padrão.
 */
import { build } from 'esbuild'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const base = (process.env.LLM_BASE_URL ?? 'http://127.0.0.1:11434/v1').replace(/\/+$/, '')
const modelos = (process.argv[2] ?? 'llama3:latest,deepseek-r1:8b').split(',').map((m) => m.trim()).filter(Boolean)

process.env.LLM_BASE_URL = base
process.env.LLM_TIMEOUT_MS = process.env.LLM_TIMEOUT_MS ?? '600000'

const rubrica = [
  { id: 'c1', nome: 'Precisão conceitual', descricao: 'Define corretamente sensibilidade, especificidade e valor preditivo positivo.', valor: 6 },
  { id: 'c2', nome: 'Interpretação e aplicação', descricao: 'Aplica os conceitos a uma situação concreta, com números coerentes.', valor: 6 },
  { id: 'c3', nome: 'Argumentação e evidências', descricao: 'Justifica as afirmações e discute o efeito da prevalência.', valor: 4 },
  { id: 'c4', nome: 'Clareza e norma padrão', descricao: 'Texto organizado, coeso e em português padrão.', valor: 4 },
]

const avaliacao = {
  titulo: 'Redação 1 — Testes diagnósticos',
  tema:
    'Explique a diferença entre sensibilidade e especificidade de um teste diagnóstico e discuta como a prevalência da doença afeta o valor preditivo positivo.',
  instrucoes: 'Escreva de 20 a 30 linhas, à mão, em folha A4. Use um exemplo concreto e justifique o raciocínio.',
  valor_total: 20,
  rubrica,
}

const redacoes = [
  {
    rotulo: 'fraca',
    esperado: 'baixa',
    texto: `Um teste diagnóstico serve para descobrir se a pessoa tem ou não uma doença. A sensibilidade é
quando o teste dá positivo e a pessoa tem a doença, e a especificidade é quando o teste dá positivo e a
pessoa não tem a doença. Então um teste bom é aquele que acerta muito, ou seja, tem sensibilidade e
especificidade altas ao mesmo tempo. O valor preditivo positivo é a mesma coisa que a sensibilidade,
só que calculado de outra forma, por isso quanto maior a sensibilidade maior o valor preditivo. Na
prática, o médico pede o teste e, se der positivo, já pode tratar o paciente, porque o teste foi
validado em laboratório e tem boa acurácia. Por isso é importante escolher testes confiáveis.`,
  },
  {
    rotulo: 'média',
    esperado: 'média',
    texto: `A sensibilidade de um teste é a proporção de doentes que o teste identifica como positivos; a
especificidade é a proporção de sadios que o teste identifica como negativos. São propriedades do teste,
medidas em grupos sabidamente doentes e sabidamente sadios. Em um exemplo com 100 doentes, se 90 testam
positivo, a sensibilidade é 90%. Em 100 sadios, se 95 testam negativo, a especificidade é 95%. Na triagem,
preferimos testes muito sensíveis, porque não queremos deixar doente sem diagnóstico; na confirmação,
preferimos testes específicos, para não tratar quem não tem a doença. Existe um compromisso entre as duas
medidas: em geral, quando se aumenta uma, a outra cai, e o ponto de corte escolhido define esse equilíbrio.
O valor preditivo positivo depende de quantos doentes existem na população testada.`,
  },
  {
    rotulo: 'boa',
    esperado: 'alta',
    texto: `Sensibilidade é a probabilidade de o teste ser positivo entre os doentes (verdadeiros positivos
divididos pelo total de doentes); especificidade é a probabilidade de o teste ser negativo entre os sadios.
São características intrínsecas do teste e não mudam com a prevalência. O valor preditivo positivo (VPP),
por outro lado, é a probabilidade de a pessoa ter a doença dado que o teste deu positivo, e depende sim da
prevalência. Exemplo: um teste com sensibilidade de 90% e especificidade de 95%, aplicado a 1.000 pessoas
com prevalência de 1% — 10 doentes, 9 positivos verdadeiros; 990 sadios, cerca de 50 positivos falsos.
VPP = 9/59 ≈ 15%. Na mesma população com prevalência de 20%, seriam 180 positivos verdadeiros e 40 falsos,
VPP ≈ 82%. O mesmo teste muda de significado conforme quem é testado, o que justifica testar primeiro
quem tem maior probabilidade pré-teste. Há também o compromisso entre sensibilidade e especificidade:
baixar o ponto de corte aumenta a sensibilidade e reduz a especificidade.`,
  },
]

// ---------- carrega a função real do app ----------
const raiz = new URL('..', import.meta.url).pathname
const pasta = await mkdtemp(join(tmpdir(), 'comparar-'))
const saida = await build({
  entryPoints: [join(raiz, 'api/_lib/rubrica.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
})
const arquivo = join(pasta, 'rubrica.mjs')
await writeFile(arquivo, saida.outputFiles[0].text)
const { corrigirRedacao } = await import(pathToFileURL(arquivo).href)

// ---------- execução ----------
const resultados = []
let indisponivel = 0

for (const modelo of modelos) {
  process.env.LLM_MODEL = modelo
  for (const redacao of redacoes) {
    const inicio = Date.now()
    try {
      const r = await corrigirRedacao({ ...avaliacao, texto: redacao.texto, limitePalavras: 1000 })
      resultados.push({
        modelo,
        ...redacao,
        nota: r.nota_final,
        bruta: r.nota_bruta,
        ms: Date.now() - inicio,
        erro: null,
        criterios: r.criterios,
        pontos_fortes: r.pontos_fortes,
        pontos_desenvolver: r.pontos_desenvolver,
        comentario: r.comentario,
        confianca: r.confianca,
      })
      console.log(
        `  ${modelo.padEnd(16)} ${redacao.rotulo.padEnd(6)} ${String(r.nota_bruta).padStart(4)}/20 · nota ${String(r.nota_final).padStart(4)} · ${((Date.now() - inicio) / 1000).toFixed(1)}s`,
      )
    } catch (erro) {
      const codigo = erro?.codigo ?? 'ERRO'
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      resultados.push({ modelo, ...redacao, nota: null, bruta: null, ms: Date.now() - inicio, erro: `${codigo}: ${mensagem}` })
      if (codigo === 'LLM_INALCANCAVEL') indisponivel++
      console.log(`  ${modelo.padEnd(16)} ${redacao.rotulo.padEnd(6)} \x1b[31m${codigo}\x1b[0m · ${mensagem}`)
    }
  }
}

// ---------- resumo ----------
console.log('\n  Modelo            fraca   média   boa    ordem?   coerência')
for (const modelo of modelos) {
  const doModelo = resultados.filter((r) => r.modelo === modelo)
  const nota = (rotulo) => doModelo.find((r) => r.rotulo === rotulo)?.nota
  const [fraca, media, boa] = [nota('fraca'), nota('média'), nota('boa')]
  const ordem = fraca != null && media != null && boa != null && fraca < media && media < boa
  // "coerência" = a redação boa recebeu nota alta? e a fraca ficou abaixo de 6?
  const coerente = ordem && boa >= 7 && fraca <= 6
  const fmt = (n) => (n == null ? '  —  ' : String(n).padStart(5))
  console.log(
    `  ${modelo.padEnd(16)} ${fmt(fraca)}  ${fmt(media)}  ${fmt(boa)}   ${ordem ? '  sim ' : '  não '}    ${coerente ? 'ok' : 'ver'}`,
  )
}

if (resultados.some((r) => r.erro && r.erro.startsWith('LLM_INALCANCAVEL'))) {
  console.log(`\n  \x1b[33mNão consegui falar com ${base}. O Ollama está no ar? (\x1b[0mollama serve\x1b[33m)\x1b[0m`)
  process.exit(2)
}

const arquivoSaida = join(raiz, '.temp-api', 'calibracao.json')
await mkdir(join(raiz, '.temp-api'), { recursive: true })
await writeFile(arquivoSaida, JSON.stringify(resultados, null, 2))
console.log(`\n  Detalhes em ${arquivoSaida.replace(raiz, '')}`)
