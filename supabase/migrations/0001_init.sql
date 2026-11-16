-- =============================================================================
-- 0001_init.sql — Avaliações "Análise de Dados para Biocientistas"
-- Executado como superusuário (SQL Editor do Supabase ou Management API).
-- Idempotente: pode rodar mais de uma vez sem quebrar.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.papel_t as enum ('aluno', 'professor');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Turmas
-- -----------------------------------------------------------------------------
create table if not exists public.turmas (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null,
  codigo_siga  text not null,
  periodo      text not null,
  curso        text not null,
  ativo        boolean not null default true,
  criado_em    timestamptz not null default now(),
  unique (codigo_siga, periodo)
);

-- -----------------------------------------------------------------------------
-- Lista de presença importada pelo professor (fonte da verdade do cadastro)
-- -----------------------------------------------------------------------------
create table if not exists public.alunos_esperados (
  id            uuid primary key default gen_random_uuid(),
  turma_id      uuid not null references public.turmas(id) on delete cascade,
  matricula     text not null,
  nome_completo text not null,
  email         text not null,
  user_id       uuid references auth.users(id) on delete set null,
  criado_em     timestamptz not null default now(),
  unique (turma_id, matricula)
);
create index if not exists alunos_esperados_turma_idx on public.alunos_esperados (turma_id);
create index if not exists alunos_esperados_email_idx on public.alunos_esperados (lower(email));

