#!/usr/bin/env node
/**
 * Testa a conferência de integridade com dados quebrados de propósito.
 *
 *   pnpm test:integridade
 *
 * Sem isto, `pnpm verificar` seria só uma tela verde: ele diria "tudo certo" num
 * banco vazio e ninguém saberia se ele detecta alguma coisa. Cada caso abaixo
 * estraga um dado e exige o código de erro correspondente.
 */
import { conferir, notaDe } from './_integridade.mjs'

const verificacoes = []
function conferirIgual(nome, obtido, esperado, detalhe = '') {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  verificacoes.push(ok)
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${nome}${detalhe ? ` \x1b[2m· ${detalhe}\x1b[0m` : ''}`)
  if (!ok) console.log(`      esperado ${JSON.stringify(esperado)}, obtido ${JSON.stringify(obtido)}`)
}

const turma = { id: 't1', nome: 'Turma A', codigo_siga: 'CBV018GV-A', periodo: '2026/3', curso: 'Ciências Biológicas' }
const perfil = { id: 'p1', papel: 'aluno', nome_completo: 'Ana', matricula: '202506007GV', email: 'a@ufjf.br', turma_id: 't1' }
const avaliacao = {
  id: 'av1',
  turma_id: 't1',
  titulo: 'Redação 1',
  valor_total: 20,
  peso_siga: 10,
  rubrica: [
    { id: 'c1', nome: 'Conceito', valor: 6 },
    { id: 'c2', nome: 'Aplicação', valor: 6 },
    { id: 'c3', nome: 'Escrita', valor: 4 },
    { id: 'c4', nome: 'Referências', valor: 4 },
  ],
}
const submissao = {
  id: 's1',
  avaliacao_id: 'av1',
  aluno_id: 'p1',
  status: 'enviada',
  enviado_em: '2026-11-16T10:00:00Z',
  transcrito: 'texto',
}
const correcao = {
  id: 'c1',
  submissao_id: 's1',
  criterios: [
    { id: 'c1', valor: 5 },
    { id: 'c2', valor: 4 },
    { id: 'c3', valor: 3 },
    { id: 'c4', valor: 3 },
  ],
  nota_bruta: 15,
  nota_final: 7.5,
  decisao: 'aprovada',
  revisado_em: '2026-11-16T11:00:00Z',
}

const base = () => ({
  turmas: [turma],
  alunos_esperados: [{ id: 'e1', turma_id: 't1', matricula: '202506007GV', user_id: 'p1' }],
  profiles: [perfil],
  avaliacoes: [avaliacao],
  submissoes: [submissao],
  correcoes: [correcao],
  lancamentos_siga: [],
  auditoria: [],
})

/** Copia profunda simples para não vazar alteração entre casos. */
const copia = () => JSON.parse(JSON.stringify(base()))
// compara como conjunto: a ordem dos achados não é contrato
const codigos = (dados) => conferir(dados).map((a) => a.codigo).sort()
const com = (mexer) => {
  const d = copia()
  mexer(d)
  return d
}

console.log('\n  Integridade dos dados · casos quebrados de propósito\n')

conferirIgual('dados sadios não geram achado', codigos(base()), [])

// mudar o valor total depois de corrigir também desalinha a nota final: as
// duas coisas precisam aparecer juntas, porque juntas contam a história
conferirIgual(
  'rubrica que não fecha com o valor total',
  codigos(com((d) => (d.avaliacoes[0].valor_total = 21))),
  ['nota-final-divergente', 'rubrica-nao-fecha'],
)

conferirIgual(
  'nota final que não bate com a fórmula',
  codigos(com((d) => (d.correcoes[0].nota_final = 8))),
  ['nota-final-divergente'],
)

conferirIgual(
  'critérios que não somam a nota bruta',
  codigos(com((d) => (d.correcoes[0].nota_bruta = 16))),
  ['criterios-nao-somam', 'nota-final-divergente'],
)

conferirIgual(
  'nota acima do valor total da avaliação',
  codigos(com((d) => ((d.correcoes[0].nota_bruta = 22), (d.correcoes[0].nota_final = 11)))),
  ['criterios-nao-somam', 'nota-fora-da-escala'],
)

conferirIgual(
  'redação apontando para avaliação inexistente',
  codigos(com((d) => (d.submissoes[0].avaliacao_id = 'av-que-nao-existe'))),
  ['submissao-sem-avaliacao'],
)

conferirIgual(
  'perfil apontando para turma inexistente',
  codigos(com((d) => (d.profiles[0].turma_id = 't-fantasma'))),
  ['perfil-sem-turma'],
)

conferirIgual(
  'matrícula apontando para conta fantasma',
  codigos(com((d) => (d.alunos_esperados[0].user_id = 'p-fantasma'))),
  ['lista-aponta-fantasma'],
)

conferirIgual(
  'entrega enviada sem data de envio',
  codigos(com((d) => delete d.submissoes[0].enviado_em)),
  ['entrega-sem-data'],
)

conferirIgual(
  'duas entregas da mesma avaliação para o mesmo aluno',
  codigos(com((d) => d.submissoes.push({ ...d.submissoes[0], id: 's2' }))),
  ['entrega-duplicada'],
)

conferirIgual(
  'lançamento no SIGA apontando para correção apagada',
  codigos(com((d) => d.lancamentos_siga.push({ id: 'l1', correcao_id: 'c-que-sumiu', matricula: '202506007GV', nota: 7.5, sucesso: true, http_status: 200 }))),
  ['lancamento-orfao'],
)

conferirIgual(
  'correção aprovada sem data de revisão',
  codigos(com((d) => delete d.correcoes[0].revisado_em)),
  ['aprovada-sem-revisao'],
)

conferirIgual(
  'correção sem critérios',
  codigos(com((d) => (d.correcoes[0].criterios = []))),
  ['correcao-sem-criterios'],
)

conferirIgual(
  'critério com valor zero na rubrica',
  codigos(com((d) => (d.avaliacoes[0].rubrica[0].valor = 0))),
  ['criterio-sem-valor', 'rubrica-nao-fecha'],
)

// ---- a conta da nota --------------------------------------------------------
conferirIgual('15 de 20 vira 7,5', notaDe(15, 20), 7.5)
conferirIgual('17,6 de 20 vira 8,8', notaDe(17.6, 20), 8.8)
conferirIgual('8,33 de 10 vira 8,3', notaDe(8.33, 10), 8.3)
conferirIgual('nota cheia vira 10', notaDe(20, 20), 10)
conferirIgual('zero vira zero', notaDe(0, 20), 0)

// ---- tolerância de arredondamento ------------------------------------------
conferirIgual(
  'diferença de 0,01 na nota final é aceita',
  codigos(com((d) => (d.correcoes[0].nota_final = 7.51))),
  [],
)

const falhas = verificacoes.filter((v) => !v).length
console.log('')
if (falhas > 0) {
  console.log(`\x1b[31m${falhas} de ${verificacoes.length} verificações falharam.\x1b[0m\n`)
  process.exit(1)
}
console.log(`\x1b[32m${verificacoes.length} verificações de integridade passaram.\x1b[0m\n`)
