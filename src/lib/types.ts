// Tipos compartilhados entre o app (navegador) e as funções de servidor.

export type Papel = 'aluno' | 'professor'

export interface Turma {
  id: string
  nome: string
  codigo_siga: string
  periodo: string
  curso: string
  ativo: boolean
  /** false = a lista pode vir sem e-mail; o aluno informa o dele no cadastro. */
  exige_email: boolean
}

export interface Perfil {
  id: string
  papel: Papel
  nome_completo: string
  matricula: string | null
  email: string
  curso: string | null
  telefone: string | null
  turma_id: string | null
  precisa_trocar_senha?: boolean
}

export interface Criterio {
  id: string
  nome: string
  descricao: string
  valor: number
}

export type StatusAvaliacao = 'rascunho' | 'publicada' | 'encerrada'

export interface Avaliacao {
  id: string
  turma_id: string
  titulo: string
  tema: string
  instrucoes: string
  capitulo: string | null
  valor_total: number
  rubrica: Criterio[]
  descricao_siga: string | null
  peso_siga: number
  data_siga: string | null
  abre_em: string | null
  prazo_em: string | null
  status: StatusAvaliacao
  criado_em: string
}

export type StatusSubmissao = 'rascunho' | 'enviada' | 'corrigida' | 'devolvida'

export interface Submissao {
  id: string
  avaliacao_id: string
  aluno_id: string
  foto_path: string | null
  transcrito: string | null
  transcrito_modelo: string | null
  confirmado_em: string | null
  status: StatusSubmissao
  enviado_em: string | null
  criado_em: string
}

export type NivelNota = 'excelente' | 'bom' | 'regular' | 'insuficiente'

export interface CriterioNota {
  id: string
  nome: string
  valor: number
  justificativa: string
  /** Nível declarado pelo modelo; a nota fica dentro da faixa dele. */
  nivel?: NivelNota | null
  /** A citação entre aspas existe na transcrição? `null` quando não há citação. */
  citacao_conferida?: boolean | null
}

export type Decisao = 'pendente' | 'aprovada' | 'ajustada' | 'rejeitada'

export interface Correcao {
  id: string
  submissao_id: string
  modelo: string | null
  criterios: CriterioNota[]
  nota_bruta: number
  nota_final: number
  pontos_fortes: string[]
  pontos_desenvolver: string[]
  comentario_ia: string | null
  comentario_professor: string | null
  confianca: number | null
  decisao: Decisao
  revisado_em: string | null
  criado_em: string
}

export interface LancamentoSiga {
  id: string
  correcao_id: string | null
  submissao_id: string | null
  matricula: string
  turma_siga: string
  periodo: string | null
  descricao_avaliacao: string
  nota: number
  sucesso: boolean
  http_status: number | null
  erro: string | null
  criado_em: string
}

// ---- SIGA ------------------------------------------------------------------

export interface AvaliacaoSiga {
  id: string | null
  descricao: string
  peso: number
  /** DD/MM/AAAA, como o SIGA devolve */
  data: string | null
}

export interface NotaDoAlunoSiga {
  matricula: string
  nome: string
  /** Nota por descrição de avaliação, como o SIGA devolve (null = sem nota). */
  notas: Record<string, number | null>
  nota_final: number | null
  frequencia: string | null
  situacao: string | null
}

export interface QuadroNotasSiga {
  consulta: QuadroSiga['consulta']
  avaliacoes: AvaliacaoSiga[]
  alunos: NotaDoAlunoSiga[]
  resumo: Record<string, unknown> | null
  avisos: string[]
}

export interface QuadroSiga {
  consulta: {
    turma: string
    periodo: string
    id_turma: string | null
    id_periodo: string | null
    gerado_em: string | null
  }
  avaliacoes: AvaliacaoSiga[]
}

// ---- modelos de tela -------------------------------------------------------

export interface AvaliacaoDoAluno extends Avaliacao {
  submissao: Submissao | null
  correcao: Correcao | null
}

export interface AlunoDaSubmissao {
  id: string
  nome_completo: string
  matricula: string | null
  email: string
}

export interface SubmissaoDoProfessor {
  submissao: Submissao
  aluno: AlunoDaSubmissao
  correcao: Correcao | null
  lancamento: LancamentoSiga | null
}

export interface Esperado {
  id: string
  turma_id: string
  matricula: string
  nome_completo: string
  email: string
  user_id: string | null
}

export interface ResumoAvaliacao extends Avaliacao {
  total_alunos: number
  enviadas: number
  corrigidas: number
  aprovadas: number
  lancadas: number
}

// ---------------------------------------------------------------------------

/** Converte a nota na escala da avaliação (ex.: 0–20) para a escala do SIGA (0–10). */
export function notaParaSiga(notaBruta: number, valorTotal: number): number {
  if (!valorTotal || valorTotal <= 0) return 0
  const n = (notaBruta / valorTotal) * 10
  return Math.max(0, Math.min(10, Math.round(n * 10) / 10))
}

/** O SIGA aceita número ou texto com vírgula; mandamos texto com vírgula. */
export function notaComVirgula(nota: number): string {
  return nota.toFixed(1).replace('.', ',')
}

/** Resposta de /api/saude: só booleans, nenhum segredo. */
export interface Diagnostico {
  ocr: { configurado: boolean; provedor: string; modelo: string | null }
  corretor: { configurado: boolean; modelo: string | null }
  siga: { configurado: boolean; escala?: 'nota10' | 'pontos' }
  supabase: { configurado: boolean }
}
