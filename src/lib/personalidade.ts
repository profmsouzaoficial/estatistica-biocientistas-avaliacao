/**
 * Teste de personalidade inspirado no modelo dos 16 tipos (16Personalities).
 *
 * O que foi observado no site oficial, em 18/11/2026, com inspeção dinâmica
 * (Playwright, seguindo a abordagem do projeto REA — github.com/morluto/rea):
 *
 *  - 60 afirmações, uma escala de 7 pontos (-3 a +3, de "discordo totalmente"
 *    a "concordo totalmente"), em páginas de 6 perguntas;
 *  - cinco eixos: energia (E/I), percepção (N/S), decisão (F/T), organização
 *    (J/P) e identidade (A/T);
 *  - o resultado devolve um código de 5 letras, um papel (Analistas,
 *    Diplomatas, Sentinelas, Exploradores) e uma estratégia (Individualismo
 *    Confiante, Domínio Social, Aprimoramento Constante, Engajamento Social);
 *  - a API oficial recebe as respostas e devolve escores de 0 a 100 por eixo.
 *
 * Este arquivo NÃO copia o banco de 60 perguntas nem os textos do relatório
 * oficial. Ele traz 30 afirmações originais, seis por eixo, e descrições
 * curtas escritas para este app. A atribuição e o aviso de que não é o teste
 * oficial ficam visíveis na tela e em docs/personalidade.md.
 */

import type {
  DimensoesPersonalidade,
  EstrategiaPersonalidade,
  PapelPersonalidade,
  ResultadoPersonalidade,
} from './types'

export type ChaveDimensao = keyof DimensoesPersonalidade
export type Lado = 'esquerda' | 'direita'

export interface Polo {
  letra: string
  rotulo: string
}

export interface Eixo {
  chave: ChaveDimensao
  nome: string
  esquerda: Polo
  direita: Polo
  explicacao: string
}

/** A ordem dos quatro primeiros eixos é a ordem das letras do código. */
export const EIXOS: Eixo[] = [
  {
    chave: 'energia',
    nome: 'Energia',
    esquerda: { letra: 'E', rotulo: 'Extroversão' },
    direita: { letra: 'I', rotulo: 'Introversão' },
    explicacao: 'De onde vem a sua energia e como você prefere conviver.',
  },
  {
    chave: 'percepcao',
    nome: 'Percepção',
    esquerda: { letra: 'N', rotulo: 'Intuição' },
    direita: { letra: 'S', rotulo: 'Observação' },
    explicacao: 'Como você absorve informações e enxerga possibilidades.',
  },
  {
    chave: 'decisao',
    nome: 'Decisão',
    esquerda: { letra: 'F', rotulo: 'Sentimento' },
    direita: { letra: 'T', rotulo: 'Pensamento' },
    explicacao: 'O que você considera primeiro ao escolher e julgar.',
  },
  {
    chave: 'organizacao',
    nome: 'Organização',
    esquerda: { letra: 'J', rotulo: 'Planejamento' },
    direita: { letra: 'P', rotulo: 'Flexibilidade' },
    explicacao: 'Como você lida com prazos, planos e imprevistos.',
  },
  {
    chave: 'identidade',
    nome: 'Identidade',
    esquerda: { letra: 'A', rotulo: 'Assertividade' },
    direita: { letra: 'T', rotulo: 'Turbulência' },
    explicacao: 'Como você reage à pressão, ao erro e à avaliação dos outros.',
  },
]

export interface Pergunta {
  id: number
  texto: string
  dimensao: ChaveDimensao
  /** Concordar com a afirmação aproxima do polo esquerdo ou do direito. */
  lado: Lado
}

/**
 * 30 afirmações originais, intercaladas entre os cinco eixos para não cansar
 * quem responde. Cada eixo tem três afirmações de cada lado — sem isso, uma
 * pessoa que concorda com tudo sairia com um resultado artificial.
 */
