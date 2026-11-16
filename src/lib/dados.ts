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
  Submissao,
  SubmissaoDoProfessor,
  Turma,
} from './types'

export interface Cadastro {
  nome_completo: string
  matricula: string
  email: string
  curso: string
  turma_id: string
  senha: string
}

export type MotivoValidacao = 'ok' | 'matricula' | 'email' | 'ja_cadastrado' | 'dados_incompletos' | 'erro'

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
  resumoAvaliacoes(): Promise<ResumoAvaliacao[]>
  criarAvaliacao(dados: NovaAvaliacao): Promise<Avaliacao>
  mudarStatusAvaliacao(id: string, status: StatusAvaliacao): Promise<void>
  alunosDaTurma(turmaId: string): Promise<Esperado[]>
  importarAlunos(turmaId: string, linhas: LinhaImportacao[]): Promise<{ inseridos: number; atualizados: number }>
  submissoesDaAvaliacao(avaliacaoId: string): Promise<SubmissaoDoProfessor[]>
  corrigir(submissaoId: string): Promise<Correcao>
  /** Cria correção zerada para o professor preencher sem depender do Llama. */
  corrigirManual(submissaoId: string): Promise<Correcao>
  salvarRevisao(correcaoId: string, revisao: Revisao): Promise<void>
  lancarNoSiga(correcaoId: string): Promise<LancamentoSiga>
  /** Avaliações que já existem no SIGA para a turma/período. */
  avaliacoesDoSiga(turma: string, periodo: string): Promise<QuadroSiga>
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
