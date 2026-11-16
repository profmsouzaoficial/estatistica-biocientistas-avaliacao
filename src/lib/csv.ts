/**
 * Leitor da lista de alunos colada ou importada de planilha.
 *
 * Vive fora da página para poder ser testado sem navegador (`pnpm test:csv`).
 * A regra é aceitar o que o SIGA e o Excel realmente produzem: `;`, `,` ou
 * tabulação, com ou sem cabeçalho, e em qualquer ordem de colunas.
 */
import type { LinhaImportacao } from './dados'

export interface ResultadoImportacao {
  linhas: LinhaImportacao[]
  problemas: string[]
}

/** Nomes de coluna aceitos. Comparados depois de tirar acento e pontuação. */
const COLUNAS: Record<'matricula' | 'nome' | 'email', RegExp[]> = {
  matricula: [/^matricula$/, /^mat$/, /^matr$/, /^registro$/, /^ra$/, /^codigo$/],
  nome: [/^nome$/, /^nome completo$/, /^nome do aluno$/, /^aluno$/, /^aluna$/, /^discente$/],
  email: [/^email$/, /^e mail$/, /^correio$/, /^correio eletronico$/],
}

function normalizarCabecalho(campo: string): string {
  return campo
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function reconhecerColuna(campo: string): 'matricula' | 'nome' | 'email' | null {
  const limpo = normalizarCabecalho(campo)
  for (const chave of ['matricula', 'nome', 'email'] as const) {
    if (COLUNAS[chave].some((r) => r.test(limpo))) return chave
  }
  return null
}

/**
 * Quebra a linha no separador, respeitando aspas.
 * `"Souza, Márcio";202506013GV` é um registro, não três.
 */
function dividir(linha: string, separador: string): string[] {
  const campos: string[] = []
  let atual = ''
  let dentroDeAspas = false
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i]
    if (c === '"') {
      if (dentroDeAspas && linha[i + 1] === '"') {
        atual += '"'
        i += 1
      } else {
        dentroDeAspas = !dentroDeAspas
      }
      continue
    }
    if (!dentroDeAspas && c === separador) {
      campos.push(atual)
      atual = ''
      continue
    }
    atual += c
  }
  campos.push(atual)
  return campos.map((c) => c.trim())
}

function escolherSeparador(linha: string): string {
  if (linha.includes(';')) return ';'
  if (linha.includes('\t')) return '\t'
  return ','
}

const PARECE_MATRICULA = /^\d{6,}[A-Z]{0,3}$/
const PARECE_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** Nome tem letra e não é só número — serve para desconfiar da ordem das colunas. */
function pareceNome(campo: string): boolean {
  return /[A-Za-zÀ-ÿ]{2,}/.test(campo) && !PARECE_EMAIL.test(campo) && !PARECE_MATRICULA.test(campo.toUpperCase())
}

export function interpretarCsv(texto: string, opcoes: { exigirEmail?: boolean } = {}): ResultadoImportacao {
  const exigirEmail = opcoes.exigirEmail ?? true
  const problemas: string[] = []
  const linhas: LinhaImportacao[] = []

  const brutas = texto
    .replace(/^\ufeff/, '')
    .split(/\r?\n/)
    .map((l, i) => ({ texto: l.trim(), numero: i + 1 }))
    .filter((l) => l.texto !== '')

  if (brutas.length === 0) return { linhas, problemas }

  // ---- cabeçalho ---------------------------------------------------------
  let ordem: { matricula: number; nome: number; email: number } | null = null
  let inicio = 0
  const primeira = dividir(brutas[0].texto, escolherSeparador(brutas[0].texto))
  const reconhecidas = primeira.map(reconhecerColuna)
  const achouMatricula = reconhecidas.indexOf('matricula')
  const achouNome = reconhecidas.indexOf('nome')
  const achouEmail = reconhecidas.indexOf('email')
  if (achouMatricula >= 0 && (achouNome >= 0 || achouEmail >= 0)) {
    ordem = {
      matricula: achouMatricula,
      nome: achouNome >= 0 ? achouNome : 1,
      email: achouEmail >= 0 ? achouEmail : 2,
    }
    inicio = 1
  }

  // ---- corpo -------------------------------------------------------------
  for (let i = inicio; i < brutas.length; i += 1) {
    const { texto: linha, numero } = brutas[i]
    const campos = dividir(linha, escolherSeparador(linha))

    let bruta = campos[ordem ? ordem.matricula : 0] ?? ''
    let nome = campos[ordem ? ordem.nome : 1] ?? ''
    let email = campos[ordem ? ordem.email : 2] ?? ''

    // Sem cabeçalho e com as colunas trocadas (nome primeiro): desfaz a troca.
    // A comparação é feita no texto cru — antes de pôr em maiúsculas, senão o
    // nome vira "ANACLARASOUZA" e não há como reconstruí-lo.
    if (!ordem && pareceNome(bruta) && PARECE_MATRICULA.test(nome.trim().toUpperCase())) {
      const temporaria = bruta
      bruta = nome
      nome = temporaria
      email = campos[3] ?? email
    }

    const matricula = bruta.trim().toUpperCase().replace(/\s+/g, '')

    if (campos.length < 2 || (!nome && !matricula)) {
      problemas.push(`Linha ${numero}: precisa de matrícula e nome.`)
      continue
    }
    if (!PARECE_MATRICULA.test(matricula)) {
      problemas.push(`Linha ${numero}: matrícula "${matricula}" não parece válida.`)
      continue
    }
    if (!nome) {
      problemas.push(`Linha ${numero}: falta o nome completo.`)
      continue
    }
    if (!email) {
      if (exigirEmail) {
        problemas.push(`Linha ${numero}: falta o e-mail (esta turma exige e-mail na lista).`)
        continue
      }
    } else if (!PARECE_EMAIL.test(email)) {
      problemas.push(`Linha ${numero}: e-mail "${email}" inválido.`)
      continue
    }
    if (linhas.some((l) => l.matricula === matricula)) {
      problemas.push(`Linha ${numero}: matrícula ${matricula} repetida.`)
      continue
    }
    linhas.push({ matricula, nome_completo: nome, email })
  }

  return { linhas, problemas }
}