export const PERGUNTAS: Pergunta[] = [
  { id: 1, dimensao: 'energia', lado: 'esquerda', texto: 'Sinto disposição para puxar conversa com pessoas que acabei de conhecer.' },
  { id: 2, dimensao: 'percepcao', lado: 'esquerda', texto: 'Gosto de imaginar possibilidades que ainda não existem.' },
  { id: 3, dimensao: 'decisao', lado: 'esquerda', texto: 'Ao decidir, penso primeiro em como a escolha afeta as pessoas.' },
  { id: 4, dimensao: 'organizacao', lado: 'esquerda', texto: 'Gosto de planejar as etapas antes de começar uma tarefa.' },
  { id: 5, dimensao: 'identidade', lado: 'esquerda', texto: 'Mesmo quando erro, recupero a confiança rapidamente.' },

  { id: 6, dimensao: 'energia', lado: 'direita', texto: 'Prefiro estudar ou trabalhar sozinho(a) a participar de um grupo.' },
  { id: 7, dimensao: 'percepcao', lado: 'direita', texto: 'Confio mais no que posso ver, medir ou testar do que em teorias.' },
  { id: 8, dimensao: 'decisao', lado: 'direita', texto: 'Prefiro uma decisão justa e lógica, mesmo que desagrade alguém.' },
  { id: 9, dimensao: 'organizacao', lado: 'direita', texto: 'Deixo espaço para mudar de planos no meio do caminho.' },
  { id: 10, dimensao: 'identidade', lado: 'direita', texto: 'Costumo revisar o que fiz procurando defeitos.' },

  { id: 11, dimensao: 'energia', lado: 'esquerda', texto: 'Gosto de apresentar ideias para uma plateia.' },
  { id: 12, dimensao: 'percepcao', lado: 'esquerda', texto: 'Costumo conectar assuntos que parecem distantes.' },
  { id: 13, dimensao: 'decisao', lado: 'esquerda', texto: 'Percebo facilmente quando alguém está desconfortável, mesmo sem falar.' },
  { id: 14, dimensao: 'organizacao', lado: 'esquerda', texto: 'Listas e prazos me ajudam a trabalhar melhor.' },
  { id: 15, dimensao: 'identidade', lado: 'esquerda', texto: 'Fico tranquilo(a) com a possibilidade de não agradar todo mundo.' },

  { id: 16, dimensao: 'energia', lado: 'direita', texto: 'Depois de um dia intenso, recarregar em silêncio me faz bem.' },
  { id: 17, dimensao: 'percepcao', lado: 'direita', texto: 'Prefiro instruções concretas e exemplos práticos a discussões abstratas.' },
  { id: 18, dimensao: 'decisao', lado: 'direita', texto: 'Em discussões, foco nos argumentos e não nas emoções envolvidas.' },
  { id: 19, dimensao: 'organizacao', lado: 'direita', texto: 'Prefiro começar tarefas sem um roteiro rígido.' },
  { id: 20, dimensao: 'identidade', lado: 'direita', texto: 'Preocupo-me com o que os outros vão pensar de mim.' },

  { id: 21, dimensao: 'energia', lado: 'esquerda', texto: 'Sinto energia quando troco ideias com muita gente ao mesmo tempo.' },
  { id: 22, dimensao: 'percepcao', lado: 'esquerda', texto: 'Fico curioso(a) com o “porquê” das coisas, mesmo quando isso não tem uso imediato.' },
  { id: 23, dimensao: 'decisao', lado: 'esquerda', texto: 'Um elogio sincero pode mudar o meu dia.' },
  { id: 24, dimensao: 'organizacao', lado: 'esquerda', texto: 'Sinto desconforto quando as coisas ficam fora do lugar combinado.' },
  { id: 25, dimensao: 'identidade', lado: 'esquerda', texto: 'Sinto que posso lidar com os desafios que aparecerem.' },

  { id: 26, dimensao: 'energia', lado: 'direita', texto: 'Em situações novas, prefiro observar antes de me aproximar.' },
  { id: 27, dimensao: 'percepcao', lado: 'direita', texto: 'Sigo mais a experiência do dia a dia do que a intuição sobre o futuro.' },
  { id: 28, dimensao: 'decisao', lado: 'direita', texto: 'Evito tomar decisões baseadas apenas em sentimentos.' },
  { id: 29, dimensao: 'organizacao', lado: 'direita', texto: 'Adapto-me facilmente quando o plano inicial dá errado.' },
  { id: 30, dimensao: 'identidade', lado: 'direita', texto: 'Pequenos erros podem abalar minha confiança por um tempo.' },
]

