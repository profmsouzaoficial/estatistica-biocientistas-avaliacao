/**
 * Modo demonstração: roda 100% no navegador, sem Supabase, sem LLM e sem OCR.
 * A nota e a devolutiva são geradas por uma heurística local — é um ensaio da
 * interface, não uma correção de verdade. A UI marca isso com o selo "demonstração".
 */
import type {
  Cadastro,
  ConsultaMatricula,
  Dados,
  LinhaImportacao,
  MotivoValidacao,
  NovaAvaliacao,
  Revisao,
} from './dados'
import { notaParaSiga } from './types'
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
  Submissao,
  SubmissaoDoProfessor,
  Turma,
} from './types'

const CHAVE = 'eba.demo.v2'
const SENHA_DEMO = 'demo12345'

interface PerfilDemo extends Perfil {
  senha: string
}

interface Base {
  turmas: Turma[]
  esperados: Esperado[]
  perfis: PerfilDemo[]
  avaliacoes: Avaliacao[]
  submissoes: Submissao[]
  correcoes: Correcao[]
  lancamentos: LancamentoSiga[]
  fotos: Record<string, string>
  sessaoId: string | null
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
const agora = () => new Date().toISOString()
const dias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()

function rubricaExemplo(total: number): Criterio[] {
  const base: Criterio[] = [
    {
      id: 'c1',
      nome: 'Precisão conceitual',
      descricao: 'Usa corretamente os conceitos estudados no capítulo, sem confundi-los.',
      valor: Math.round(total * 0.3 * 10) / 10,
    },
    {
      id: 'c2',
      nome: 'Interpretação e aplicação',
      descricao: 'Aplica o conceito a uma situação concreta e interpreta o resultado com senso crítico.',
      valor: Math.round(total * 0.3 * 10) / 10,
    },
    {
      id: 'c3',
      nome: 'Argumentação e evidências',
      descricao: 'Sustenta a resposta com dados, exemplos ou referências ao material da disciplina.',
      valor: Math.round(total * 0.2 * 10) / 10,
    },
    {
      id: 'c4',
      nome: 'Clareza e norma padrão',
      descricao: 'Texto organizado, legível, coeso e em português padrão.',
      valor: 0,
    },
  ]
  base[3].valor = Math.round((total - base.slice(0, 3).reduce((t, c) => t + c.valor, 0)) * 10) / 10
  return base
}

function baseInicial(): Base {
  const turmaId = 'turma-demo'
  const av1 = 'av-demo-1'
  const av2 = 'av-demo-2'
  const alunos: PerfilDemo[] = [
    {
      id: 'prof-demo',
      papel: 'professor',
      nome_completo: 'Márcio Luís Moreira de Souza',
      matricula: null,
      email: 'professor@demo.local',
      curso: 'Biociências',
      telefone: null,
      turma_id: null,
      senha: SENHA_DEMO,
    },
    {
      id: 'aluno-demo-1',
      papel: 'aluno',
      nome_completo: 'Ana Beatriz Lima Ferreira',
      matricula: '2026301001',
      email: 'aluno@demo.local',
      curso: 'Ciências Biológicas',
      telefone: null,
      turma_id: turmaId,
      senha: SENHA_DEMO,
    },
    {
      id: 'aluno-demo-2',
      papel: 'aluno',
      nome_completo: 'Carlos Eduardo Nunes',
      matricula: '2026301002',
      email: 'carlos@demo.local',
      curso: 'Ciências Biológicas',
      telefone: null,
      turma_id: turmaId,
      senha: SENHA_DEMO,
    },
    // Aluno que existe na lista e ainda não entregou: é assim que o professor vê
    // "faltam N" antes de fechar o prazo. Sem alguém faltando, esse caso nunca
    // apareceria na demonstração.
    {
      id: 'aluno-demo-4',
      papel: 'aluno',
      nome_completo: 'Diego Ramos Teixeira',
      matricula: '2026301004',
      email: 'diego@demo.local',
      curso: 'Ciências Biológicas',
      telefone: null,
      turma_id: turmaId,
      senha: SENHA_DEMO,
    },
    {
      id: 'aluno-demo-3',
      papel: 'aluno',
      nome_completo: 'Juliana Prado Machado',
      matricula: '2026301003',
      email: 'juliana@demo.local',
      curso: 'Ciências Biológicas',
      telefone: null,
      turma_id: turmaId,
      senha: SENHA_DEMO,
    },
  ]

  const textoAna = `A sensibilidade de um teste é a capacidade de identificar corretamente as pessoas que realmente têm a doença, ou seja, é a proporção de verdadeiros positivos entre os doentes. A especificidade, por outro lado, mede a capacidade de identificar corretamente as pessoas que não têm a doença, entre aquelas que de fato não a têm.

No exemplo discutido em aula, um teste com sensibilidade de 95% e especificidade de 90% parece excelente à primeira vista. Porém, quando aplicado a uma população com prevalência baixa, como 1%, o valor preditivo positivo cai de forma acentuada: mesmo com essas qualidades técnicas, a maior parte dos resultados positivos será falso-positiva.

Isso mostra que sensibilidade e especificidade são propriedades do teste, mas a interpretação clínica depende da prevalência. Por isso, um teste de triagem deve priorizar alta sensibilidade, aceitando mais falsos-positivos, porque o objetivo é não deixar passar nenhum doente. Já o teste confirmatório deve priorizar a especificidade.`

  const textoCarlos = `Sensibilidade é quando o teste dá positivo em quem tem a doença e especificidade é quando dá negativo em quem não tem.

Achei o conceito parecido com o que vimos em probabilidade condicional, mas não entendi muito bem a parte do valor preditivo.`

  const textoJuliana = `Os testes diagnósticos são ferramentas importantes na prática clínica. A sensibilidade indica a proporção de doentes que testam positivo, enquanto a especificidade indica a proporção de não doentes que testam negativo. É fundamental compreender que esses dois parâmetros não são suficientes para decidir condutas: o valor preditivo positivo depende diretamente da prevalência da doença na população estudada.

Em populações de baixa prevalência, um teste muito sensível pode gerar muitos falsos positivos, o que traz custos emocionais e financeiros. Por isso, a escolha do teste deve considerar o contexto: em programas de rastreamento, prioriza-se a sensibilidade; em situações de confirmação diagnóstica, prioriza-se a especificidade.`

  const rub1 = rubricaExemplo(20)
  const rub2 = rubricaExemplo(10)

  const avaliacoes: Avaliacao[] = [
    {
      id: av1,
      turma_id: turmaId,
      titulo: 'Redação 1 — Sensibilidade, especificidade e o valor preditivo',
      tema: 'Explique a diferença entre sensibilidade e especificidade de um teste diagnóstico e discuta por que o valor preditivo positivo depende da prevalência da doença.',
      instrucoes:
        'Escreva de 20 a 30 linhas, à mão, em uma folha A4. Use exemplos numéricos. Estruture em: (1) definições, (2) interpretação do exemplo, (3) implicação clínica. Não consulte o material durante a escrita.',
      capitulo: 'cap06',
      valor_total: 20,
      rubrica: rub1,
      descricao_siga: 'TVC 1',
      peso_siga: 10,
      data_siga: null,
      abre_em: dias(-7),
      prazo_em: dias(3),
      status: 'publicada',
      criado_em: dias(-8),
    },
    {
      id: av2,
      turma_id: turmaId,
      titulo: 'Redação 2 — Correlação não é causalidade',
      tema: 'Um estudo observacional encontra correlação negativa entre consumo de café e mortalidade. Um jornal noticia: "café prolonga a vida". Analise criticamente essa conclusão.',
      instrucoes:
        'Máximo de 20 linhas, manuscritas. Cite ao menos duas explicações alternativas para a associação observada e indique que desenho de estudo ajudaria a sustentar a causalidade.',
      capitulo: 'cap10',
      valor_total: 10,
      rubrica: rub2,
      descricao_siga: 'TVC 2',
      peso_siga: 10,
      data_siga: null,
      abre_em: dias(-1),
      prazo_em: dias(12),
      status: 'publicada',
      criado_em: dias(-2),
    },
  ]

  const subs: Submissao[] = [
    {
      id: 'sub-demo-1',
      avaliacao_id: av1,
      aluno_id: 'aluno-demo-1',
      foto_path: 'demo/ana-redacao1.jpg',
      transcrito: textoAna,
      transcrito_modelo: 'ocr (demonstração)',
      confirmado_em: dias(-3),
      status: 'corrigida',
      enviado_em: dias(-3),
      criado_em: dias(-4),
    },
    {
      id: 'sub-demo-2',
      avaliacao_id: av1,
      aluno_id: 'aluno-demo-2',
      foto_path: 'demo/carlos-redacao1.jpg',
      transcrito: textoCarlos,
      transcrito_modelo: 'ocr (demonstração)',
      confirmado_em: dias(-2),
      status: 'corrigida',
      enviado_em: dias(-2),
      criado_em: dias(-3),
    },
    {
      id: 'sub-demo-3',
      avaliacao_id: av1,
      aluno_id: 'aluno-demo-3',
      foto_path: 'demo/juliana-redacao1.jpg',
      transcrito: textoJuliana,
      transcrito_modelo: 'ocr (demonstração)',
      confirmado_em: dias(-1),
      status: 'corrigida',
      enviado_em: dias(-1),
      criado_em: dias(-2),
    },
  ]

  const correcoes: Correcao[] = [
    {
      id: 'cor-demo-1',
      submissao_id: 'sub-demo-1',
      modelo: 'simulação local (demonstração)',
      criterios: [
        { id: 'c1', nome: rub1[0].nome, valor: 5.4, justificativa: 'Define corretamente sensibilidade e especificidade e distingue propriedades do teste das do contexto.' },
        { id: 'c2', nome: rub1[1].nome, valor: 5.4, justificativa: 'Aplica o exemplo de 1% de prevalência e interpreta a queda do valor preditivo.' },
        { id: 'c3', nome: rub1[2].nome, valor: 3.4, justificativa: 'Usa o exemplo numérico da aula, mas não cita a fonte ou o capítulo.' },
        { id: 'c4', nome: rub1[3].nome, valor: 3.4, justificativa: 'Texto claro e bem estruturado em três blocos.' },
      ],
      nota_bruta: 17.6,
      nota_final: 8.8,
      pontos_fortes: [
        'Diferencia com precisão sensibilidade e especificidade, sem tratá-las como sinônimos.',
        'Interpreta corretamente o efeito da baixa prevalência sobre o valor preditivo positivo.',
      ],
      pontos_desenvolver: [
        'Explique o papel do valor preditivo negativo, que ficou implícito.',
        'Cite explicitamente o exemplo do capítulo 6 para sustentar a discussão.',
      ],
      comentario_ia: 'Resposta madura, com domínio conceitual e boa articulação entre teoria e exemplo.',
      comentario_professor: null,
      confianca: 0.86,
      decisao: 'pendente',
      revisado_em: null,
      criado_em: dias(-3),
    },
    {
      id: 'cor-demo-2',
      submissao_id: 'sub-demo-2',
      modelo: 'simulação local (demonstração)',
      criterios: [
        { id: 'c1', nome: rub1[0].nome, valor: 3.0, justificativa: 'As definições estão corretas, mas incompletas: falta a noção de proporção entre os doentes.' },
        { id: 'c2', nome: rub1[1].nome, valor: 1.8, justificativa: 'Reconhece a relação com probabilidade condicional, mas não desenvolve.' },
        { id: 'c3', nome: rub1[2].nome, valor: 0.8, justificativa: 'Não apresenta exemplo numérico nem referência.' },
        { id: 'c4', nome: rub1[3].nome, valor: 2.8, justificativa: 'Texto curto, porém legível e sem erros graves.' },
      ],
      nota_bruta: 8.4,
      nota_final: 4.2,
      pontos_fortes: ['As duas definições centrais estão corretas em essência.'],
      pontos_desenvolver: [
        'Desenvolva o raciocínio: definir não é explicar.',
        'Inclua um exemplo com números para mostrar o efeito da prevalência.',
        'Retome o conceito de probabilidade condicional com um cálculo simples.',
      ],
      comentario_ia: 'Resposta correta no essencial, mas aquém do esperado em profundidade e uso de exemplos.',
      comentario_professor: null,
      confianca: 0.78,
      decisao: 'pendente',
      revisado_em: null,
      criado_em: dias(-2),
    },
    {
      id: 'cor-demo-3',
      submissao_id: 'sub-demo-3',
      modelo: 'simulação local (demonstração)',
      criterios: [
        { id: 'c1', nome: rub1[0].nome, valor: 5.1, justificativa: 'Conceitos corretos e bem delimitados.' },
        { id: 'c2', nome: rub1[1].nome, valor: 4.5, justificativa: 'Discute consequências dos falsos positivos e a escolha do teste por contexto.' },
        { id: 'c3', nome: rub1[2].nome, valor: 3.2, justificativa: 'Argumentação consistente, ainda que sem números.' },
        { id: 'c4', nome: rub1[3].nome, valor: 3.7, justificativa: 'Boa organização e coesão.' },
      ],
      nota_bruta: 16.5,
      nota_final: 8.25,
      pontos_fortes: ['Articula bem a decisão clínica com o contexto populacional.'],
      pontos_desenvolver: ['Traga um exemplo numérico para tornar o argumento verificável.'],
      comentario_ia: 'Texto bem escrito e coerente.',
      comentario_professor: null,
      confianca: 0.82,
      decisao: 'pendente',
      revisado_em: null,
      criado_em: dias(-1),
    },
  ]

  return {
    turmas: [
      {
        id: turmaId,
        nome: 'Biociências — Turma A',
        codigo_siga: 'CBV018GV-A',
        periodo: '2026/3',
        exige_email: true,
        curso: 'Ciências Biológicas',
        ativo: true,
      },
    ],
    esperados: alunos
      .filter((a) => a.papel === 'aluno')
      .map((a) => ({
        id: `esp-${a.id}`,
        turma_id: turmaId,
        matricula: a.matricula!,
        nome_completo: a.nome_completo,
        email: a.email,
        user_id: a.id,
      })),
    perfis: alunos,
    avaliacoes,
    submissoes: subs,
    correcoes,
    lancamentos: [
      {
        id: 'lanc-demo-1',
        correcao_id: null,
        submissao_id: null,
        matricula: '2026301002',
        turma_siga: 'CBV018GV-A',
        periodo: '2026/3',
        descricao_avaliacao: 'TVC 2',
        nota: 6.5,
        sucesso: false,
        http_status: 403,
        erro: 'O SIGA recusou: avaliação "TVC 2" fechada para lançamento.',
        criado_em: dias(-1),
      },
      {
        id: 'lanc-demo-2',
        correcao_id: null,
        submissao_id: null,
        matricula: '2026301001',
        turma_siga: 'CBV018GV-A',
        periodo: '2026/3',
        descricao_avaliacao: 'TVC 2',
        nota: 8,
        sucesso: true,
        http_status: 200,
        erro: null,
        criado_em: dias(-1).replace(/T\d/, 'T1'),
      },
    ],
    fotos: {},
    sessaoId: null,
  }
}

// ---------------------------------------------------------------------------
// Heurística local usada só na demonstração
// ---------------------------------------------------------------------------
function hashTexto(t: string): number {
  let h = 2166136261
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

function avaliarDemo(texto: string, rubrica: Criterio[]): Omit<Correcao, 'id' | 'submissao_id' | 'criado_em'> {
  const palavras = texto.trim().split(/\s+/).filter(Boolean).length
  const paragrafos = texto.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length
  const temNumero = /%|\d/.test(texto)
  const citacao = /cap[íi]tulo|aula|refer[êe]ncia|autor/i.test(texto)
  const semente = hashTexto(texto)

  const completude = Math.min(1, palavras / 220)
  const estrutura = Math.min(1, paragrafos / 3)

  const criterios = rubrica.map((c, i) => {
    let fator = 0.35 + 0.5 * completude
    if (/precis|conceit|defini/i.test(c.nome)) fator += 0.05
    if (/interpret|aplica/i.test(c.nome)) fator += temNumero ? 0.1 : -0.05
    if (/argument|evid/i.test(c.nome)) fator += (temNumero ? 0.05 : 0) + (citacao ? 0.1 : -0.05)
    if (/clareza|norma|estrutur/i.test(c.nome)) fator = 0.3 + 0.6 * estrutura
    const ruido = (((semente >> (i * 3)) % 11) - 5) / 100
    const fracao = Math.max(0.15, Math.min(1, fator + ruido))
    const valor = Math.round(c.valor * fracao * 10) / 10
    return {
      id: c.id,
      nome: c.nome,
      valor,
      justificativa:
        valor / c.valor >= 0.7
          ? `Atende ao critério de forma consistente: ${c.descricao.toLowerCase()}`
          : `Atende parcialmente: ${c.descricao.toLowerCase()}`,
    }
  })

  const notaBruta = criterios.reduce((t, c) => t + c.valor, 0)
  const valorTotal = rubrica.reduce((t, c) => t + c.valor, 0)
  const fortes = criterios
    .filter((c) => c.valor / (rubrica.find((r) => r.id === c.id)?.valor ?? 1) >= 0.7)
    .map((c) => `Domínio demonstrado em "${c.nome}".`)
  const desenvolver = criterios
    .filter((c) => c.valor / (rubrica.find((r) => r.id === c.id)?.valor ?? 1) < 0.7)
    .map((c) => `Aprofunde "${c.nome}": retome a explicação do capítulo e reescreva esse trecho.`)

  return {
    modelo: 'simulação local (demonstração)',
    criterios,
    nota_bruta: notaBruta,
    nota_final: notaParaSiga(notaBruta, valorTotal),
    pontos_fortes: fortes.length ? fortes : ['Texto entregue dentro do prazo.'],
    pontos_desenvolver: desenvolver.length ? desenvolver : ['Mantenha o padrão e acrescente exemplos numéricos.'],
    comentario_ia:
      'Devolutiva simulada: no modo demonstração a correção usa uma heurística local (extensão, estrutura e presença de exemplos), não um modelo de linguagem.',
    comentario_professor: null,
    confianca: 0.5,
    decisao: 'pendente',
    revisado_em: null,
  }
}

// ---------------------------------------------------------------------------

function carregar(): Base {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (cru) {
      const b = JSON.parse(cru) as Base
      if (b?.turmas?.length) return b
    }
  } catch {
    /* armazenamento indisponível: segue com a base inicial */
  }
  const b = baseInicial()
  salvar(b)
  return b
}

function salvar(b: Base) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(b))
  } catch {
    /* quota cheia: a demonstração continua em memória */
  }
}

