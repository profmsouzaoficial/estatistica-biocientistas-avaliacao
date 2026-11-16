-- -----------------------------------------------------------------------------
-- Turma sem e-mails na lista (opcional, desligado por padrão)
--
-- Motivo: o SIGA não devolve e-mail dos alunos. Quando o professor não tem a
-- lista de e-mails, ele importa só matrícula + nome e liga esta opção; o aluno
-- se cadastra digitando o próprio e-mail, que passa a valer como o e-mail
-- daquela matrícula. O padrão continua sendo exigir o e-mail já cadastrado.
-- -----------------------------------------------------------------------------

alter table public.turmas
  add column if not exists exige_email boolean not null default true;

-- Validação pública do cadastro: respeita a opção da turma.
create or replace function public.validar_matricula(
  p_turma uuid, p_matricula text, p_email text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v      record;
  v_exige boolean;
begin
  if p_turma is null or p_matricula is null or p_email is null then
    return jsonb_build_object('ok', false, 'motivo', 'dados_incompletos');
  end if;
  select * into v from public.alunos_esperados
   where turma_id = p_turma and matricula = trim(p_matricula);
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

-- Cadastro: mesma regra; sem e-mail na lista, o e-mail digitado é gravado.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_esp      record;
  v_turma    uuid;
  v_matricula text;
  v_nome     text;
  v_curso    text;
  v_exige    boolean;
begin
  if exists (select 1 from public.professores_autorizados pa where lower(pa.email) = lower(new.email)) then
    insert into public.profiles (id, papel, nome_completo, email)
    values (new.id, 'professor',
            coalesce(nullif(trim(new.raw_user_meta_data->>'nome_completo'), ''), split_part(new.email, '@', 1)),
            new.email)
    on conflict (id) do nothing;
    return new;
  end if;

  v_matricula := nullif(trim(new.raw_user_meta_data->>'matricula'), '');
  v_turma     := nullif(trim(new.raw_user_meta_data->>'turma_id'), '')::uuid;

  if v_matricula is null or v_turma is null then
    raise exception 'CADASTRO_INCOMPLETO: matrícula e turma são obrigatórias';
  end if;

  select * into v_esp from public.alunos_esperados
   where turma_id = v_turma and matricula = v_matricula;
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

  insert into public.profiles (id, papel, nome_completo, matricula, email, curso, turma_id)
  values (new.id, 'aluno', v_nome, v_matricula, new.email, v_curso, v_turma)
  on conflict (id) do nothing;

  update public.alunos_esperados set user_id = new.id where id = v_esp.id;
  return new;
end $$;
