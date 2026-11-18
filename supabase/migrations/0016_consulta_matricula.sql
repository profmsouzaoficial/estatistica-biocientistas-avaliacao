-- -----------------------------------------------------------------------------
-- Cadastro guiado pela lista da turma
--
-- O aluno já chega pré-cadastrado (importação do CSV do SIGA + conta criada).
-- Para quem ainda não tem conta, o formulário de cadastro não deve pedir nome,
-- e-mail e curso no escuro: basta turma + matrícula. Esta função devolve o que
-- está na lista, para o app preencher sozinho e o aluno só escolher a senha.
--
-- Privacidade: o e-mail completo só sai quando a matrícula AINDA NÃO tem conta
-- (caso em que o aluno precisa dele para criar o cadastro). Depois de criada a
-- conta, devolvemos apenas a versão mascarada — o suficiente para o aluno
-- reconhecer qual endereço usar no login, sem expor a caixa de ninguém.
-- -----------------------------------------------------------------------------

create or replace function public.mascarar_email(p_email text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_email is null or position('@' in p_email) = 0 then null
    else left(split_part(p_email, '@', 1), 1) || '***' ||
         right(split_part(p_email, '@', 1), 1) || '@' || split_part(p_email, '@', 2)
  end
$$;

revoke all on function public.mascarar_email(text) from public;
grant execute on function public.mascarar_email(text) to anon, authenticated;

create or replace function public.consultar_matricula(p_turma uuid, p_matricula text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v        record;
  v_email  text;
  v_curso  text;
  v_exige  boolean;
begin
  if p_turma is null or nullif(trim(p_matricula), '') is null then
    return jsonb_build_object('ok', false, 'motivo', 'dados_incompletos');
  end if;

  select ae.nome_completo, ae.email, ae.user_id, t.curso, t.exige_email
    into v
    from public.alunos_esperados ae
    join public.turmas t on t.id = ae.turma_id
   where ae.turma_id = p_turma
     and upper(trim(ae.matricula)) = upper(trim(p_matricula));

  if not found then
    return jsonb_build_object('ok', false, 'motivo', 'matricula');
  end if;

  v_email := nullif(trim(v.email), '');
  v_curso := nullif(trim(v.curso), '');
  v_exige := coalesce(v.exige_email, true);

  if v.user_id is not null then
    return jsonb_build_object(
      'ok', true,
      'ja_cadastrado', true,
      'email_mascarado', public.mascarar_email(v_email),
      'curso', v_curso
    );
  end if;

  -- Ainda sem conta: devolve os dados da lista para o formulário preencher.
  return jsonb_build_object(
    'ok', true,
    'ja_cadastrado', false,
    'nome', v.nome_completo,
    'email', v_email,
    'curso', v_curso,
    'exige_email', v_exige
  );
end $$;

revoke all on function public.consultar_matricula(uuid, text) from public;
grant execute on function public.consultar_matricula(uuid, text) to anon, authenticated;

-- Deixa a busca por matrícula (sempre em maiúsculas) barata na lista da turma.
create index if not exists alunos_esperados_turma_matricula_idx
  on public.alunos_esperados (turma_id, upper(trim(matricula)));
