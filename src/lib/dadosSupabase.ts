import { createClient } from '@supabase/supabase-js'
import type { Dados, Cadastro, MotivoValidacao, NovaAvaliacao, Revisao, LinhaImportacao } from './dados'
import { api, configurarToken } from './servidor'
import { notaParaSiga } from './types'
import type {
  Avaliacao,
  AvaliacaoDoAluno,
  Correcao,
  Esperado,
  LancamentoSiga,
  QuadroSiga,
  Perfil,
  ResumoAvaliacao,
  StatusAvaliacao,
  Submissao,
  SubmissaoDoProfessor,
  Turma,
  Diagnostico,
} from './types'

export async function criarDadosSupabase(url: string, chave: string): Promise<Dados> {
  const sb = createClient(url, chave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  configurarToken(async () => (await sb.auth.getSession()).data.session?.access_token ?? null)

  let perfilCache: Perfil | null = null

  async function carregarPerfil(id: string): Promise<Perfil | null> {
    const { data, error } = await sb.from('profiles').select('*').eq('id', id).maybeSingle()
    if (error) throw new Error(`Não foi possível carregar seu perfil: ${error.message}`)
    if (!data) return null
    perfilCache = data as Perfil
    return perfilCache
  }

  function exigirPerfil(): Perfil {
    if (!perfilCache) throw new Error('Sessão expirada. Entre novamente.')
    return perfilCache
  }

  const traduzirErroCadastro = (mensagem: string): string => {
    const m = mensagem.toLowerCase()
    if (m.includes('matricula_nao_listada')) return 'Esta matrícula não está na lista da turma. Confira o número ou fale com o professor.'
    if (m.includes('email_nao_confere')) return 'Este e-mail é diferente do que consta na lista da turma.'
    if (m.includes('cadastro_ja_existe')) return 'Esta matrícula já foi cadastrada. Use "Esqueci minha senha".'
    if (m.includes('cadastro_incompleto')) return 'Matrícula e turma são obrigatórias.'
    if (m.includes('already registered') || m.includes('already been registered')) return 'Este e-mail já tem conta. Tente entrar ou recuperar a senha.'
    if (m.includes('password')) return 'A senha precisa ter pelo menos 8 caracteres.'
    return 'Não foi possível concluir o cadastro. Tente novamente em instantes.'
  }

  const dados: Dados = {
    modo: 'supabase',

    // ---------------- sessão ----------------
    async sessaoAtual() {
      const { data } = await sb.auth.getSession()
      if (!data.session?.user) return null
      return carregarPerfil(data.session.user.id)
    },

    observarSessao(cb) {
      const { data } = sb.auth.onAuthStateChange((_evento, sessao) => {
        // Sair do callback antes de consultar o banco evita travar o lock do GoTrue.
        setTimeout(async () => {
          if (!sessao?.user) {
            perfilCache = null
            cb(null)
            return
          }
          try {
            cb(await carregarPerfil(sessao.user.id))
          } catch {
            cb(null)
          }
        }, 0)
      })
      return () => data.subscription.unsubscribe()
    },

    async entrar(email, senha) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password: senha })
      if (error) {
        if (error.message.toLowerCase().includes('invalid login')) throw new Error('E-mail ou senha incorretos.')
        if (error.message.toLowerCase().includes('not confirmed')) throw new Error('Confirme seu e-mail antes de entrar.')
        throw new Error(error.message)
      }
      const perfil = await carregarPerfil(data.user.id)
      if (!perfil) throw new Error('Conta sem perfil vinculado. Fale com o professor.')
      return perfil
    },

    async sair() {
      perfilCache = null
      await sb.auth.signOut()
    },

    async cadastrar(entrada: Cadastro) {
      const { data, error } = await sb.auth.signUp({
        email: entrada.email.trim(),
        password: entrada.senha,
        options: {
          data: {
            nome_completo: entrada.nome_completo.trim(),
            matricula: entrada.matricula.trim(),
            curso: entrada.curso.trim(),
            turma_id: entrada.turma_id,
          },
        },
      })
      if (error) throw new Error(traduzirErroCadastro(error.message))
      return { precisaConfirmarEmail: !data.session }
    },

    async turmas() {
      const { data, error } = await sb.rpc('turmas_abertas')
      if (error) throw new Error(error.message)
      return (data ?? []) as Turma[]
    },

    async validarMatricula(turmaId, matricula, email) {
      const { data, error } = await sb.rpc('validar_matricula', {
        p_turma: turmaId,
        p_matricula: matricula.trim(),
        p_email: email.trim(),
      })
      if (error) return 'erro'
      const r = data as { ok: boolean; motivo: MotivoValidacao }
      return r?.motivo ?? 'erro'
    },

    async recuperarSenha(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir`,
      })
      if (error) throw new Error(error.message)
    },

    async atualizarPerfil(p) {
      const { error } = await sb.rpc('atualizar_meu_perfil', {
        p_nome: p.nome_completo,
        p_telefone: p.telefone,
        p_curso: p.curso,
      })
      if (error) throw new Error(error.message)
      perfilCache = perfilCache ? { ...perfilCache, ...p } : perfilCache
    },

    async alterarSenha(novaSenha) {
      const { error } = await sb.auth.updateUser({ password: novaSenha })
      if (error) throw new Error(error.message)
    },

    // ---------------- aluno ----------------
    async avaliacoesDoAluno() {
      const perfil = exigirPerfil()
      if (!perfil.turma_id) return []
      const { data: avs, error } = await sb
        .from('avaliacoes')
        .select('*')
        .eq('turma_id', perfil.turma_id)
        .eq('status', 'publicada')
        .order('criado_em', { ascending: false })
      if (error) throw new Error(error.message)
      if (!avs?.length) return []

      const { data: subs } = await sb.from('submissoes').select('*').eq('aluno_id', perfil.id)
      const ids = (subs ?? []).map((s) => s.id)
      const { data: cors } = ids.length
        ? await sb.from('correcoes').select('*').in('submissao_id', ids)
        : { data: [] as Correcao[] }

      return (avs as Avaliacao[]).map<AvaliacaoDoAluno>((a) => {
        const submissao = ((subs ?? []) as Submissao[]).find((s) => s.avaliacao_id === a.id) ?? null
        const correcao = submissao
          ? ((cors ?? []) as Correcao[]).find((c) => c.submissao_id === submissao.id) ?? null
          : null
        const visivel = correcao && (correcao.decisao === 'aprovada' || correcao.decisao === 'ajustada')
        return { ...a, submissao, correcao: visivel ? correcao : null }
      })
    },

    async avaliacao(id) {
      const { data, error } = await sb.from('avaliacoes').select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Avaliacao) ?? null
    },

    async obterOuCriarSubmissao(avaliacaoId) {
      const perfil = exigirPerfil()
      const { data: existente } = await sb
        .from('submissoes')
        .select('*')
        .eq('avaliacao_id', avaliacaoId)
        .eq('aluno_id', perfil.id)
        .maybeSingle()
      if (existente) return existente as Submissao
      const { data, error } = await sb
        .from('submissoes')
        .insert({ avaliacao_id: avaliacaoId, aluno_id: perfil.id })
        .select('*')
        .single()
      if (error) throw new Error(error.message)
      return data as Submissao
    },

    async enviarFoto(submissaoId, arquivo) {
      const perfil = exigirPerfil()
      const caminho = `${perfil.id}/${submissaoId}.jpg`
      const { error } = await sb.storage.from('redacoes').upload(caminho, arquivo, {
        contentType: 'image/jpeg',
        upsert: true,
      })
      if (error) throw new Error(`Falha ao enviar a foto: ${error.message}`)
      const { error: erro2 } = await sb.from('submissoes').update({ foto_path: caminho }).eq('id', submissaoId)
      if (erro2) throw new Error(erro2.message)
      return caminho
    },

    async urlDaFoto(path) {
      if (!path) return null
      const { data } = await sb.storage.from('redacoes').createSignedUrl(path, 3600)
      return data?.signedUrl ?? null
    },

    async transcrever(submissaoId) {
      const r = await api<{ submissao: Submissao }>('/transcrever', { submissao_id: submissaoId })
      return r.submissao
    },

    async salvarTranscricao(submissaoId, texto) {
      const { error } = await sb.from('submissoes').update({ transcrito: texto }).eq('id', submissaoId)
      if (error) throw new Error(error.message)
    },

    async enviarRedacao(submissaoId) {
      const agora = new Date().toISOString()
      const { error } = await sb
        .from('submissoes')
        .update({ status: 'enviada', enviado_em: agora, confirmado_em: agora })
        .eq('id', submissaoId)
      if (error) throw new Error(error.message)
    },

    // ---------------- professor ----------------
    async turmasTodas() {
      const { data, error } = await sb.from('turmas').select('*').order('periodo', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as Turma[]
    },

    async criarTurma(t) {
      const { data, error } = await sb.from('turmas').insert(t).select('*').single()
      if (error) throw new Error(error.message)
      return data as Turma
    },

    async resumoAvaliacoes() {
      const [{ data: avs }, { data: subs }, { data: cors }, { data: lances }, { data: esperados }] =
        await Promise.all([
          sb.from('avaliacoes').select('*').order('criado_em', { ascending: false }),
          sb.from('submissoes').select('*'),
          sb.from('correcoes').select('id,submissao_id,decisao'),
          sb.from('lancamentos_siga').select('id,correcao_id,sucesso'),
          sb.from('alunos_esperados').select('turma_id'),
        ])

      const listaAvaliacoes = (avs ?? []) as Avaliacao[]
      const listaSubs = (subs ?? []) as Submissao[]
      const listaCors = (cors ?? []) as Pick<Correcao, 'id' | 'submissao_id' | 'decisao'>[]
      const listaLances = (lances ?? []) as Pick<LancamentoSiga, 'id' | 'correcao_id' | 'sucesso'>[]
      const listaEsperados = (esperados ?? []) as Pick<Esperado, 'turma_id'>[]

      return listaAvaliacoes.map<ResumoAvaliacao>((a) => {
        const subsAv = listaSubs.filter((s) => s.avaliacao_id === a.id && s.status !== 'rascunho')
        const idsSub = new Set(subsAv.map((s) => s.id))
        const corsAv = listaCors.filter((c) => idsSub.has(c.submissao_id))
        const idsCor = new Set(corsAv.map((c) => c.id))
        const lancesAv = listaLances.filter((l) => l.correcao_id && idsCor.has(l.correcao_id) && l.sucesso)
        return {
          ...a,
          total_alunos: listaEsperados.filter((e) => e.turma_id === a.turma_id).length,
          enviadas: subsAv.length,
          corrigidas: corsAv.length,
          aprovadas: corsAv.filter((c) => c.decisao === 'aprovada' || c.decisao === 'ajustada').length,
          lancadas: lancesAv.length,
        }
      })
    },

    async criarAvaliacao(d: NovaAvaliacao) {
      const { data, error } = await sb.from('avaliacoes').insert(d).select('*').single()
      if (error) throw new Error(error.message)
      return data as Avaliacao
    },

    async mudarStatusAvaliacao(id: string, status: StatusAvaliacao) {
      const { error } = await sb.from('avaliacoes').update({ status }).eq('id', id)
      if (error) throw new Error(error.message)
    },

    async alunosDaTurma(turmaId) {
      const { data, error } = await sb
        .from('alunos_esperados')
        .select('*')
        .eq('turma_id', turmaId)
        .order('nome_completo')
      if (error) throw new Error(error.message)
      return (data ?? []) as Esperado[]
    },

    async importarAlunos(turmaId, linhas: LinhaImportacao[]) {
      const { data: existentes } = await sb
        .from('alunos_esperados')
        .select('matricula')
        .eq('turma_id', turmaId)
      const jaExiste = new Set(((existentes ?? []) as { matricula: string }[]).map((e) => e.matricula))

      const registros = linhas.map((l) => ({
        turma_id: turmaId,
        matricula: l.matricula.trim(),
        nome_completo: l.nome_completo.trim(),
        email: l.email.trim().toLowerCase(),
      }))

      const { error } = await sb.from('alunos_esperados').upsert(registros, { onConflict: 'turma_id,matricula' })
      if (error) throw new Error(error.message)

      const inseridos = registros.filter((r) => !jaExiste.has(r.matricula)).length
      return { inseridos, atualizados: registros.length - inseridos }
    },

    async submissoesDaAvaliacao(avaliacaoId) {
      const { data: subs, error } = await sb
        .from('submissoes')
        .select('*')
        .eq('avaliacao_id', avaliacaoId)
        .neq('status', 'rascunho')
        .order('enviado_em', { ascending: true })
      if (error) throw new Error(error.message)
      const lista = (subs ?? []) as Submissao[]
      if (!lista.length) return []

      const idsAlunos = [...new Set(lista.map((s) => s.aluno_id))]
      const idsSubs = lista.map((s) => s.id)

      const [{ data: perfis }, { data: cors }] = await Promise.all([
        sb.from('profiles').select('id,nome_completo,matricula,email').in('id', idsAlunos),
        sb.from('correcoes').select('*').in('submissao_id', idsSubs),
      ])

      const listaCors = (cors ?? []) as Correcao[]
      const idsCors = listaCors.map((c) => c.id)
      const lances = idsCors.length
        ? (
            await sb
              .from('lancamentos_siga')
              .select('*')
              .in('correcao_id', idsCors)
              .order('criado_em', { ascending: false })
          ).data
        : []

      return lista.map<SubmissaoDoProfessor>((s) => {
        const aluno = ((perfis ?? []) as SubmissaoDoProfessor['aluno'][]).find((p) => p.id === s.aluno_id) ?? {
          id: s.aluno_id,
          nome_completo: 'Aluno',
          matricula: null,
          email: '',
        }
        const correcao = listaCors.find((c) => c.submissao_id === s.id) ?? null
        const lancamento =
          ((lances ?? []) as LancamentoSiga[]).find((l) => l.correcao_id && l.correcao_id === correcao?.id) ?? null
        return { submissao: s, aluno, correcao, lancamento }
      })
    },

    async corrigir(submissaoId) {
      const r = await api<{ correcao: Correcao }>('/corrigir', { submissao_id: submissaoId })
      return r.correcao
    },

    async salvarRevisao(correcaoId: string, revisao: Revisao) {
      const { data: av, error: e1 } = await sb
        .from('correcoes')
        .select('*, submissao:submissoes!inner(avaliacao_id, avaliacao:avaliacoes!inner(valor_total))')
        .eq('id', correcaoId)
        .single()
      if (e1) throw new Error(e1.message)

      const valorTotal = Number((av as any).submissao.avaliacao.valor_total)
      const notaBruta = revisao.criterios.reduce((t, c) => t + Number(c.valor), 0)
      const { error } = await sb
        .from('correcoes')
        .update({
          criterios: revisao.criterios,
          comentario_professor: revisao.comentario_professor,
          ...(revisao.pontos_fortes ? { pontos_fortes: revisao.pontos_fortes } : {}),
          ...(revisao.pontos_desenvolver ? { pontos_desenvolver: revisao.pontos_desenvolver } : {}),
          nota_bruta: notaBruta,
          nota_final: notaParaSiga(notaBruta, valorTotal),
          decisao: revisao.decisao,
          revisado_por: exigirPerfil().id,
          revisado_em: new Date().toISOString(),
        })
        .eq('id', correcaoId)
      if (error) throw new Error(error.message)

      const { error: e2 } = await sb
        .from('submissoes')
        .update({ status: revisao.decisao === 'rejeitada' ? 'devolvida' : 'corrigida' })
        .eq('id', (av as any).submissao_id)
      if (e2) throw new Error(e2.message)
    },

    async corrigirManual(submissaoId) {
      const r = await api<{ correcao: Correcao }>('/corrigir-manual', { submissao_id: submissaoId })
      return r.correcao
    },

    async lancarNoSiga(correcaoId) {
      const r = await api<{ lancamento: LancamentoSiga }>('/siga/lancar', { correcao_id: correcaoId })
      return r.lancamento
    },

    async avaliacoesDoSiga(turma, periodo) {
      const q = new URLSearchParams({ turma, periodo })
      return api<QuadroSiga>(`/siga/avaliacoes?${q.toString()}`)
    },

    async saude() {
      return api<Diagnostico>('/saude')
    },
  }

  return dados
}
