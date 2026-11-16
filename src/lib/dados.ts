import type {
  Avaliacao,
  AvaliacaoDoAluno,
  Correcao,
  Criterio,
  Esperado,
  LancamentoSiga,
  Perfil,
  ResumoAvaliacao,
  StatusAvaliacao,
  QuadroSiga,
  QuadroNotasSiga,
  Submissao,
  SubmissaoDoProfessor,
  Turma,
  Diagnostico,
} from './types'

export interface Cadastro {
  nome_completo: string
  matricula: string
  email: string
  curso: string
  turma_id: string
  senha: string
  /** O aluno marcou o aviso de privacidade; o banco grava a data em profiles.consentimento_em. */
  consentimento?: boolean
}

export type MotivoValidacao =
  | 'ok'
  | 'matricula'
  | 'email'
  | 'ja_cadastrado'
  | 'dados_incompletos'
  | 'sem_email_na_lista'
  | 'erro'

export interface NovaAvaliacao {
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
}

export interface Revisao {
  criterios: Correcao['criterios']
  comentario_professor: string | null
  /** Devolutiva qualitativa; ausente = manter a que veio do modelo. */
  pontos_fortes?: string[]
  pontos_desenvolver?: string[]
  decisao: 'aprovada' | 'ajustada' | 'rejeitada'
}

export interface LinhaImportacao {
  matricula: string
  nome_completo: string
  email: string
}

/**
 * Contrato único de dados. Duas implementações:
 *  - `dadosSupabase`  → produção (Supabase + funções /api)
 *  - `dadosDemo`      → demonstração local, sem rede e sem credenciais
 * A interface (React) nunca sabe qual está ativa.
 */
export interface ResumoTurma {
  alunos: number
  avaliacoes: number
  enviadas: number
  /** Notas já lançadas no SIGA — a turma não pode ser apagada enquanto houver. */
  lancadas: number
}

export type RespostaApagarAvaliacao =
  | { ok: true; titulo: string }
  | {
      ok: false
      motivo: 'sem_permissao' | 'nao_encontrada' | 'tem_submissoes' | 'tem_lancamentos'
      submissoes?: number
      lancadas?: number
    }

export type RespostaApagarTurma =
  | { ok: true; alunos: number; avaliacoes: number; fotos_apagadas?: number }
  | { ok: false; motivo: 'sem_permissao' | 'nao_encontrada' | 'tem_lancamentos'; lancadas?: number }

export interface Dados {
  modo: 'supabase' | 'demo'

  // sessão
  sessaoAtual(): Promise<Perfil | null>
  observarSessao(cb: (perfil: Perfil | null) => void): () => void
  entrar(email: string, senha: string): Promise<Perfil>
  sair(): Promise<void>
  cadastrar(entrada: Cadastro): Promise<{ precisaConfirmarEmail: boolean }>
  turmas(): Promise<Turma[]>
  validarMatricula(turmaId: string, matricula: string, email: string): Promise<MotivoValidacao>
  recuperarSenha(email: string): Promise<void>
  atualizarPerfil(p: { nome_completo: string; telefone: string | null; curso: string }): Promise<void>
  alterarSenha(novaSenha: string): Promise<void>

  // aluno
  avaliacoesDoAluno(): Promise<AvaliacaoDoAluno[]>
  avaliacao(id: string): Promise<Avaliacao | null>
  obterOuCriarSubmissao(avaliacaoId: string): Promise<Submissao>
  enviarFoto(submissaoId: string, arquivo: Blob): Promise<string>
  urlDaFoto(path: string | null): Promise<string | null>
  transcrever(submissaoId: string): Promise<Submissao>
  salvarTranscricao(submissaoId: string, texto: string): Promise<void>
  enviarRedacao(submissaoId: string): Promise<void>

  // professor
  turmasTodas(): Promise<Turma[]>
  criarTurma(dados: { nome: string; codigo_siga: string; periodo: string; curso: string }): Promise<Turma>
  /** Quantos alunos, avaliações e notas no SIGA dependem desta turma. */
  resumoTurma(turmaId: string): Promise<ResumoTurma>
  /** Apaga a turma e tudo que pertence a ela; recusa se já há nota lançada no SIGA. */
  apagarTurma(turmaId: string): Promise<RespostaApagarTurma>
  /** Apaga uma avaliação sem redações enviadas e sem nota lançada no SIGA. */
  apagarAvaliacao(avaliacaoId: string): Promise<RespostaApagarAvaliacao>
  resumoAvaliacoes(): Promise<ResumoAvaliacao[]>
  criarAvaliacao(dados: NovaAvaliacao): Promise<Avaliacao>
  mudarStatusAvaliacao(id: string, status: StatusAvaliacao): Promise<void>
  /** Muda (ou remove, com null) o prazo de entrega. Não mexe em nota já lançada. */
  mudarPrazoAvaliacao(id: string, prazoEm: string | null): Promise<void>
  alunosDaTurma(turmaId: string): Promise<Esperado[]>
  importarAlunos(turmaId: string, linhas: LinhaImportacao[]): Promise<{ inseridos: number; atualizados: number }>
  /** Liga/desliga a exigência de e-mail já cadastrado na lista da turma. */
  definirExigenciaDeEmail(turmaId: string, exige: boolean): Promise<void>
  submissoesDaAvaliacao(avaliacaoId: string): Promise<SubmissaoDoProfessor[]>
  corrigir(submissaoId: string): Promise<Correcao>
  /** Cria correção zerada para o professor preencher sem depender do Llama. */
  corrigirManual(submissaoId: string): Promise<Correcao>
  salvarRevisao(correcaoId: string, revisao: Revisao): Promise<void>
  lancarNoSiga(correcaoId: string): Promise<LancamentoSiga>
  /** Avaliações que já existem no SIGA para a turma/período. */
  avaliacoesDoSiga(turma: string, periodo: string): Promise<QuadroSiga>
  /** Quadro de notas da turma no SIGA (leitura). Usado para conferir os lançamentos. */
  notasDoSiga(turma: string, periodo: string): Promise<QuadroNotasSiga>
  /** Diagnóstico do servidor (OCR, corretor, SIGA); null no modo demonstração. */
  saude(): Promise<Diagnostico | null>
}

let instancia: Dados | null = null

/** Escolhe a implementação uma única vez por sessão de página. */
export async function dados(): Promise<Dados> {
  if (instancia) return instancia
  const url = import.meta.env.VITE_SUPABASE_URL
  const chave = import.meta.env.VITE_SUPABASE_ANON_KEY
  const forcarDemo = import.meta.env.VITE_MODO_DEMO === '1'

  if (!forcarDemo && url && chave) {
    const { criarDadosSupabase } = await import('./dadosSupabase')
    instancia = await criarDadosSupabase(url, chave)
  } else {
    const { criarDadosDemo } = await import('./dadosDemo')
    instancia = criarDadosDemo()
  }
  return instancia
}
