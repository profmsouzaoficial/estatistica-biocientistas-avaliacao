/** Capítulos do livro "Análise de Dados para Biocientistas" (estatistica-biocientistas.vercel.app). */
export interface Capitulo {
  id: string
  numero: number
  titulo: string
}

export const CAPITULOS: Capitulo[] = [
  { id: 'cap01', numero: 1, titulo: 'Introdução ao método estatístico' },
  { id: 'cap02', numero: 2, titulo: 'Tipos de estudos na área da saúde' },
  { id: 'cap03', numero: 3, titulo: 'Amostragem nas Ciências da Saúde' },
  { id: 'cap04', numero: 4, titulo: 'Análise Exploratória de Dados' },
  { id: 'cap05', numero: 5, titulo: 'Probabilidade nas Ciências da Saúde' },
  { id: 'cap06', numero: 6, titulo: 'Testes Diagnósticos nas Ciências da Saúde' },
  { id: 'cap07', numero: 7, titulo: 'Modelos Estatísticos' },
  { id: 'cap08', numero: 8, titulo: 'Testes de Hipóteses' },
  { id: 'cap09', numero: 9, titulo: 'Intervalos de Confiança' },
  { id: 'cap10', numero: 10, titulo: 'Correlação e Regressão' },
]

export function tituloCapitulo(id: string | null | undefined): string | null {
  if (!id) return null
  const c = CAPITULOS.find((x) => x.id === id)
  return c ? `Capítulo ${c.numero} — ${c.titulo}` : null
}
