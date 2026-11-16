-- -----------------------------------------------------------------------------
-- Matrícula com letras (padrão do SIGA em Governador Valadares)
--
-- A lista real da turma CBV018GV-A traz matrículas como "202506007GV" — dígitos
-- com o sufixo do campus. A validação antiga só aceitava dígitos, então nem a
-- importação da lista nem o cadastro do aluno funcionavam com esses números.
--
-- Regra nova: comparação sem diferenciar maiúsculas, guardando sempre em
-- maiúsculas. Vale para alunos_esperados, profiles, validar_matricula e
-- handle_new_user, para o mesmo aluno casar nas duas pontas.
-- -----------------------------------------------------------------------------

-- normaliza o que já está gravado (idempotente)
update public.alunos_esperados
   set matricula = upper(trim(matricula))
 where matricula <> upper(trim(matricula));

update public.profiles
   set matricula = upper(trim(matricula))
 where matricula is not null and matricula <> upper(trim(matricula));

-- Validação pública do cadastro (antes de criar a conta).
create or replace function public.validar_matricula(
  p_turma uuid, p_matricula text, p_email text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v      record;
  v_exige boolean;
  v_mat  text;
begin
  if p_turma is null or p_matricula is null or p_email is null then
    return jsonb_build_object('ok', false, 'motivo', 'dados_incompletos');
  end if;

  v_mat := upper(trim(p_matricula));

  select * into v from public.alunos_esperados
   where turma_id = p_turma and upper(trim(matricula)) = v_mat;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'matricula'); end if;
  if v.user_id is not null then return jsonb_build_object('ok', false, 'motivo', 'ja_cadastrado'); end if;

  select t.exige_email into v_exige from public.turmas t where t.id = p_turma;

  if coalesce(trim(v.email), '') = '' then
    if coalesce(v_exige, true) then
      return jsonb_build_object('ok', false, 'motivo', 'sem_email_na_lista');
    end if;
  elsif lower(v.email) <> lower(trim(p_email)) then
    return jsonb_build_object('ok', false, 'motivo', 'email');
  end if;

  return jsonb_build_object('ok', true, 'motivo', 'ok');
end $$;

revoke all on function public.validar_matricula(uuid, text, text) from public;
grant execute on function public.validar_matricula(uuid, text, text) to anon, authenticated;

-- Cadastro: mesma regra (com o consentimento da 0004), matrícula em maiúsculas.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_esp      record;
  v_turma    uuid;
  v_matricula text;
  v_nome     text;
  v_curso    text;
  v_exige    boolean;
  v_consent  timestamptz;
begin
  v_consent := case
    when lower(coalesce(new.raw_user_meta_data->>'consentimento', 'false')) = 'true' then now()
    else null
  end;

  if exists (select 1 from public.professores_autorizados pa where lower(pa.email) = lower(new.email)) then
    insert into public.profiles (id, papel, nome_completo, email, consentimento_em)
    values (new.id, 'professor',
            coalesce(nullif(trim(new.raw_user_meta_data->>'nome_completo'), ''), split_part(new.email, '@', 1)),
            new.email, v_consent)
    on conflict (id) do nothing;
    return new;
  end if;

  v_matricula := upper(nullif(trim(new.raw_user_meta_data->>'matricula'), ''));
  v_turma     := nullif(trim(new.raw_user_meta_data->>'turma_id'), '')::uuid;

  if v_matricula is null or v_turma is null then
    raise exception 'CADASTRO_INCOMPLETO: matrícula e turma são obrigatórias';
  end if;

  select * into v_esp from public.alunos_esperados
   where turma_id = v_turma and upper(trim(matricula)) = v_matricula;
  if not found then
    raise exception 'MATRICULA_NAO_LISTADA';
  end if;
  if v_esp.user_id is not null then
    raise exception 'CADASTRO_JA_EXISTE';
  end if;

  select t.exige_email into v_exige from public.turmas t where t.id = v_turma;

  if coalesce(trim(v_esp.email), '') = '' then
    if coalesce(v_exige, true) then
      raise exception 'SEM_EMAIL_NA_LISTA';
    end if;
    update public.alunos_esperados set email = new.email where id = v_esp.id;
  elsif lower(v_esp.email) <> lower(new.email) then
    raise exception 'EMAIL_NAO_CONFERE';
  end if;

  v_nome  := coalesce(nullif(trim(new.raw_user_meta_data->>'nome_completo'), ''), v_esp.nome_completo);
  v_curso := nullif(trim(new.raw_user_meta_data->>'curso'), '');

  insert into public.profiles (id, papel, nome_completo, matricula, email, curso, turma_id, consentimento_em)
  values (new.id, 'aluno', v_nome, v_matricula, new.email, v_curso, v_turma, v_consent)
  on conflict (id) do nothing;

  update public.alunos_esperados set user_id = new.id where id = v_esp.id;
  return new;
end $$;