-- -----------------------------------------------------------------------------
-- Quem pode entrar como professor. Sem esta lista, o cadastro SEMPRE vira aluno
-- (impede escalada de privilégio por metadata forjada no signUp).
-- -----------------------------------------------------------------------------
create table if not exists public.professores_autorizados (
  email     text primary key,
  criado_em timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Perfis (1:1 com auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users(id) on delete cascade,
  papel               public.papel_t not null default 'aluno',
  nome_completo       text not null,
  matricula           text unique,
  email               text not null,
  curso               text,
  telefone            text,
  turma_id            uuid references public.turmas(id),
  precisa_trocar_senha boolean not null default false,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);
create index if not exists profiles_turma_idx on public.profiles (turma_id, papel);

-- -----------------------------------------------------------------------------
-- Avaliações
-- -----------------------------------------------------------------------------
create table if not exists public.avaliacoes (
  id              uuid primary key default gen_random_uuid(),
  turma_id        uuid not null references public.turmas(id) on delete cascade,
  titulo          text not null,
  tema            text not null,
  instrucoes      text not null,
  capitulo        text,                       -- ex.: 'cap08' (opcional, para o boletim)
  valor_total     numeric(5,2) not null check (valor_total > 0),
  rubrica         jsonb not null,             -- [{id, nome, descricao, valor}]
  descricao_siga  text,                       -- deve casar com a descrição da TVC no SIGA
  peso_siga       numeric(5,2) not null default 10,
  data_siga       date,
  abre_em         timestamptz,
  prazo_em        timestamptz,
  status          text not null default 'rascunho'
                  check (status in ('rascunho', 'publicada', 'encerrada')),
  criado_por      uuid references public.profiles(id),
  criado_em       timestamptz not null default now()
);
create index if not exists avaliacoes_turma_idx on public.avaliacoes (turma_id, status);

-- A rubrica tem de somar exatamente o valor total: é ela que garante a nota.
create or replace function public.soma_rubrica(p_rubrica jsonb)
returns numeric language sql immutable as $$
  select coalesce(sum((c->>'valor')::numeric), 0)
  from jsonb_array_elements(p_rubrica) c;
$$;

create or replace function public.checa_rubrica()
returns trigger language plpgsql as $$
declare soma numeric;
begin
  if jsonb_typeof(new.rubrica) <> 'array' or jsonb_array_length(new.rubrica) = 0 then
    raise exception 'A rubrica precisa ter ao menos um critério.';
  end if;
  soma := public.soma_rubrica(new.rubrica);
  if abs(soma - new.valor_total) > 0.01 then
    raise exception 'A rubrica soma % mas o valor total é %.', soma, new.valor_total;
  end if;
  return new;
end $$;

drop trigger if exists avaliacoes_rubrica on public.avaliacoes;
create trigger avaliacoes_rubrica before insert or update of rubrica, valor_total
  on public.avaliacoes for each row execute function public.checa_rubrica();

-- -----------------------------------------------------------------------------
-- Submissões (a foto + a transcrição confirmada pelo aluno)
-- -----------------------------------------------------------------------------
create table if not exists public.submissoes (
  id               uuid primary key default gen_random_uuid(),
  avaliacao_id     uuid not null references public.avaliacoes(id) on delete cascade,
  aluno_id         uuid not null references public.profiles(id) on delete cascade,
  foto_path        text,
  transcrito       text,
  transcrito_modelo text,
  transcrito_em    timestamptz,
  confirmado_em    timestamptz,
  status           text not null default 'rascunho'
                   check (status in ('rascunho', 'enviada', 'corrigida', 'devolvida')),
  enviado_em       timestamptz,
  criado_em        timestamptz not null default now(),
  unique (avaliacao_id, aluno_id)
);
create index if not exists submissoes_avaliacao_idx on public.submissoes (avaliacao_id, status);

-- -----------------------------------------------------------------------------
-- Correções (uma por submissão; a IA sugere, o professor decide)
-- -----------------------------------------------------------------------------
create table if not exists public.correcoes (
  id                  uuid primary key default gen_random_uuid(),
  submissao_id        uuid not null unique references public.submissoes(id) on delete cascade,
  modelo              text,
  prompt_versao       text,
  criterios           jsonb not null,          -- [{id, nome, valor, justificativa}]
  nota_bruta          numeric(5,2) not null,
  nota_final          numeric(4,2) not null,   -- 0 a 10 (escala do SIGA)
  pontos_fortes       text[] not null default '{}',
  pontos_desenvolver  text[] not null default '{}',
  comentario_ia       text,
  comentario_professor text,
  confianca           numeric(3,2),
  decisao             text not null default 'pendente'
                      check (decisao in ('pendente', 'aprovada', 'ajustada', 'rejeitada')),
  revisado_por        uuid references public.profiles(id),
  revisado_em         timestamptz,
  criado_em           timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Lançamentos no SIGA (trilha de auditoria: o que foi enviado e o que voltou)
-- -----------------------------------------------------------------------------
create table if not exists public.lancamentos_siga (
  id                 uuid primary key default gen_random_uuid(),
  correcao_id        uuid references public.correcoes(id) on delete set null,
  submissao_id       uuid references public.submissoes(id) on delete set null,
  matricula          text not null,
  turma_siga         text not null,
  periodo            text,
  descricao_avaliacao text not null,
  nota               numeric(4,2) not null,
  http_status        integer,
  sucesso            boolean not null default false,
  payload            jsonb,
  resposta           jsonb,
  erro               text,
  criado_por         uuid references public.profiles(id),
  criado_em          timestamptz not null default now()
);
create index if not exists lancamentos_correcao_idx on public.lancamentos_siga (correcao_id);

-- -----------------------------------------------------------------------------
-- Auditoria genérica
-- -----------------------------------------------------------------------------
create table if not exists public.auditoria (
  id          bigserial primary key,
  ator        uuid,
  acao        text not null,
  entidade    text,
  entidade_id text,
  detalhe     jsonb,
  criado_em   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Funções auxiliares
-- -----------------------------------------------------------------------------
create or replace function public.eh_professor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.papel = 'professor');
$$;

create or replace function public.minha_turma()
returns uuid language sql stable security definer set search_path = public as $$
  select turma_id from public.profiles where id = auth.uid();
$$;

-- Autoedição do aluno (colunas sensíveis ficam de fora: papel, matrícula, turma)
create or replace function public.atualizar_meu_perfil(
  p_nome text default null, p_telefone text default null, p_curso text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set nome_completo = coalesce(nullif(trim(p_nome), ''), nome_completo),
         telefone      = coalesce(p_telefone, telefone),
         curso         = coalesce(nullif(trim(p_curso), ''), curso),
         atualizado_em = now()
   where id = auth.uid();
end $$;

-- Validação pública do cadastro (antes de criar a conta).
-- Devolve apenas o motivo — nunca o nome ou o e-mail da lista.
create or replace function public.validar_matricula(
  p_turma uuid, p_matricula text, p_email text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v record;
begin
  if p_turma is null or p_matricula is null or p_email is null then
    return jsonb_build_object('ok', false, 'motivo', 'dados_incompletos');
  end if;
  select * into v from public.alunos_esperados
   where turma_id = p_turma and matricula = trim(p_matricula);
  if not found then return jsonb_build_object('ok', false, 'motivo', 'matricula'); end if;
  if lower(v.email) <> lower(trim(p_email)) then
    return jsonb_build_object('ok', false, 'motivo', 'email');
  end if;
  if v.user_id is not null then return jsonb_build_object('ok', false, 'motivo', 'ja_cadastrado'); end if;
  return jsonb_build_object('ok', true, 'motivo', 'ok');
end $$;

create or replace function public.turmas_abertas()
returns table (id uuid, nome text, codigo_siga text, periodo text, curso text)
language sql stable security definer set search_path = public as $$
  select t.id, t.nome, t.codigo_siga, t.periodo, t.curso
    from public.turmas t where t.ativo order by t.periodo desc, t.nome;
$$;

revoke all on function public.validar_matricula(uuid, text, text) from public;
revoke all on function public.turmas_abertas() from public;
grant execute on function public.validar_matricula(uuid, text, text) to anon, authenticated;
grant execute on function public.turmas_abertas() to anon, authenticated;
grant execute on function public.atualizar_meu_perfil(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Criação de perfil no cadastro
--  - professor: somente se o e-mail estiver em professores_autorizados
--  - aluno: matrícula + e-mail têm de constar na lista da turma
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare
  v_esp      record;
  v_turma    uuid;
  v_matricula text;
  v_nome     text;
  v_curso    text;
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
  if lower(v_esp.email) <> lower(new.email) then
    raise exception 'EMAIL_NAO_CONFERE';
  end if;
  if v_esp.user_id is not null then
    raise exception 'CADASTRO_JA_EXISTE';
  end if;

  v_nome  := coalesce(nullif(trim(new.raw_user_meta_data->>'nome_completo'), ''), v_esp.nome_completo);
  v_curso := nullif(trim(new.raw_user_meta_data->>'curso'), '');

  insert into public.profiles (id, papel, nome_completo, matricula, email, curso, turma_id)
  values (new.id, 'aluno', v_nome, v_matricula, new.email, v_curso, v_turma)
  on conflict (id) do nothing;

  update public.alunos_esperados set user_id = new.id where id = v_esp.id;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.turmas                 enable row level security;
alter table public.alunos_esperados       enable row level security;
alter table public.professores_autorizados enable row level security;
alter table public.profiles               enable row level security;
alter table public.avaliacoes             enable row level security;
alter table public.submissoes             enable row level security;
alter table public.correcoes              enable row level security;
alter table public.lancamentos_siga       enable row level security;
alter table public.auditoria              enable row level security;

-- turmas: leitura pública (necessária no cadastro), escrita só professor
drop policy if exists turmas_leitura on public.turmas;
create policy turmas_leitura on public.turmas for select using (true);
drop policy if exists turmas_escrita on public.turmas;
create policy turmas_escrita on public.turmas for all to authenticated
  using (public.eh_professor()) with check (public.eh_professor());

-- lista de presença: só professor
drop policy if exists roster_prof on public.alunos_esperados;
create policy roster_prof on public.alunos_esperados for all to authenticated
  using (public.eh_professor()) with check (public.eh_professor());

drop policy if exists prof_autorizados_prof on public.professores_autorizados;
create policy prof_autorizados_prof on public.professores_autorizados for select to authenticated
  using (public.eh_professor());

-- perfis
drop policy if exists profiles_leitura on public.profiles;
create policy profiles_leitura on public.profiles for select to authenticated
  using (id = auth.uid() or public.eh_professor());
drop policy if exists profiles_prof_escreve on public.profiles;
create policy profiles_prof_escreve on public.profiles for update to authenticated
  using (public.eh_professor()) with check (public.eh_professor());

-- avaliações
drop policy if exists avaliacoes_leitura on public.avaliacoes;
create policy avaliacoes_leitura on public.avaliacoes for select to authenticated
  using (public.eh_professor() or (status = 'publicada' and turma_id = public.minha_turma()));
drop policy if exists avaliacoes_prof on public.avaliacoes;
create policy avaliacoes_prof on public.avaliacoes for all to authenticated
  using (public.eh_professor()) with check (public.eh_professor());

-- submissões
drop policy if exists submissoes_leitura on public.submissoes;
create policy submissoes_leitura on public.submissoes for select to authenticated
  using (aluno_id = auth.uid() or public.eh_professor());
drop policy if exists submissoes_aluno_insere on public.submissoes;
create policy submissoes_aluno_insere on public.submissoes for insert to authenticated
  with check (aluno_id = auth.uid());
drop policy if exists submissoes_aluno_atualiza on public.submissoes;
create policy submissoes_aluno_atualiza on public.submissoes for update to authenticated
  using (aluno_id = auth.uid() and status in ('rascunho', 'devolvida'))
  with check (aluno_id = auth.uid() and status in ('rascunho', 'enviada'));
drop policy if exists submissoes_prof on public.submissoes;
create policy submissoes_prof on public.submissoes for update to authenticated
  using (public.eh_professor()) with check (public.eh_professor());

-- correções: o aluno só vê depois de aprovada
drop policy if exists correcoes_leitura on public.correcoes;
create policy correcoes_leitura on public.correcoes for select to authenticated
  using (
    public.eh_professor()
    or (decisao in ('aprovada', 'ajustada')
        and exists (select 1 from public.submissoes s
                     where s.id = correcoes.submissao_id and s.aluno_id = auth.uid()))
  );
drop policy if exists correcoes_prof on public.correcoes;
create policy correcoes_prof on public.correcoes for all to authenticated
  using (public.eh_professor()) with check (public.eh_professor());

-- lançamentos e auditoria: leitura do professor; escrita só service_role
drop policy if exists lancamentos_prof on public.lancamentos_siga;
create policy lancamentos_prof on public.lancamentos_siga for select to authenticated
  using (public.eh_professor());
drop policy if exists auditoria_prof on public.auditoria;
create policy auditoria_prof on public.auditoria for select to authenticated
  using (public.eh_professor());

-- -----------------------------------------------------------------------------
-- Storage: bucket privado para as fotos das redações
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('redacoes', 'redacoes', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false;

drop policy if exists redacoes_aluno_le on storage.objects;
create policy redacoes_aluno_le on storage.objects for select to authenticated
  using (bucket_id = 'redacoes'
         and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_professor()));

drop policy if exists redacoes_aluno_escreve on storage.objects;
create policy redacoes_aluno_escreve on storage.objects for insert to authenticated
  with check (bucket_id = 'redacoes' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists redacoes_aluno_atualiza on storage.objects;
create policy redacoes_aluno_atualiza on storage.objects for update to authenticated
  using (bucket_id = 'redacoes' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'redacoes' and (storage.foldername(name))[1] = auth.uid()::text);

grant usage on schema public to anon, authenticated;
grant select on public.turmas to anon, authenticated;
grant select, insert, update, delete on public.avaliacoes, public.submissoes, public.correcoes,
      public.alunos_esperados, public.profiles to authenticated;
grant select on public.lancamentos_siga, public.auditoria, public.professores_autorizados to authenticated;
grant insert on public.auditoria to authenticated;
