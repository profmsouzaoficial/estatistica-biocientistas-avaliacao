#!/usr/bin/env node
/**
 * Testes da normalização da rubrica — a conta que decide a nota do aluno.
 *
 * O modelo devolve JSON livre: número como texto, vírgula decimal, valor acima
 * do máximo do critério, critério faltando. Aqui cada um desses casos é passado
 * pela mesma função que roda em produção (`montarCorrecao`), sem chamar o modelo.
 *
 *   pnpm test:rubrica
 */
import { build } from 'esbuild'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const raiz = new URL('..', import.meta.url).pathname
const pasta = await mkdtemp(join(tmpdir(), 'rubrica-'))

// O módulo do servidor importa './http.js' (padrão do build da Vercel), então
// não dá para importar o .ts direto: empacotamos com esbuild, como a Vercel faz.
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
const { montarCorrecao } = await import(pathToFileURL(arquivo).href)

const rubrica = [
  { id: 'c1', nome: 'Precisão conceitual', descricao: 'Conceitos corretos.', valor: 6 },
  { id: 'c2', nome: 'Interpretação', descricao: 'Aplica a um caso.', valor: 6 },
  { id: 'c3', nome: 'Argumentação', descricao: 'Usa evidências.', valor: 4 },
  { id: 'c4', nome: 'Clareza', descricao: 'Texto organizado.', valor: 4 },
]
const total = 20