export function criarDadosDemo(): Dados {
  let base = carregar()

  const perfilAtivo = (): Perfil | null => {
    const p = base.perfis.find((x) => x.id === base.sessaoId)
    if (!p) return null
    const { senha: _senha, ...resto } = p
    return resto
  }

  const exigir = (): Perfil => {
    const p = perfilAtivo()
    if (!p) throw new Error('Sessão expirada. Entre novamente.')
    return p
  }

  const gravar = () => salvar(base)

  const dados: Dados = {
    modo: 'demo',

    async sessaoAtual() {
      return perfilAtivo()
    },

    observarSessao(cb) {
      cb(perfilAtivo())
      return () => {}
    },

    async entrar(email, senha) {
      const p = base.perfis.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
      if (!p || p.senha !== senha) throw new Error('E-mail ou senha incorretos.')
      base.sessaoId = p.id
      gravar()
      return perfilAtivo()!
    },

    async sair() {
      base.sessaoId = null
      gravar()
    },

    async cadastrar(entrada: Cadastro) {
      const motivo = await dados.validarMatricula(entrada.turma_id, entrada.matricula, entrada.email)
      if (motivo !== 'ok') throw new Error(mensagemValidacao(motivo))
      if (base.perfis.some((p) => p.email.toLowerCase() === entrada.email.trim().toLowerCase())) {
        throw new Error('Este e-mail já tem conta na demonstração.')
      }
      const novo: PerfilDemo = {
        id: uid(),
        papel: 'aluno',
        nome_completo: entrada.nome_completo.trim(),
        matricula: entrada.matricula.trim(),
        email: entrada.email.trim().toLowerCase(),
        curso: entrada.curso.trim(),
        telefone: null,
        turma_id: entrada.turma_id,
        senha: entrada.senha,
      }
      base.perfis.push(novo)
      const esp = base.esperados.find(
        (e) => e.turma_id === entrada.turma_id && e.matricula === entrada.matricula.trim(),
      )
      if (esp) esp.user_id = novo.id
      base.sessaoId = novo.id
      gravar()
      return { precisaConfirmarEmail: false }
    },

    async turmas() {
      return base.turmas.filter((t) => t.ativo)
    },

    async validarMatricula(turmaId, matricula, email) {
      const esp = base.esperados.find((e) => e.turma_id === turmaId && e.matricula === matricula.trim())
      if (!esp) return 'matricula'
      if (esp.email.toLowerCase() !== email.trim().toLowerCase()) return 'email'
      if (esp.user_id) return 'ja_cadastrado'
      return 'ok'
    },

    async consultarMatricula(turmaId, matricula): Promise<ConsultaMatricula> {
      const esp = base.esperados.find(
        (e) => e.turma_id === turmaId && e.matricula.toUpperCase() === matricula.trim().toUpperCase(),
      )
      if (!esp) return { ok: false, motivo: 'matricula' }
      const turma = base.turmas.find((t) => t.id === turmaId)
      if (esp.user_id) {
        return {
          ok: true,
          ja_cadastrado: true,
          email_mascarado: esp.email ? `${esp.email[0]}***@${esp.email.split('@')[1]}` : null,
          curso: turma?.curso ?? null,
        }
      }
      return {
        ok: true,
        ja_cadastrado: false,
        nome: esp.nome_completo,
        email: esp.email || null,
        curso: turma?.curso ?? null,
        exige_email: turma?.exige_email ?? true,
      }
    },

    async recuperarSenha() {
      throw new Error('No modo demonstração não há envio de e-mail. Use professor@demo.local ou aluno@demo.local com a senha demo12345.')
    },

    async atualizarPerfil(p) {
      const atual = exigir()
      const alvo = base.perfis.find((x) => x.id === atual.id)
      if (alvo) {
        alvo.nome_completo = p.nome_completo
        alvo.telefone = p.telefone
        alvo.curso = p.curso
        gravar()
      }
    },

    async alterarSenha(novaSenha, senhaAtual) {
      const atual = exigir()
      const alvo = base.perfis.find((x) => x.id === atual.id)
      if (!alvo) return
      if (senhaAtual !== undefined && senhaAtual !== (alvo.senha ?? SENHA_DEMO)) {
        throw new Error('Senha atual incorreta.')
      }
      alvo.senha = novaSenha
      gravar()
    },

    async avaliacoesDoAluno() {
      const p = exigir()
      return base.avaliacoes
        .filter((a) => a.turma_id === p.turma_id && a.status === 'publicada')
        .map<AvaliacaoDoAluno>((a) => {
          const submissao = base.submissoes.find((s) => s.avaliacao_id === a.id && s.aluno_id === p.id) ?? null
          const correcao = submissao
            ? base.correcoes.find((c) => c.submissao_id === submissao.id) ?? null
            : null
          const visivel = correcao && (correcao.decisao === 'aprovada' || correcao.decisao === 'ajustada')
          return { ...a, submissao, correcao: visivel ? correcao : null }
        })
        .sort((x, y) => (x.criado_em < y.criado_em ? 1 : -1))
    },

    async avaliacao(id) {
      return base.avaliacoes.find((a) => a.id === id) ?? null
    },

    async obterOuCriarSubmissao(avaliacaoId) {
      const p = exigir()
      const existente = base.submissoes.find((s) => s.avaliacao_id === avaliacaoId && s.aluno_id === p.id)
      if (existente) return existente
      const nova: Submissao = {
        id: uid(),
        avaliacao_id: avaliacaoId,
        aluno_id: p.id,
        foto_path: null,
        transcrito: null,
        transcrito_modelo: null,
        confirmado_em: null,
        status: 'rascunho',
        enviado_em: null,
        criado_em: agora(),
      }
      base.submissoes.push(nova)
      gravar()
      return nova
    },

    async enviarFoto(submissaoId, arquivo) {
      const base64 = await blobParaDataUrl(arquivo)
      const caminho = `demo/${submissaoId}.jpg`
      base.fotos[caminho] = base64
      const s = base.submissoes.find((x) => x.id === submissaoId)
      if (s) s.foto_path = caminho
      gravar()
      return caminho
    },

    async urlDaFoto(path) {
      if (!path) return null
      const enviada = base.fotos[path]
      if (enviada) return enviada
      // As redações de exemplo já existem antes de alguém fotografar. Em vez de
      // devolver null (e a tela dizer "não consegui abrir"), desenhamos uma folha
      // com a transcrição em letra cursiva — é o que o professor veria na foto.
      const submissao = base.submissoes.find((x) => x.foto_path === path)
      return submissao?.transcrito ? folhaDeExemplo(submissao.transcrito) : null
    },

    async transcrever(submissaoId) {
      const s = base.submissoes.find((x) => x.id === submissaoId)
      if (!s) throw new Error('Submissão não encontrada.')
      // Sem OCR no navegador: a demonstração pede que o texto seja digitado.
      s.transcrito_modelo = 'manual (demonstração)'
      gravar()
      return s
    },

    async salvarTranscricao(submissaoId, texto) {
      const s = base.submissoes.find((x) => x.id === submissaoId)
      if (!s) throw new Error('Submissão não encontrada.')
      s.transcrito = texto
      gravar()
    },

    async enviarRedacao(submissaoId) {
      const s = base.submissoes.find((x) => x.id === submissaoId)
      if (!s) throw new Error('Submissão não encontrada.')
      s.status = 'enviada'
      s.enviado_em = agora()
      s.confirmado_em = agora()
      gravar()
    },

    async turmasTodas() {
      return base.turmas
    },

    async criarTurma(t) {
      const nova: Turma = { id: uid(), ativo: true, exige_email: true, ...t }
      base.turmas.push(nova)
      gravar()
      return nova
    },

    async resumoAvaliacoes() {
      return base.avaliacoes
        .map<ResumoAvaliacao>((a) => {
          const subs = base.submissoes.filter((s) => s.avaliacao_id === a.id && s.status !== 'rascunho')
          const idsSub = new Set(subs.map((s) => s.id))
          const cors = base.correcoes.filter((c) => idsSub.has(c.submissao_id))
          const idsCor = new Set(cors.map((c) => c.id))
          return {
            ...a,
            total_alunos: base.esperados.filter((e) => e.turma_id === a.turma_id).length,
            enviadas: subs.length,
            corrigidas: cors.length,
            aprovadas: cors.filter((c) => c.decisao === 'aprovada' || c.decisao === 'ajustada').length,
            lancadas: base.lancamentos.filter((l) => l.sucesso && l.correcao_id && idsCor.has(l.correcao_id)).length,
          }
        })
        .sort((x, y) => (x.criado_em < y.criado_em ? 1 : -1))
    },

    async criarAvaliacao(d: NovaAvaliacao) {
      const soma = d.rubrica.reduce((t, c) => t + c.valor, 0)
      if (Math.abs(soma - d.valor_total) > 0.01) {
        throw new Error(`A rubrica soma ${soma} mas o valor total é ${d.valor_total}.`)
      }
      const nova: Avaliacao = { id: uid(), criado_em: agora(), ...d }
      base.avaliacoes.push(nova)
      gravar()
      return nova
    },

    async mudarStatusAvaliacao(id, status: StatusAvaliacao) {
      const a = base.avaliacoes.find((x) => x.id === id)
      if (a) {
        a.status = status
        gravar()
      }
    },

    async mudarPrazoAvaliacao(id, prazoEm) {
      const a = base.avaliacoes.find((x) => x.id === id)
      if (a) {
        a.prazo_em = prazoEm
        gravar()
      }
    },

    async mudarPesoSigaAvaliacao(id, pesoSiga) {
      const a = base.avaliacoes.find((x) => x.id === id)
      if (a) {
        a.peso_siga = pesoSiga
        gravar()
      }
    },

    async alunosDaTurma(turmaId) {
      return base.esperados.filter((e) => e.turma_id === turmaId).sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, 'pt-BR'))
    },

    async importarAlunos(turmaId, linhas: LinhaImportacao[]) {
      let inseridos = 0
      for (const l of linhas) {
        const existe = base.esperados.find((e) => e.turma_id === turmaId && e.matricula === l.matricula.trim())
        if (existe) {
          existe.nome_completo = l.nome_completo.trim()
          existe.email = l.email.trim().toLowerCase()
        } else {
          base.esperados.push({
            id: uid(),
            turma_id: turmaId,
            matricula: l.matricula.trim(),
            nome_completo: l.nome_completo.trim(),
            email: l.email.trim().toLowerCase(),
            user_id: null,
          })
          inseridos++
        }
      }
      gravar()
      return { inseridos, atualizados: linhas.length - inseridos }
    },

    async resumoTurma(turmaId) {
      const avaliacoes = base.avaliacoes.filter((a) => a.turma_id === turmaId)
      const ids = new Set(avaliacoes.map((a) => a.id))
      return {
        alunos: base.esperados.filter((e) => e.turma_id === turmaId).length,
        avaliacoes: avaliacoes.length,
        enviadas: base.submissoes.filter((s) => ids.has(s.avaliacao_id) && s.status !== 'rascunho').length,
        lancadas: 0,
      }
    },

    async apagarTurma(turmaId) {
      const turma = base.turmas.find((t) => t.id === turmaId)
      if (!turma) return { ok: false as const, motivo: 'nao_encontrada' as const }
      const avaliacoes = base.avaliacoes.filter((a) => a.turma_id === turmaId)
      const idsAvaliacoes = new Set(avaliacoes.map((a) => a.id))
      const submissoes = base.submissoes.filter((s) => idsAvaliacoes.has(s.avaliacao_id))
      const idsSubmissoes = new Set(submissoes.map((s) => s.id))
      base.turmas = base.turmas.filter((t) => t.id !== turmaId)
      base.esperados = base.esperados.filter((e) => e.turma_id !== turmaId)
      base.avaliacoes = base.avaliacoes.filter((a) => a.turma_id !== turmaId)
      base.submissoes = base.submissoes.filter((s) => !idsSubmissoes.has(s.id))
      base.correcoes = base.correcoes.filter((c) => !idsSubmissoes.has(c.submissao_id))
      gravar()
      return { ok: true as const, alunos: base.esperados.length, avaliacoes: avaliacoes.length }
    },

    async apagarAvaliacao(avaliacaoId) {
      const avaliacao = base.avaliacoes.find((a) => a.id === avaliacaoId)
      if (!avaliacao) return { ok: false as const, motivo: 'nao_encontrada' as const }
      const submissoes = base.submissoes.filter((s) => s.avaliacao_id === avaliacaoId)
      if (submissoes.length > 0) {
        return { ok: false as const, motivo: 'tem_submissoes' as const, submissoes: submissoes.length }
      }
      base.avaliacoes = base.avaliacoes.filter((a) => a.id !== avaliacaoId)
      gravar()
      return { ok: true as const, titulo: avaliacao.titulo }
    },

    async definirExigenciaDeEmail(turmaId, exige) {
      const t = base.turmas.find((x) => x.id === turmaId)
      if (!t) throw new Error('Turma não encontrada.')
      t.exige_email = exige
      gravar()
    },

    async submissoesDaAvaliacao(avaliacaoId) {
      return base.submissoes
        .filter((s) => s.avaliacao_id === avaliacaoId && s.status !== 'rascunho')
        .map<SubmissaoDoProfessor>((s) => {
          const p = base.perfis.find((x) => x.id === s.aluno_id)
          const correcao = base.correcoes.find((c) => c.submissao_id === s.id) ?? null
          const lancamento =
            base.lancamentos
              .filter((l) => l.correcao_id && l.correcao_id === correcao?.id)
              .sort((a, b) => (a.criado_em < b.criado_em ? 1 : -1))[0] ?? null
          return {
            submissao: s,
            aluno: {
              id: s.aluno_id,
              nome_completo: p?.nome_completo ?? 'Aluno',
              matricula: p?.matricula ?? null,
              email: p?.email ?? '',
            },
            correcao,
            lancamento,
          }
        })
    },

    async corrigir(submissaoId) {
      const s = base.submissoes.find((x) => x.id === submissaoId)
      if (!s) throw new Error('Submissão não encontrada.')
      const av = base.avaliacoes.find((a) => a.id === s.avaliacao_id)
      if (!av) throw new Error('Avaliação não encontrada.')
      const gerada = avaliarDemo(s.transcrito ?? '', av.rubrica)
      const existente = base.correcoes.find((c) => c.submissao_id === submissaoId)
      const correcao: Correcao = {
        id: existente?.id ?? uid(),
        submissao_id: submissaoId,
        criado_em: agora(),
        ...gerada,
      }
      base.correcoes = base.correcoes.filter((c) => c.submissao_id !== submissaoId)
      base.correcoes.push(correcao)
      s.status = 'corrigida'
      gravar()
      return correcao
    },

    async corrigirManual(submissaoId: string) {
      const s = base.submissoes.find((x) => x.id === submissaoId)
      if (!s) throw new Error('Submissão não encontrada.')
      const av = base.avaliacoes.find((a) => a.id === s.avaliacao_id)
      if (!av) throw new Error('Avaliação não encontrada.')
      if (base.correcoes.some((c) => c.submissao_id === submissaoId)) {
        throw new Error('Esta redação já tem correção.')
      }
      const correcao: Correcao = {
        id: uid(),
        submissao_id: submissaoId,
        criterios: av.rubrica.map((c) => ({
          id: c.id,
          nome: c.nome,
          valor: 0,
          justificativa: 'Nota atribuída manualmente pelo professor.',
        })),
        nota_bruta: 0,
        nota_final: 0,
        pontos_fortes: [],
        pontos_desenvolver: [],
        comentario_ia: null,
        comentario_professor: null,
        modelo: 'manual',
        confianca: null,
        decisao: 'pendente',
        revisado_em: null,
        criado_em: agora(),
      }
      base.correcoes.push(correcao)
      s.status = 'corrigida'
      gravar()
      return correcao
    },

    async saude() {
      // Sem servidor no modo demonstração: a tela não mostra o diagnóstico.
      return null
    },

    async avaliacoesDoSiga(turma: string, periodo: string) {
      // No modo demonstração não há SIGA: devolve o formato esperado pela tela.
      return {
        consulta: { turma, periodo, id_turma: null, id_periodo: null, gerado_em: null },
        avaliacoes: [
          { id: 'demo-1', descricao: 'TVC 1', peso: 10, data: '25/09/2026' },
          { id: 'demo-2', descricao: 'TVC 2', peso: 20, data: '27/11/2026' },
        ],
      }
    },

    async notasDoSiga(turma: string, periodo: string) {
      // Modo demonstração: mostra o quadro como se as notas do app já estivessem lá.
      const alunosDemo = base.perfis
        .filter((p) => p.papel === 'aluno')
        .map((p) => ({
          matricula: p.matricula ?? '',
          nome: p.nome_completo,
          notas: { 'TVC 1': Number((6 + Math.random() * 3).toFixed(1)), 'TVC 2': null } as Record<string, number | null>,
          nota_final: null,
          frequencia: 'FS',
          situacao: 'Matriculado',
        }))
      return {
        consulta: { turma, periodo, id_turma: null, id_periodo: null, gerado_em: new Date().toISOString() },
        avaliacoes: [
          { id: 'demo-1', descricao: 'TVC 1', peso: 10, data: '25/09/2026' },
          { id: 'demo-2', descricao: 'TVC 2', peso: 20, data: '27/11/2026' },
        ],
        alunos: alunosDemo,
        resumo: null,
        avisos: ['Modo demonstração: valores inventados para a tela funcionar.'],
      }
    },

    async salvarRevisao(correcaoId: string, revisao: Revisao) {
      const c = base.correcoes.find((x) => x.id === correcaoId)
      if (!c) throw new Error('Correção não encontrada.')
      const s = base.submissoes.find((x) => x.id === c.submissao_id)
      const av = base.avaliacoes.find((a) => a.id === s?.avaliacao_id)
      const notaBruta = revisao.criterios.reduce((t, x) => t + Number(x.valor), 0)
      c.criterios = revisao.criterios
      c.comentario_professor = revisao.comentario_professor
      if (revisao.pontos_fortes) c.pontos_fortes = revisao.pontos_fortes
      if (revisao.pontos_desenvolver) c.pontos_desenvolver = revisao.pontos_desenvolver
      c.nota_bruta = notaBruta
      c.nota_final = notaParaSiga(notaBruta, av?.valor_total ?? 10)
      c.decisao = revisao.decisao
      c.revisado_em = agora()
      if (s) s.status = revisao.decisao === 'rejeitada' ? 'devolvida' : 'corrigida'
      gravar()
    },

    async lancarNoSiga(correcaoId) {
      const c = base.correcoes.find((x) => x.id === correcaoId)
      if (!c) throw new Error('Correção não encontrada.')
      // Mesma regra do servidor: lançamento igual já feito não vai de novo.
      const anterior = base.lancamentos.find(
        (l) => l.correcao_id === correcaoId && l.sucesso && l.nota === c.nota_final,
      )
      if (anterior) return { lancamento: anterior, repetido: true }
      const s = base.submissoes.find((x) => x.id === c.submissao_id)
      const p = base.perfis.find((x) => x.id === s?.aluno_id)
      const av = base.avaliacoes.find((a) => a.id === s?.avaliacao_id)
      const turma = base.turmas.find((t) => t.id === av?.turma_id)
      const lancamento: LancamentoSiga = {
        id: uid(),
        correcao_id: correcaoId,
        submissao_id: s?.id ?? null,
        matricula: p?.matricula ?? '—',
        turma_siga: turma?.codigo_siga ?? '—',
        periodo: turma?.periodo ?? null,
        descricao_avaliacao: av?.descricao_siga ?? av?.titulo ?? '—',
        nota: c.nota_final,
        sucesso: true,
        http_status: 200,
        erro: null,
        criado_em: agora(),
      }
      base.lancamentos.push(lancamento)
      gravar()
      return { lancamento, repetido: false }
    },

    async historicoLancamentos(avaliacaoId) {
      const av = base.avaliacoes.find((a) => a.id === avaliacaoId)
      if (!av?.descricao_siga) return []
      const turma = base.turmas.find((t) => t.id === av.turma_id)
      const codigo = turma?.codigo_siga ?? ''
      const linhas = base.lancamentos
        .filter((l) => l.turma_siga === codigo && l.descricao_avaliacao === av.descricao_siga)
        .map((l) => ({
          ...l,
          aluno_nome: base.perfis.find((p) => p.matricula === l.matricula)?.nome_completo ?? 'Aluno',
          escala: 'pontos',
        }))
      return linhas.sort((a, b) => b.criado_em.localeCompare(a.criado_em))
    },
  }

  return dados
}

