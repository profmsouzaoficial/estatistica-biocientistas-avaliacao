-- 0006_apagar_turma.sql
-- Duas coisas que só apareceram quando a turma de teste precisou ser removida:
--   1. profiles.turma_id fica com "on delete restrict" (padrão), então a turma não
--      pode ser apagada enquanto algum aluno estiver ligado a ela — nem para
--      desfazer uma turma criada errado. Passa a "on delete set null": a conta do
--      aluno continua existindo, apenas sem turma.
--   2. não havia rota no app para apagar uma turma; a função abaixo faz isso com
--      resumo do que será removido e trava se já houver nota lançada no SIGA.

alter table public.profiles drop constraint if exists profiles_turma_id_fkey;
alter table public.profiles
  add constraint profiles_turma_id_fkey
  foreign key (turma_id) references public.turmas(id) on delete set null;

create or replace function public.resumo_turma(p_turma uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_alunos int;
  v_avaliacoes int;
  v_enviadas int;
  v_lancadas int;
begin
  if not public.eh_professor() then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;
  select count(*) into v_alunos from public.alunos_esperados where turma_id = p_turma;
  select count(*) into v_avaliacoes from public.avaliacoes where turma_id = p_turma;
  select count(*) into v_enviadas
    from public.submissoes s
    join public.avaliacoes a on a.id = s.avaliacao_id
   where a.turma_id = p_turma and s.status <> 'rascunho';
  select count(*) into v_lancadas
    from public.lancamentos_siga l
    join public.correcoes c on c.id = l.correcao_id
    join public.submissoes s on s.id = c.submissao_id
    join public.avaliacoes a on a.id = s.avaliacao_id
   where a.turma_id = p_turma and l.sucesso;
  return jsonb_build_object(
    'ok', true,
    'alunos', v_alunos,
    'avaliacoes', v_avaliacoes,
    'enviadas', v_enviadas,
    'lancadas', v_lancadas
  );
end $$;

create or replace function public.apagar_turma(p_turma uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_codigo text;
  v_alunos int;
  v_avaliacoes int;
  v_lancadas int;
begin
  if not public.eh_professor() then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;

  select codigo_siga into v_codigo from public.turmas where id = p_turma;
  if v_codigo is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;

  select count(*) into v_alunos from public.alunos_esperados where turma_id = p_turma;
  select count(*) into v_avaliacoes from public.avaliacoes where turma_id = p_turma;
  select count(*) into v_lancadas
    from public.lancamentos_siga l
    join public.correcoes c on c.id = l.correcao_id
    join public.submissoes s on s.id = c.submissao_id
    join public.avaliacoes a on a.id = s.avaliacao_id
   where a.turma_id = p_turma and l.sucesso;

  -- nota que já chegou ao SIGA não pode desaparecer junto com a turma
  if v_lancadas > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'tem_lancamentos', 'lancadas', v_lancadas);
  end if;

  delete from public.turmas where id = p_turma;
  return jsonb_build_object('ok', true, 'codigo', v_codigo, 'alunos', v_alunos, 'avaliacoes', v_avaliacoes);
end $$;

revoke all on function public.resumo_turma(uuid) from public, anon;
revoke all on function public.apagar_turma(uuid) from public, anon;
grant execute on function public.resumo_turma(uuid) to authenticated;
grant execute on function public.apagar_turma(uuid) to authenticated;
