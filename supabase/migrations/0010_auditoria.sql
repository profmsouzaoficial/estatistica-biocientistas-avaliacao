-- Auditoria das decisões do professor.
--
-- O app gravava auditoria em três pontos (correção por IA, correção manual e
-- lançamento) e nenhum deles funcionava: mandavam a coluna `ator_id`, que não
-- existe (`ator`), e o erro era engolido por um catch vazio. Resultado: a
-- tabela ficou com zero linhas em todos os testes de ponta a ponta.
--
-- Além de corrigir os três pontos, a auditoria passa a ser do banco: revisão,
-- devolução, mudança de prazo e mudança de estado da avaliação geram registro
-- sozinhos, sem depender de cada tela lembrar de gravar.

create or replace function public.auditar_revisao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.decisao is distinct from old.decisao then
    insert into public.auditoria (ator, acao, entidade, entidade_id, detalhe)
    values (
      auth.uid(),
      'revisar_correcao',
      'correcoes',
      new.id::text,
      jsonb_build_object(
        'de', old.decisao,
        'para', new.decisao,
        'nota_anterior', old.nota_final,
        'nota_final', new.nota_final,
        'nota_bruta', new.nota_bruta
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_auditar_revisao on public.correcoes;
create trigger trg_auditar_revisao
  after update on public.correcoes
  for each row execute function public.auditar_revisao();

create or replace function public.auditar_avaliacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.prazo_em is distinct from old.prazo_em then
    insert into public.auditoria (ator, acao, entidade, entidade_id, detalhe)
    values (
      auth.uid(),
      'mudar_prazo',
      'avaliacoes',
      new.id::text,
      jsonb_build_object('de', old.prazo_em, 'para', new.prazo_em, 'titulo', new.titulo)
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.auditoria (ator, acao, entidade, entidade_id, detalhe)
    values (
      auth.uid(),
      'mudar_status_avaliacao',
      'avaliacoes',
      new.id::text,
      jsonb_build_object('de', old.status, 'para', new.status, 'titulo', new.titulo)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_auditar_avaliacao on public.avaliacoes;
create trigger trg_auditar_avaliacao
  after update on public.avaliacoes
  for each row execute function public.auditar_avaliacao();
