import { createClient } from '@supabase/supabase-js'
import type {
  Dados,
  Cadastro,
  MotivoValidacao,
  NovaAvaliacao,
  Revisao,
  LinhaImportacao,
  RespostaApagarAvaliacao,
  RespostaApagarTurma,
  ConsultaMatricula,
  RegistroFrequencia,
} from './dados'
import { comPrazo, erroDeEnvio, PRAZO_ENVIO_MS } from './envio'
import {
  api,
  configurarRenovacao,
  configurarToken,
  PRAZO_CORRECAO_MS,
  PRAZO_OCR_MS,
  PRAZO_SIGA_MS,
} from './servidor'
import { notaParaSiga } from './types'
import { resultadoValido } from './personalidade'
import type {
  AlunoNaFrequencia,
  Avaliacao,
  MinhaFrequencia,
  AvaliacaoDoAluno,
  Correcao,
  Frequencia,
  Esperado,
  LancamentoSiga,
  QuadroSiga,
  QuadroNotasSiga,
  Perfil,
  ResultadoPersonalidade,
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
  // Um token vencido faz o servidor responder 401. Em uma publicação isso é
  // especialmente ruim: a avaliação local já foi criada e a TVC não chega ao
  // SIGA. Renova um pouco antes de vencer e também deixa uma renovação forçada
  // para a camada de API tentar de novo quando o 401 acontecer mesmo assim.
  let renovando: Promise<string | null> | null = null

  function renovarSessao(): Promise<string | null> {
    if (!renovando) {
      renovando = (async () => {
        try {
          const { data } = await sb.auth.refreshSession()
          return data.session?.access_token ?? null
        } catch {
          return null
        }
      })().finally(() => {
        renovando = null
      })
    }
    return renovando
  }

  configurarToken(async () => {
    const { data } = await sb.auth.getSession()
    const sessao = data.session
    if (!sessao) return null
    const expiraEm = (sessao.expires_at ?? 0) * 1000
    if (expiraEm > 0 && expiraEm < Date.now() + 60_000) {
      const nova = await renovarSessao()
      if (nova) return nova
    }
    return sessao.access_token
  })
  configurarRenovacao(renovarSessao)

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
    if (m.includes('matricula_nao_listada')) return 'Esta matrícula não está na lista desta turma. Confira a turma escolhida e a matrícula; se estiverem certas, peça ao professor para incluir você na lista.'
    if (m.includes('email_nao_confere')) return 'Este e-mail é diferente do que consta na lista da turma. Use o e-mail institucional que a coordenação tem — se não souber qual é, peça ao professor para conferir.'
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
            matricula: entrada.matricula.trim().toUpperCase(),
            curso: entrada.curso.trim(),
            turma_id: entrada.turma_id,
            consentimento: entrada.consentimento === true ? 'true' : 'false',
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

    async consultarMatricula(turmaId, matricula) {
      const { data, error } = await sb.rpc('consultar_matricula', {
        p_turma: turmaId,
        p_matricula: matricula.trim(),
      })
      if (error) throw new Error(error.message)
      return data as ConsultaMatricula
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
        p_curso: p.curso ?? null,
        p_departamento: p.departamento ?? null,
        p_instituto: p.instituto ?? null,
      })
      if (error) throw new Error(error.message)
      perfilCache = perfilCache
        ? {
            ...perfilCache,
            ...(p.curso !== undefined ? { curso: p.curso } : {}),
            ...(p.departamento !== undefined ? { departamento: p.departamento } : {}),
            ...(p.instituto !== undefined ? { instituto: p.instituto } : {}),
          }
        : perfilCache
    },

    async enviarFotoPerfil(arquivo) {
      const perfil = exigirPerfil()
      const caminho = `${perfil.id}/avatar.jpg`
      const { error } = await sb.storage.from('perfis').upload(caminho, arquivo, {
        contentType: 'image/jpeg',
        upsert: true,
        cacheControl: '60',
      })
      if (error) throw new Error(`Não foi possível enviar a foto: ${error.message}`)
      const { error: erroRpc } = await sb.rpc('salvar_foto_perfil', { p_path: caminho })
      if (erroRpc) throw new Error(`A foto subiu, mas o perfil não foi atualizado: ${erroRpc.message}`)
      perfilCache = perfilCache ? { ...perfilCache, foto_path: caminho } : perfilCache
      return caminho
    },

    async removerFotoPerfil() {
      const perfil = exigirPerfil()
      const caminho = perfil.foto_path
      if (caminho) {
        // Se o objeto já não existir, o perfil ainda deve ficar sem foto.
        await sb.storage.from('perfis').remove([caminho]).catch(() => undefined)
      }
      const { error } = await sb.rpc('salvar_foto_perfil', { p_path: null })
      if (error) throw new Error(error.message)
      perfilCache = perfilCache ? { ...perfilCache, foto_path: null } : perfilCache
    },

    async urlDaFotoPerfil(path) {
      if (!path) return null
      const { data, error } = await sb.storage.from('perfis').createSignedUrl(path, 3600)
      if (error) return null
      return data?.signedUrl ?? null
    },

    async salvarPersonalidade(resultado) {
      const { error } = await sb.rpc('salvar_personalidade', { p_resultado: resultado })
      if (error) throw new Error(error.message)
      perfilCache = perfilCache
        ? { ...perfilCache, personalidade: resultado, personalidade_em: new Date().toISOString() }
        : perfilCache
    },

    async alterarSenha(novaSenha, senhaAtual) {
      const { data: sessao } = await sb.auth.getSession()
      const email = sessao.session?.user.email
      if (!sessao.session || !email) {
        throw new Error('Abra o link enviado por e-mail para definir a nova senha.')
      }
      // Trocar a senha a partir de um aparelho já aberto é o caminho do perfil.
      // Aqui a senha antiga é conferida: sessão aberta não basta (celular na mesa).
      if (senhaAtual !== undefined) {
        const { error: erroAtual } = await sb.auth.signInWithPassword({ email, password: senhaAtual })
        if (erroAtual) throw new Error('Senha atual incorreta.')
      }
      const { error } = await sb.auth.updateUser({ password: novaSenha })
      if (error) throw new Error(error.message)
      // Senha provisória (a inicial era o próprio e-mail) deixa de valer assim que
      // a pessoa define uma senha só dela — o aviso some na próxima leitura do perfil.
      // O aluno não tem permissão de update em profiles (a política é do professor);
      // a função age só sobre auth.uid() e apaga o aviso de senha provisória.
      try {
        await sb.rpc('marcar_senha_trocada')
      } catch {
        // a senha já mudou; o aviso é cosmético e pode ser corrigido depois
      }
      // Quem trocou a senha por desconfiança precisa que os outros aparelhos saiam.
      await sb.auth.signOut({ scope: 'others' }).catch(() => undefined)
    },

    // ---------------- aluno ----------------
    async avaliacoesDoAluno() {
      const perfil = exigirPerfil()
      if (!perfil.turma_id) return []
      const { data: avs, error } = await sb
        .from('avaliacoes')
        .select('*')
        .eq('turma_id', perfil.turma_id)
        .in('status', ['publicada', 'encerrada'])
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
      // O SDK do Storage não aceita AbortSignal: o prazo é dado aqui, por fora.
      // Se estourar, o envio pode até terminar em segundo plano — o caminho é
      // fixo e `upsert: true`, então tentar de novo é seguro.
      const envio = sb.storage.from('redacoes').upload(caminho, arquivo, {
        contentType: 'image/jpeg',
        upsert: true,
      })
      const { error } = await comPrazo(envio, PRAZO_ENVIO_MS)
      if (error) {
        console.warn('[foto] falha no upload:', error.message)
        throw erroDeEnvio(error.message)
      }
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
      const r = await api<{ submissao: Submissao }>('/transcrever', { submissao_id: submissaoId }, undefined, PRAZO_OCR_MS)
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

    async resumoTurma(turmaId) {
      const { data, error } = await sb.rpc('resumo_turma', { p_turma: turmaId })
      if (error) throw new Error(error.message)
      const r = data as { ok?: boolean; alunos?: number; avaliacoes?: number; enviadas?: number; lancadas?: number }
      if (!r?.ok) throw new Error('Não foi possível ler o resumo desta turma.')
      return {
        alunos: Number(r.alunos ?? 0),
        avaliacoes: Number(r.avaliacoes ?? 0),
        enviadas: Number(r.enviadas ?? 0),
        lancadas: Number(r.lancadas ?? 0),
      }
    },

    async apagarTurma(turmaId) {
      // Passa pelo servidor para apagar também as fotos do bucket privado — o
      // SQL sozinho não alcança o Storage.
      return api<RespostaApagarTurma>('/turma-excluir', { turma_id: turmaId })
    },

    async apagarAvaliacao(avaliacaoId) {
      const { data, error } = await sb.rpc('apagar_avaliacao', { p_avaliacao: avaliacaoId })
      if (error) throw new Error(error.message)
      return data as RespostaApagarAvaliacao
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

    async mudarPrazoAvaliacao(id, prazoEm) {
      const { error } = await sb.from('avaliacoes').update({ prazo_em: prazoEm }).eq('id', id)
      if (error) throw new Error(error.message)
    },

    async mudarPesoSigaAvaliacao(id, pesoSiga) {
      const { error } = await sb.from('avaliacoes').update({ peso_siga: pesoSiga }).eq('id', id)
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

    async alunosDaTurmaFrequencia(turmaId) {
      const { data: esperados, error } = await sb
        .from('alunos_esperados')
        .select('*')
        .eq('turma_id', turmaId)
        .order('nome_completo')
      if (error) throw new Error(error.message)
      const lista = (esperados ?? []) as Esperado[]

      const ids = [...new Set(lista.map((e) => e.user_id).filter((id): id is string => Boolean(id)))]
      const perfis = ids.length
        ? (
            await sb
              .from('profiles')
              .select('id,foto_path,personalidade,personalidade_em')
              .in('id', ids)
          ).data
        : []

      const caminhos = ((perfis ?? []) as { foto_path: string | null }[])
        .map((p) => p.foto_path)
        .filter((p): p is string => Boolean(p))
      const urls: Record<string, string> = {}
      if (caminhos.length) {
        const { data: assinadas } = await sb.storage.from('perfis').createSignedUrls(caminhos, 3600)
        for (const item of assinadas ?? []) {
          if (item.path && item.signedUrl) urls[item.path] = item.signedUrl
        }
      }

      return lista.map<AlunoNaFrequencia>((e) => {
        const p = ((perfis ?? []) as {
          id: string
          foto_path: string | null
          personalidade: unknown
          personalidade_em: string | null
        }[]).find((x) => x.id === e.user_id)
        const personalidade = resultadoValido(p?.personalidade)
          ? (p!.personalidade as ResultadoPersonalidade)
          : null
        const fotoPath = p?.foto_path ?? null
        return {
          ...e,
          foto_url: fotoPath ? urls[fotoPath] ?? null : null,
          personalidade,
          personalidade_em: p?.personalidade_em ?? null,
        }
      })
    },

    async frequenciaDaTurma(turmaId, dataAula) {
      const { data, error } = await sb
        .from('frequencias')
        .select('*')
        .eq('turma_id', turmaId)
        .eq('data_aula', dataAula)
        .order('nome_completo')
      if (error) throw new Error(error.message)
      return (data ?? []) as Frequencia[]
    },

    async faltasDaTurma(turmaId) {
      const { data, error } = await sb
        .from('frequencias')
        .select('matricula,presente')
        .eq('turma_id', turmaId)
        .eq('presente', false)
      if (error) throw new Error(error.message)
      const mapa: Record<string, number> = {}
      for (const linha of (data ?? []) as { matricula: string }[]) {
        mapa[linha.matricula] = (mapa[linha.matricula] ?? 0) + 1
      }
      return mapa
    },

    async minhaFrequencia() {
      const { data, error } = await sb.rpc('minha_frequencia')
      if (error) throw new Error(error.message)
      const bruto = (data ?? {}) as Partial<Record<keyof MinhaFrequencia, unknown>>
      const numero = (valor: unknown) => {
        const n = Number(valor)
        return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0
      }
      return {
        faltas: numero(bruto.faltas),
        presencas: numero(bruto.presencas),
        aulas: numero(bruto.aulas),
        limite: numero(bruto.limite) || 5,
        horas_por_falta: numero(bruto.horas_por_falta) || 3,
      }
    },

    async salvarFrequencia(turmaId, dataAula, registros: RegistroFrequencia[]) {
      if (!registros.length) return
      const linhas = registros.map((r) => ({
        turma_id: turmaId,
        aluno_id: r.aluno_id,
        matricula: r.matricula,
        nome_completo: r.nome_completo,
        data_aula: dataAula,
        presente: r.presente,
      }))
      const { error } = await sb
        .from('frequencias')
        .upsert(linhas, { onConflict: 'turma_id,matricula,data_aula' })
      if (error) throw new Error(error.message)
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

    async definirExigenciaDeEmail(turmaId, exige) {
      const { error } = await sb.from('turmas').update({ exige_email: exige }).eq('id', turmaId)
      if (error) throw new Error(error.message)
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
      const r = await api<{ correcao: Correcao }>('/corrigir', { submissao_id: submissaoId }, undefined, PRAZO_CORRECAO_MS)
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
      const r = await api<{ correcao: Correcao }>('/corrigir-manual', { submissao_id: submissaoId }, undefined, PRAZO_CORRECAO_MS)
      return r.correcao
    },

    async lancarNoSiga(correcaoId) {
      const r = await api<{ lancamento: LancamentoSiga; repetido?: boolean }>(
        '/siga/lancar',
        { correcao_id: correcaoId },
        undefined,
        PRAZO_SIGA_MS,
      )
      return { lancamento: r.lancamento, repetido: Boolean(r.repetido) }
    },

    async avaliacoesDoSiga(turma, periodo) {
      const q = new URLSearchParams({ turma, periodo })
      return api<QuadroSiga>(`/siga/avaliacoes?${q.toString()}`)
    },

    async notasDoSiga(turma, periodo) {
      const q = new URLSearchParams({ turma, periodo })
      return api<QuadroNotasSiga>(`/siga/notas?${q.toString()}`)
    },

    async historicoLancamentos(avaliacaoId) {
      const { data: avaliacao, error: erroAvaliacao } = await sb
        .from('avaliacoes')
        .select('id,turma_id,descricao_siga')
        .eq('id', avaliacaoId)
        .maybeSingle()
      if (erroAvaliacao) throw new Error(`Não consegui ler a avaliação: ${erroAvaliacao.message}`)
      if (!avaliacao?.descricao_siga) return []
      const { data: turma, error: erroTurma } = await sb
        .from('turmas')
        .select('codigo_siga')
        .eq('id', avaliacao.turma_id)
        .maybeSingle()
      if (erroTurma || !turma) throw new Error('Turma da avaliação não encontrada.')
      // Filtra pelo que foi realmente enviado (turma + descrição), não pelos ids
      // atuais: um lançamento antigo continua no histórico mesmo se a correção
      // ou a submissão forem apagadas depois (o FK vira nulo).
      const { data, error } = await sb
        .from('lancamentos_siga')
        .select('*')
        .eq('turma_siga', turma.codigo_siga)
        .eq('descricao_avaliacao', avaliacao.descricao_siga)
        .order('criado_em', { ascending: false })
      if (error) throw new Error(`Não consegui ler o histórico: ${error.message}`)

      const linhas = (data ?? []) as (LancamentoSiga & { escala: string | null })[]
      if (linhas.length === 0) return []
      const matriculas = [...new Set(linhas.map((l) => l.matricula))]
      const { data: perfis } = await sb
        .from('profiles')
        .select('nome_completo,matricula')
        .in('matricula', matriculas)
      const nomes = new Map(
        ((perfis ?? []) as { nome_completo: string; matricula: string | null }[]).map((p) => [
          p.matricula ?? '',
          p.nome_completo,
        ]),
      )
      return linhas.map((l) => ({ ...l, aluno_nome: nomes.get(l.matricula) ?? 'Aluno' }))
    },

    async saude() {
      return api<Diagnostico>('/saude')
    },
  }

  return dados
}