let falhas = 0
function conferir(nome, condicao, detalhe = '') {
  const marca = condicao ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'
  console.log(`  ${marca} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  if (!condicao) falhas++
}

function esperaErro(fn) {
  try {
    fn()
    return null
  } catch (erro) {
    return erro
  }
}

console.log('\n  Rubrica · normalização da resposta do modelo\n')

// 1. valores dentro do máximo
const normal = montarCorrecao(
  {
    criterios: [
      { id: 'c1', valor: 5, justificativa: 'Bom domínio.' },
      { id: 'c2', valor: 4, justificativa: 'Aplicou bem.' },
      { id: 'c3', valor: 3, justificativa: 'Faltou evidência.' },
      { id: 'c4', valor: 3, justificativa: 'Texto claro.' },
    ],
    pontos_fortes: ['Domina os conceitos'],
    pontos_desenvolver: ['Traga dados'],
    comentario: 'Bom trabalho.',
    confianca: 0.8,
  },
  rubrica,
  'teste',
)
conferir('soma dos critérios', normal.nota_bruta === 15, `15/20`)
conferir('nota final de 0 a 10', normal.nota_final === 7.5, `7,5`)
conferir('nota bruta nunca passa do total', normal.nota_bruta <= total)

// 2. valor acima do máximo do critério → corta no máximo
const acima = montarCorrecao(
  { criterios: [{ id: 'c1', valor: 99, justificativa: 'x' }, { id: 'c2', valor: 6 }, { id: 'c3', valor: 4 }, { id: 'c4', valor: 4 }] },
  rubrica,
  'teste',
)
conferir('valor acima do máximo é cortado', acima.criterios[0].valor === 6, `99 → ${acima.criterios[0].valor}`)
conferir('soma não estoura o valor total', acima.nota_bruta === 20, `${acima.nota_bruta}/20`)
conferir('correção perfeita vale 10', acima.nota_final === 10)

// 3. valor negativo e texto com vírgula decimal
const estranho = montarCorrecao(
  {
    criterios: [
      { id: 'c1', valor: -3, justificativa: 'x' },
      { id: 'c2', valor: '3,5', justificativa: 'y' },
      { id: 'c3', valor: 'sem nota' },
      { id: 'c4', valor: 2 },
    ],
  },
  rubrica,
  'teste',
)
conferir('valor negativo vira zero', estranho.criterios[0].valor === 0)
conferir('texto "3,5" vira número', estranho.criterios[1].valor === 3.5, `${estranho.criterios[1].valor}`)
conferir('texto sem número vira zero', estranho.criterios[2].valor === 0)
conferir('critério sem justificativa ganha aviso', /Sem justificativa/.test(estranho.criterios[2].justificativa))

// 4. critério faltando → erro explícito (não nota zero silenciosa)
const faltando = esperaErro(() =>
  montarCorrecao(
    { criterios: [{ id: 'c1', valor: 6 }, { id: 'c2', valor: 6 }, { id: 'c3', valor: 4 }] },
    rubrica,
    'teste',
  ),
)
conferir('critério faltando gera RESPOSTA_INCOMPLETA', faltando?.codigo === 'RESPOSTA_INCOMPLETA', faltando?.message ?? 'não lançou')

// 5. critérios fora de ordem (com id) e critério extra
const fora = montarCorrecao(
  {
    criterios: [
      { id: 'c4', valor: 4 },
      { id: 'c3', valor: 4 },
      { id: 'c2', valor: 6 },
      { id: 'c1', valor: 6 },
      { id: 'c9', valor: 10 },
    ],
  },
  rubrica,
  'teste',
)
conferir(
  'cada nota volta para o seu critério',
  fora.criterios.every((c, i) => c.id === rubrica[i].id && c.valor === rubrica[i].valor),
  fora.criterios.map((c) => `${c.id}=${c.valor}`).join(' '),
)
conferir('critério extra é ignorado', fora.nota_bruta === 20)

// 6. resposta sem id, na ordem da rubrica
const semId = montarCorrecao(
  { criterios: [{ valor: 6 }, { valor: 5 }, { valor: 4 }, { valor: 2 }] },
  rubrica,
  'teste',
)
conferir('sem id, usa a ordem da rubrica', semId.nota_bruta === 17, `${semId.nota_bruta}/20`)

// 7. campos opcionais ausentes e confiança fora de faixa
const vazio = montarCorrecao(
  { criterios: [{ id: 'c1', valor: 6 }, { id: 'c2', valor: 6 }, { id: 'c3', valor: 4 }, { id: 'c4', valor: 4 }], confianca: 1.7 },
  rubrica,
  'teste',
)
conferir('pontos fortes tem valor padrão', vazio.pontos_fortes.length > 0)
conferir(
  'padrão de pontos fortes vem dos critérios, não de frase genérica',
  vazio.pontos_fortes.every((t) => !/^Redação entregue dentro das instruções\.$/.test(t)),
  vazio.pontos_fortes[0],
)
conferir('padrão de a desenvolver é acionável', /Mantenha o padrão/i.test(vazio.pontos_desenvolver[0]), vazio.pontos_desenvolver[0])
conferir('pontos a desenvolver tem valor padrão', vazio.pontos_desenvolver.length > 0)
conferir('comentário tem valor padrão', vazio.comentario.length > 0)
conferir('confiança acima de 1 é cortada', vazio.confianca === 1, `${vazio.confianca}`)

const semConfianca = montarCorrecao(
  { criterios: [{ id: 'c1', valor: 1 }, { id: 'c2', valor: 1 }, { id: 'c3', valor: 1 }, { id: 'c4', valor: 1 }], confianca: 'alta' },
  rubrica,
  'teste',
)
conferir('confiança inválida vira nula', semConfianca.confianca === null)
conferir('nota final coerente com a bruta', semConfianca.nota_final === 2, `${semConfianca.nota_bruta}/20 → ${semConfianca.nota_final}`)

// 7b. modelo devolve listas vazias: a devolutiva sai dos critérios
const vazias = montarCorrecao(
  {
    criterios: [
      { id: 'c1', valor: 6, justificativa: 'Definiu bem sensibilidade e especificidade.' },
      { id: 'c2', valor: 2, justificativa: 'Não aplicou a um caso concreto.' },
      { id: 'c3', valor: 1, justificativa: 'Trouxe afirmação sem fonte.' },
      { id: 'c4', valor: 4 },
    ],
    pontos_fortes: [],
    pontos_desenvolver: [],
  },
  rubrica,
  'teste',
)
conferir('ponto forte cita o critério e a justificativa', /^Precisão conceitual: Definiu bem/.test(vazias.pontos_fortes[0]), vazias.pontos_fortes[0])
conferir('ponto a desenvolver cita o pior critério', /^Argumentação:/.test(vazias.pontos_desenvolver[0]), vazias.pontos_desenvolver[0])
conferir('lista vazia nunca chega ao aluno', vazias.pontos_fortes.length > 0 && vazias.pontos_desenvolver.length > 0)

// 7c. nível declarado pelo modelo limita a nota (evita inflação)
const nivelBom = montarCorrecao(
  { criterios: [{ id: 'c1', nivel: 'bom', valor: 6 }, { id: 'c2', nivel: 'regular', valor: 6 }, { id: 'c3', nivel: 'insuficiente', valor: 4 }, { id: 'c4', nivel: 'excelente', valor: 4 }] },
  rubrica,
  'teste',
)
conferir("'bom' com valor máximo é cortado para 89% do critério (5,3 de 6)", nivelBom.criterios[0].valor === 5.3, `${nivelBom.criterios[0].valor}`)
conferir("'regular' com valor máximo é cortado para 69% do critério (4,1 de 6)", nivelBom.criterios[1].valor === 4.1, `${nivelBom.criterios[1].valor}`)
conferir("'insuficiente' nunca passa de 49%", nivelBom.criterios[2].valor <= 2, `${nivelBom.criterios[2].valor}`)
conferir("'excelente' com 4 fica em 4", nivelBom.criterios[3].valor === 4)
conferir('nível fica registrado no critério', nivelBom.criterios[0].nivel === 'bom')

const semNivel = montarCorrecao(
  { criterios: [{ id: 'c1', valor: 6 }, { id: 'c2', nivel: 'ótimo', valor: 6 }, { id: 'c3', valor: 4 }, { id: 'c4', valor: 4 }] },
  rubrica,
  'teste',
)
conferir('nível ausente não altera a nota', semNivel.criterios[0].valor === 6)
conferir('nível desconhecido é ignorado', semNivel.criterios[1].valor === 6 && semNivel.criterios[1].nivel === null)

const nivelSemNumero = montarCorrecao(
  { criterios: [{ id: 'c1', nivel: 'excelente', valor: 'sem nota' }, { id: 'c2', valor: 4 }, { id: 'c3', valor: 3 }, { id: 'c4', valor: 3 }] },
  rubrica,
  'teste',
)
conferir('nível sem número não inventa nota', nivelSemNumero.criterios[0].valor === 0 && nivelSemNumero.criterios[0].nivel === null)

// 7d. citação entre aspas é conferida contra a transcrição
const textoBase = 'A sensibilidade é a proporção de doentes identificados como positivos, e a especificidade mede os sadios.'
const comCitacao = montarCorrecao(
  {
    criterios: [
      { id: 'c1', valor: 6, justificativa: 'Define bem ao dizer "a proporção de doentes identificados como positivos".' },
      { id: 'c2', valor: 6, justificativa: 'Cita "o valor preditivo depende da prevalência da doença", que não está no texto.' },
      { id: 'c3', valor: 4, justificativa: 'Sem citação alguma aqui.' },
      { id: 'c4', valor: 4, justificativa: 'Cita "A SENSIBILIDADE É A PROPORÇÃO DE DOENTES" em maiúsculas.' },
    ],
  },
  rubrica,
  'teste',
  textoBase,
)
conferir('citação que existe é confirmada', comCitacao.criterios[0].citacao_conferida === true)
conferir('citação inventada é sinalizada', comCitacao.criterios[1].citacao_conferida === false)
conferir('sem citação não há o que conferir', comCitacao.criterios[2].citacao_conferida === null)
conferir('conferência ignora caixa', comCitacao.criterios[3].citacao_conferida === true)
const semTexto = montarCorrecao(
  {
    criterios: [
      { id: 'c1', valor: 6, justificativa: 'Cita "algo que não existe aqui".' },
      { id: 'c2', valor: 6 },
      { id: 'c3', valor: 4 },
      { id: 'c4', valor: 4 },
    ],
  },
  rubrica,
  'teste',
)
conferir('sem transcrição não há conferência', semTexto.criterios[0].citacao_conferida === null)

// 8. rubrica de 10 pontos: a nota final é normalizada em 0–10
const dez = montarCorrecao(
  { criterios: [{ id: 'a', valor: 5 }, { id: 'b', valor: 2.5 }] },
  [
    { id: 'a', nome: 'A', descricao: '', valor: 5 },
    { id: 'b', nome: 'B', descricao: '', valor: 5 },
  ],
  'teste',
)
conferir('rubrica de 10 pontos: 7,5/10 → 7,5', dez.nota_final === 7.5, `${dez.nota_bruta}/${dez.nota_final}`)

console.log('')
if (falhas > 0) {
  console.log(`  \x1b[31m${falhas} verificação(ões) falharam.\x1b[0m\n`)
  process.exit(1)
}
console.log('  \x1b[32mTodas as verificações passaram.\x1b[0m\n')