/** Rótulos da escala de 7 pontos, do menor ao maior. */
export const ESCALA = [
  'Discordo totalmente',
  'Discordo',
  'Discordo em parte',
  'Não tenho certeza',
  'Concordo em parte',
  'Concordo',
  'Concordo totalmente',
] as const

export interface PapelInfo {
  codigo: PapelPersonalidade
  nome: string
  descricao: string
  fundo: string
  borda: string
  texto: string
  forte: string
}

export const PAPEIS: Record<PapelPersonalidade, PapelInfo> = {
  analistas: {
    codigo: 'analistas',
    nome: 'Analistas',
    descricao: 'Intuitivos e racionais, gostam de entender sistemas, argumentos e possibilidades.',
    fundo: '#F1ECFF',
    borda: '#D7C8FF',
    texto: '#4B2A9B',
    forte: '#6D4AFF',
  },
  diplomatas: {
    codigo: 'diplomatas',
    nome: 'Diplomatas',
    descricao: 'Intuitivos e empáticos, atentos a pessoas, valores e impacto humano.',
    fundo: '#E9F7EF',
    borda: '#BDE3CB',
    texto: '#1D6541',
    forte: '#2E8B57',
  },
  sentinelas: {
    codigo: 'sentinelas',
    nome: 'Sentinelas',
    descricao: 'Observadores e organizados, valorizam previsibilidade, cuidado e dever.',
    fundo: '#EAF1FF',
    borda: '#C6D8FF',
    texto: '#1D4696',
    forte: '#2F6FED',
  },
  exploradores: {
    codigo: 'exploradores',
    nome: 'Exploradores',
    descricao: 'Observadores e flexíveis, aprendem na prática e gostam de novidade.',
    fundo: '#FFF4D8',
    borda: '#F0D28A',
    texto: '#6F4B00',
    forte: '#B47B00',
  },
}

export interface EstrategiaInfo {
  codigo: EstrategiaPersonalidade
  nome: string
  descricao: string
}

export const ESTRATEGIAS: Record<EstrategiaPersonalidade, EstrategiaInfo> = {
  'individualismo-confiante': {
    codigo: 'individualismo-confiante',
    nome: 'Individualismo confiante',
    descricao: 'Prefere seguir o próprio ritmo, com autonomia e segurança nas decisões.',
  },
  'dominio-social': {
    codigo: 'dominio-social',
    nome: 'Domínio social',
    descricao: 'Combina iniciativa social com confiança para conduzir pessoas e projetos.',
  },
  'aprimoramento-constante': {
    codigo: 'aprimoramento-constante',
    nome: 'Aprimoramento constante',
    descricao: 'Observa os próprios resultados e busca melhorar, muitas vezes em silêncio.',
  },
  'engajamento-social': {
    codigo: 'engajamento-social',
    nome: 'Engajamento social',
    descricao: 'Usa a energia do contato com pessoas para aprender, ajustar e crescer.',
  },
}

export interface TipoInfo {
  codigo: string
  nome: string
  descricao: string
  caracteristicas: [string, string, string]
  atencao: string
}

