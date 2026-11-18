-- =============================================================================
-- 0021 — resumo de faltas do próprio aluno
--
-- A tabela `frequencias` é visível apenas ao professor (a chamada é dele). Esta
-- função security definer devolve ao aluno logado somente a contagem agregada
-- da própria matrícula e da própria turma. Nenhum nome, foto ou registro de
-- outra pessoa é exposto. Nada existente é apagado ou alterado.
-- =============================================================================

create or replace function public.minha_frequencia()
returns jsonb
language sql
security definer
stable
set search_path = public
as $$
  with eu as (
    select p.matricula, p.turma_id
      from public.profiles p
     where p.id = auth.uid()
  ),
  minhas as (
    select f.presente, f.data_aula
      from public.frequencias f
      join eu
        on eu.turma_id = f.turma_id
       and eu.matricula = f.matricula
  )
  select jsonb_build_object(
    'faltas', count(*) filter (where not presente),
    'presencas', count(*) filter (where presente),
    'aulas', count(distinct data_aula),
    'limite', 5,
    'horas_por_falta', 3
  )
  from minhas;
$$;

comment on function public.minha_frequencia() is
  'Resumo de faltas/presenças do aluno logado na própria turma; 5 faltas = 15 h (3 h por aula).';

revoke all on function public.minha_frequencia() from public;
grant execute on function public.minha_frequencia() to authenticated;
