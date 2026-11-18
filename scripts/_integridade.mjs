/**
 * Conferência de integridade dos dados — funções puras, sem rede.
 *
 * Usado por `pnpm verificar` (contra o banco) e por `pnpm test:integridade`
 * (contra casos quebrados de propósito). A ideia: se um dia uma nota não fechar,
 * um critério sumir, uma redação apontar para avaliação inexistente ou o arquivo
 * de backup vier truncado, isto grita antes de o professor lançar no SIGA.
 */

const perto = (a, b, tolerancia = 0.011) => Math.abs(Number(a) - Number(b)) <= tolerancia

/** Arredonda como o app faz: uma casa decimal. */
export const notaDe = (bruta, valorTotal) => Math.round((Number(bruta) / Number(valorTotal)) * 10 * 10) / 10

export function conferir(dados) {
  const achados = []
  const anotar = (nivel, codigo, mensagem) => achados.push({ nivel, codigo, mensagem })

  const turmas = dados.turmas ?? []
  const alunos = dados.alunos_esperados ?? []
  const perfis = dados.profiles ?? []
  const avaliacoes = dados.avaliacoes ?? []
  const submissoes = dados.submissoes ?? []
  const correcoes = dados.correcoes ?? []
  const lancamentos = dados.lancamentos_siga ?? []
  const frequencias = dados.frequencias ?? []

  const idsTurma = new Set(turmas.map((t) => t.id))
  const idsPerfil = new Set(perfis.map((p) => p.id))
  const porId = (lista) => new Map(lista.map((x) => [x.id, x]))
  const avaliacaoPorId = porId(avaliacoes)
  const submissaoPorId = porId(submissoes)
  const correcaoPorId = porId(correcoes)

  // ---- vínculos -----------------------------------------------------------
  for (const p of perfis) {
    if (p.turma_id && !idsTurma.has(p.turma_id)) {
      anotar('erro', 'perfil-sem-turma', `perfil ${p.email ?? p.id} aponta para turma inexistente`)
    }
    if (p.papel === 'aluno' && !p.matricula) {
      anotar('erro', 'aluno-sem-matricula', `perfil ${p.email ?? p.id} é aluno mas não tem matrícula`)
    }
  }
  for (const a of alunos) {
    if (!idsTurma.has(a.turma_id)) {
      anotar('erro', 'lista-sem-turma', `matrícula ${a.matricula} está numa turma inexistente`)
    }
    if (a.user_id && !idsPerfil.has(a.user_id)) {
      anotar('erro', 'lista-aponta-fantasma', `matrícula ${a.matricula} aponta para conta inexistente`)
    }
  }
  for (const f of frequencias) {
    if (!idsTurma.has(f.turma_id)) {
      anotar('erro', 'frequencia-sem-turma', `chamada de ${f.matricula} aponta para turma inexistente`)
    }
    if (f.aluno_id && !idsPerfil.has(f.aluno_id)) {
      anotar('erro', 'frequencia-sem-aluno', `chamada de ${f.matricula} aponta para conta inexistente`)
    }
    if (typeof f.presente !== 'boolean') {
      anotar('erro', 'frequencia-sem-presenca', `chamada de ${f.matricula} em ${f.data_aula} sem presente/ausente`)
    }
  }
  for (const av of avaliacoes) {
    if (!idsTurma.has(av.turma_id)) {
      anotar('erro', 'avaliacao-sem-turma', `avaliação ${av.titulo} está numa turma inexistente`)
    }
    // ---- a rubrica tem de fechar com o valor total ------------------------
    const rubrica = Array.isArray(av.rubrica) ? av.rubrica : []
    if (rubrica.length === 0) {
      anotar('erro', 'avaliacao-sem-rubrica', `avaliação ${av.titulo} não tem critérios`)
    } else {
      const soma = rubrica.reduce((s, c) => s + Number(c.valor ?? 0), 0)
      if (!perto(soma, av.valor_total)) {
        anotar('erro', 'rubrica-nao-fecha', `avaliação ${av.titulo}: rubrica soma ${soma}, valor total ${av.valor_total}`)
      }
      for (const c of rubrica) {
        if (!(Number(c.valor) > 0)) {
          anotar('erro', 'criterio-sem-valor', `avaliação ${av.titulo}: critério "${c.nome}" com valor ${c.valor}`)
        }
      }
    }
    if (Number(av.peso_siga) < 0) {
      anotar('erro', 'peso-negativo', `avaliação ${av.titulo}: peso no SIGA ${av.peso_siga}`)
    }
  }
  for (const s of submissoes) {
    if (!avaliacaoPorId.has(s.avaliacao_id)) {
      anotar('erro', 'submissao-sem-avaliacao', `submissão ${s.id} aponta para avaliação inexistente`)
    }
    if (!idsPerfil.has(s.aluno_id)) {
      anotar('erro', 'submissao-sem-aluno', `submissão ${s.id} aponta para aluno inexistente`)
    }
    if (['enviada', 'corrigida', 'devolvida'].includes(s.status) && !s.enviado_em) {
      anotar('erro', 'entrega-sem-data', `submissão ${s.id} está "${s.status}" mas não tem data de envio`)
    }
    if (['enviada', 'corrigida'].includes(s.status) && !s.transcrito?.trim()) {
      anotar('aviso', 'entrega-sem-texto', `submissão ${s.id} está "${s.status}" sem transcrição`)
    }
  }
  for (const c of correcoes) {
    const sub = submissaoPorId.get(c.submissao_id)
    if (!sub) {
      anotar('erro', 'correcao-sem-submissao', `correção ${c.id} aponta para submissão inexistente`)
      continue
    }
    const av = avaliacaoPorId.get(sub.avaliacao_id)
    if (!av) continue

    // ---- a nota ----------------------------------------------------------
    const criterios = Array.isArray(c.criterios) ? c.criterios : []
    if (criterios.length === 0) {
      anotar('erro', 'correcao-sem-criterios', `correção ${c.id} não tem critérios`)
    } else {
      const soma = criterios.reduce((s, x) => s + Number(x.valor ?? 0), 0)
      if (!perto(soma, c.nota_bruta)) {
        anotar('erro', 'criterios-nao-somam', `correção ${c.id}: critérios somam ${soma}, nota bruta ${c.nota_bruta}`)
      }
      if (criterios.length !== (av.rubrica ?? []).length) {
        anotar(
          'aviso',
          'criterios-em-desacordo',
          `correção ${c.id} tem ${criterios.length} critérios, a rubrica tem ${(av.rubrica ?? []).length}`,
        )
      }
    }
    if (Number(c.nota_bruta) < 0 || Number(c.nota_bruta) > Number(av.valor_total) + 0.01) {
      anotar('erro', 'nota-fora-da-escala', `correção ${c.id}: nota bruta ${c.nota_bruta} fora de 0..${av.valor_total}`)
    }
    const esperada = notaDe(c.nota_bruta, av.valor_total)
    if (!perto(c.nota_final, esperada)) {
      anotar(
        'erro',
        'nota-final-divergente',
        `correção ${c.id}: nota final ${c.nota_final} mas ${c.nota_bruta}/${av.valor_total}×10 = ${esperada}`,
      )
    }
    if (['aprovada', 'ajustada'].includes(c.decisao) && !c.revisado_em) {
      anotar('aviso', 'aprovada-sem-revisao', `correção ${c.id} está "${c.decisao}" sem data de revisão`)
    }
  }

  // ---- lançamentos no SIGA -------------------------------------------------
  for (const l of lancamentos) {
    if (l.correcao_id && !correcaoPorId.has(l.correcao_id)) {
      anotar('aviso', 'lancamento-orfao', `lançamento ${l.id} (${l.matricula}) aponta para correção apagada`)
    }
    if (Number(l.nota) < 0) {
      anotar('erro', 'lancamento-negativo', `lançamento ${l.id} (${l.matricula}) com nota ${l.nota}`)
    }
    if (l.sucesso && !l.http_status) {
      anotar('aviso', 'lancamento-sem-http', `lançamento ${l.id} marcado como sucesso sem status HTTP`)
    }
  }

  // ---- duplicidades que o banco já impede (conferência de restauração) -----
  const vistos = new Map()
  for (const s of submissoes) {
    const chave = `${s.avaliacao_id}:${s.aluno_id}`
    if (vistos.has(chave)) {
      anotar('erro', 'entrega-duplicada', `duas submissões para a mesma avaliação e aluno (${chave})`)
    }
    vistos.set(chave, true)
  }

  return achados
}

export function resumir(dados) {
  return {
    turmas: (dados.turmas ?? []).length,
    alunos: (dados.alunos_esperados ?? []).length,
    perfis: (dados.profiles ?? []).length,
    avaliacoes: (dados.avaliacoes ?? []).length,
    submissoes: (dados.submissoes ?? []).length,
    correcoes: (dados.correcoes ?? []).length,
    lancamentos: (dados.lancamentos_siga ?? []).length,
    frequencias: (dados.frequencias ?? []).length,
    auditoria: (dados.auditoria ?? []).length,
  }
}