/**
 * Descrições curtas e originais. Os nomes dos tipos são os rótulos populares
 * do modelo; o texto abaixo não foi copiado do relatório do 16Personalities.
 */
export const TIPOS: Record<string, TipoInfo> = {
  INTJ: {
    codigo: 'INTJ',
    nome: 'Arquiteto',
    descricao: 'Enxerga o todo, planeja o longo prazo e gosta de resolver problemas com lógica e autonomia.',
    caracteristicas: ['Visão estratégica', 'Independência', 'Rigor analítico'],
    atencao: 'Pode soar reservado ou impaciente com improvisos e decisões pouco fundamentadas.',
  },
  INTP: {
    codigo: 'INTP',
    nome: 'Lógico',
    descricao: 'Busca entender como as ideias se encaixam, questiona premissas e testa explicações.',
    caracteristicas: ['Curiosidade teórica', 'Originalidade', 'Precisão conceitual'],
    atencao: 'Pode adiar decisões enquanto ainda está explorando possibilidades.',
  },
  ENTJ: {
    codigo: 'ENTJ',
    nome: 'Comandante',
    descricao: 'Organiza pessoas e recursos em direção a uma meta, com iniciativa e senso de eficiência.',
    caracteristicas: ['Liderança', 'Determinação', 'Pensamento sistêmico'],
    atencao: 'Pode avançar rápido demais e atropelar o tempo emocional do grupo.',
  },
  ENTP: {
    codigo: 'ENTP',
    nome: 'Inovador',
    descricao: 'Gosta de desafiar o óbvio, criar alternativas e debater ideias com energia.',
    caracteristicas: ['Criatividade', 'Argumentação', 'Adaptabilidade'],
    atencao: 'Pode perder interesse depois que a novidade passa e deixar tarefas pela metade.',
  },
  INFJ: {
    codigo: 'INFJ',
    nome: 'Apoiador',
    descricao: 'Percebe necessidades humanas com sensibilidade e busca transformar valores em ação.',
    caracteristicas: ['Empatia', 'Idealismo', 'Capacidade de escuta'],
    atencao: 'Pode absorver os problemas dos outros e se cobrar demais para ajudar.',
  },
  INFP: {
    codigo: 'INFP',
    nome: 'Mediador',
    descricao: 'Valoriza autenticidade, imaginação e coerência entre o que sente e o que faz.',
    caracteristicas: ['Sensibilidade', 'Imaginação', 'Fidelidade a valores'],
    atencao: 'Pode evitar conflitos necessários para preservar a harmonia.',
  },
  ENFJ: {
    codigo: 'ENFJ',
    nome: 'Protagonista',
    descricao: 'Inspira e conecta pessoas, conduzindo o grupo com empatia e senso de propósito.',
    caracteristicas: ['Comunicação', 'Empatia', 'Capacidade de motivar'],
    atencao: 'Pode se sobrecarregar tentando agradar e cuidar de todos ao mesmo tempo.',
  },
  ENFP: {
    codigo: 'ENFP',
    nome: 'Ativista',
    descricao: 'Traz entusiasmo e criatividade, enxergando conexões e possibilidades nas pessoas.',
    caracteristicas: ['Entusiasmo', 'Criatividade', 'Facilidade de conexão'],
    atencao: 'Pode se dispersar com muitos projetos e ter dificuldade com rotina.',
  },
  ISTJ: {
    codigo: 'ISTJ',
    nome: 'Prático',
    descricao: 'Confia em fatos, cumpre compromissos e organiza o trabalho com método e constância.',
    caracteristicas: ['Confiabilidade', 'Organização', 'Atenção aos detalhes'],
    atencao: 'Pode resistir a mudanças que não tenham uma justificativa clara.',
  },
  ISFJ: {
    codigo: 'ISFJ',
    nome: 'Defensor',
    descricao: 'Cuida das pessoas com atenção prática, memória dos detalhes e senso de responsabilidade.',
    caracteristicas: ['Cuidado', 'Lealdade', 'Disponibilidade'],
    atencao: 'Pode deixar as próprias necessidades em segundo plano.',
  },
  ESTJ: {
    codigo: 'ESTJ',
    nome: 'Executivo',
    descricao: 'Gosta de transformar planos em rotinas claras, coordenando pessoas e tarefas com objetividade.',
    caracteristicas: ['Praticidade', 'Organização', 'Sentido de dever'],
    atencao: 'Pode parecer rígido com quem prefere outro jeito de trabalhar.',
  },
  ESFJ: {
    codigo: 'ESFJ',
    nome: 'Cônsul',
    descricao: 'Cria ambientes acolhedores, acompanha o grupo de perto e valoriza a cooperação.',
    caracteristicas: ['Acolhimento', 'Sociabilidade', 'Compromisso com o grupo'],
    atencao: 'Pode ficar sensível a críticas e se preocupar demais com a aprovação alheia.',
  },
  ISTP: {
    codigo: 'ISTP',
    nome: 'Virtuoso',
    descricao: 'Aprende na prática, resolve problemas concretos e mantém a calma em situações de pressão.',
    caracteristicas: ['Raciocínio prático', 'Autonomia', 'Sangue-frio'],
    atencao: 'Pode se fechar em si e demorar a compartilhar o que está pensando.',
  },
  ISFP: {
    codigo: 'ISFP',
    nome: 'Aventureiro',
    descricao: 'Expressa-se pelo fazer, valoriza a liberdade e percebe beleza e detalhes do ambiente.',
    caracteristicas: ['Sensibilidade estética', 'Flexibilidade', 'Gentileza'],
    atencao: 'Pode evitar planejamentos longos e decisões que limitem sua liberdade.',
  },
  ESTP: {
    codigo: 'ESTP',
    nome: 'Empreendedor',
    descricao: 'Age com energia diante do que está acontecendo, gosta de desafios e aprende experimentando.',
    caracteristicas: ['Ação', 'Adaptação', 'Negociação'],
    atencao: 'Pode subestimar riscos e consequências de longo prazo.',
  },
  ESFP: {
    codigo: 'ESFP',
    nome: 'Animador',
    descricao: 'Traz leveza e presença, envolve as pessoas e aproveita as oportunidades do momento.',
    caracteristicas: ['Espontaneidade', 'Sociabilidade', 'Entusiasmo'],
    atencao: 'Pode ter dificuldade com tarefas repetitivas e planejamento distante.',
  },
}