function mensagemValidacao(motivo: MotivoValidacao): string {
  switch (motivo) {
    case 'matricula':
      return 'Matrícula não encontrada nesta turma.'
    case 'email':
      return 'O e-mail não confere com o da lista da turma.'
    case 'ja_cadastrado':
      return 'Esta matrícula já foi cadastrada.'
    case 'dados_incompletos':
      return 'Preencha turma, matrícula e e-mail.'
    default:
      return 'Não foi possível validar os dados.'
  }
}

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader()
    leitor.onload = () => resolve(String(leitor.result))
    leitor.onerror = () => reject(new Error('Falha ao ler a imagem.'))
    leitor.readAsDataURL(blob)
  })
}

/**
 * Folha de papel pautado com o texto em letra cursiva, como data URI — só para a
 * demonstração. Serve para a aba "Foto original" mostrar algo parecido com o que
 * o aluno entrega, inclusive em celular sem rede.
 */
function folhaDeExemplo(texto: string): string {
  const linhas: string[] = []
  let atual = ''
  for (const palavra of texto.split(/\s+/)) {
    if ((atual + ' ' + palavra).trim().length > 42) {
      linhas.push(atual.trim())
      atual = palavra
    } else {
      atual = `${atual} ${palavra}`
    }
    if (linhas.length >= 40) break
  }
  if (atual.trim() && linhas.length < 40) linhas.push(atual.trim())
  if (linhas.length === 40) linhas[39] = `${linhas[39].slice(0, 39)}…`

  const altura = 120 + linhas.length * 26
  const corpo = linhas
    .map(
      (linha, i) =>
        `<text x="48" y="${86 + i * 26}" font-family="Segoe Script, Bradley Hand, cursive" font-size="15" fill="#22303a">${linha
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')}</text>`,
    )
    .join('')
  const pautas = linhas
    .map((_, i) => `<line x1="40" y1="${92 + i * 26}" x2="560" y2="${92 + i * 26}" stroke="#c9d6de" stroke-width="1"/>`)
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${altura}" viewBox="0 0 600 ${altura}">
<rect width="600" height="${altura}" fill="#fdfbf4"/><rect x="0" y="0" width="600" height="${altura}" fill="none" stroke="#e3ded0"/>
<line x1="34" y1="0" x2="34" y2="${altura}" stroke="#e8b4b4" stroke-width="1"/>${pautas}${corpo}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
