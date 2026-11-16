-- -----------------------------------------------------------------------------
-- Consentimento do aviso de privacidade
--
-- O cadastro passa a exigir a marcação do aviso (/privacidade). A data fica em
-- profiles.consentimento_em, gravada pelo gatilho de criação de usuário a partir
-- da metadata enviada pelo app. Quem já tinha conta fica com a coluna nula — o
-- app não inventa consentimento retroativo.
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists consentimento_em timestamptz;

comment on column public.profiles.consentimento_em is
  'Data/hora em que o titular marcou o aviso de privacidade no cadastro; nulo = não registrado.';

-- handle_new_user: mesma regra de matrícula/e-mail da 0003, agora gravando o
-- consentimento quando o app envia consentimento = 'true'.
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

  insert into public.profiles (id, papel, nome_completo, matricula, email, curso, turma_id, consentimento_em)
  values (new.id, 'aluno', v_nome, v_matricula, new.email, v_curso, v_turma, v_consent)
  on conflict (id) do nothing;

  update public.alunos_esperados set user_id = new.id where id = v_esp.id;
  return new;
end $$;