/** Todos os 16 códigos, na ordem em que aparecem nas descrições dos grupos. */
export const TIPOS_POR_PAPEL: Record<PapelPersonalidade, string[]> = {
  analistas: ['INTJ', 'INTP', 'ENTJ', 'ENTP'],
  diplomatas: ['INFJ', 'INFP', 'ENFJ', 'ENFP'],
  sentinelas: ['ISTJ', 'ISFJ', 'ESTJ', 'ESFJ'],
  exploradores: ['ISTP', 'ISFP', 'ESTP', 'ESFP'],
}

export function papelDoTipoBase(tipoBase: string): PapelPersonalidade {
  const t = tipoBase.toUpperCase()
  const segundo = t[1]
  const terceiro = t[2]
  const quarto = t[3]
  if (segundo === 'N' && terceiro === 'T') return 'analistas'
  if (segundo === 'N' && terceiro === 'F') return 'diplomatas'
  // Sentinelas são S + J; o J é a quarta letra, não a terceira (F/T).
  if (segundo === 'S' && quarto === 'J') return 'sentinelas'
  return 'exploradores'
}

export function estrategiaDoResultado(tipoBase: string, identidade: 'A' | 'T'): EstrategiaPersonalidade {
  const introvertido = tipoBase.toUpperCase().startsWith('I')
  if (identidade === 'A') return introvertido ? 'individualismo-confiante' : 'dominio-social'
  return introvertido ? 'aprimoramento-constante' : 'engajamento-social'
}

/** O código de 4 letras + identidade, no formato `INFJ-A`. */
export function montarTipo(tipoBase: string, identidade: 'A' | 'T'): string {
  return `${tipoBase.toUpperCase()}-${identidade}`
}

export function tipoBaseDe(codigo: string): string {
  return codigo.replace(/-[AT]$/i, '').toUpperCase()
}

export function infoDoTipo(codigo: string): TipoInfo | null {
  return TIPOS[tipoBaseDe(codigo)] ?? null
}

export function papelDoResultado(resultado: ResultadoPersonalidade): PapelInfo {
  return PAPEIS[resultado.papel]
}

export function estrategiaDoResultadoInfo(resultado: ResultadoPersonalidade): EstrategiaInfo {
  return ESTRATEGIAS[resultado.estrategia]
}

/**
 * Calcula o resultado a partir das respostas (1 a 7). Cada eixo soma desvios
 * em relação ao centro da escala; a escala vai de -3 a +3, então o máximo de
 * um eixo com 6 itens é 18. O percentual é a posição do polo esquerdo.
 */
export function calcularResultado(respostas: Record<number, number>): ResultadoPersonalidade {
  for (const pergunta of PERGUNTAS) {
    const valor = respostas[pergunta.id]
    if (!Number.isInteger(valor) || valor < 1 || valor > 7) {
      throw new Error(`A afirmação ${pergunta.id} ficou sem uma resposta válida.`)
    }
  }

  const dimensoes = {} as DimensoesPersonalidade
  for (const eixo of EIXOS) {
    const itens = PERGUNTAS.filter((p) => p.dimensao === eixo.chave)
    let soma = 0
    for (const item of itens) {
      const desvio = respostas[item.id] - 4 // -3..+3
      soma += item.lado === 'esquerda' ? desvio : -desvio
    }
    const maximo = 3 * itens.length
    dimensoes[eixo.chave] = Math.round(((soma + maximo) / (2 * maximo)) * 100)
  }

  const letra = (chave: ChaveDimensao) => {
    const eixo = EIXOS.find((e) => e.chave === chave)!
    return dimensoes[chave] >= 50 ? eixo.esquerda.letra : eixo.direita.letra
  }

  const tipoBase = `${letra('energia')}${letra('percepcao')}${letra('decisao')}${letra('organizacao')}`
  const identidade = dimensoes.identidade >= 50 ? 'A' : 'T'
  return {
    tipo: montarTipo(tipoBase, identidade),
    papel: papelDoTipoBase(tipoBase),
    estrategia: estrategiaDoResultado(tipoBase, identidade),
    identidade,
    dimensoes,
    versao: 1,
  }
}

/** Valida um resultado vindo do banco antes de mostrá-lo (resultados antigos ou corrompidos). */
export function resultadoValido(valor: unknown): valor is ResultadoPersonalidade {
  if (!valor || typeof valor !== 'object') return false
  const r = valor as Partial<ResultadoPersonalidade>
  if (typeof r.tipo !== 'string' || !/^[EISNTFJP]{4}-[AT]$/.test(r.tipo)) return false
  if (!r.papel || !(r.papel in PAPEIS) || !r.estrategia || !(r.estrategia in ESTRATEGIAS)) return false
  if (r.identidade !== 'A' && r.identidade !== 'T') return false
  if (!r.dimensoes || typeof r.dimensoes !== 'object') return false
  return EIXOS.every((e) => {
    const n = (r.dimensoes as DimensoesPersonalidade)[e.chave]
    return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 100
  })
}

/** Nome curto para o cartão do professor. */
export function resumoDaPersonalidade(resultado: ResultadoPersonalidade | null | undefined): string {
  if (!resultado || !resultadoValido(resultado)) return 'Teste não feito'
  return resultado.tipo
}
