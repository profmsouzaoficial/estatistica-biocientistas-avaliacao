-- =============================================================================
-- 0020 — foto e personalidade no perfil; controle de frequência do professor
--
-- Tudo é aditivo: nenhum dado existente é apagado. As colunas novas em
-- `profiles` ficam nulas até o aluno enviar a foto e concluir o teste.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Perfil: foto (caminho no bucket privado) e resultado do teste
-- -----------------------------------------------------------------------------
alter table public.profiles add column if not exists foto_path text;
alter table public.profiles add column if not exists personalidade jsonb;
alter table public.profiles add column if not exists personalidade_em timestamptz;

comment on column public.profiles.foto_path is
  'Caminho do objeto no bucket privado `perfis`, sempre no formato <uid>/avatar.jpg.';
comment on column public.profiles.personalidade is
  'Resultado do teste educativo de 16 tipos: tipo, papel, estratégia e percentuais por eixo.';
comment on column public.profiles.personalidade_em is
  'Data/hora em que o aluno concluiu (ou refez) o teste.';

-- O aluno não tem UPDATE direto em profiles (a política é do professor). Estas
-- duas funções são o caminho estreito para ele gravar somente a própria foto e
-- o próprio resultado, sem poder mexer em papel, matrícula, turma ou e-mail.
create or replace function public.salvar_foto_perfil(p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;

  if p_path is null or btrim(p_path) = '' then
    update public.profiles
       set foto_path = null,
           atualizado_em = now()
     where id = v_uid;
    return;
  end if;

  -- O caminho é a única coisa que o navegador informa. Exigir o prefixo do
  -- próprio uid impede que alguém aponte o perfil para a foto de outra pessoa.
  if p_path !~ ('^' || v_uid::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Caminho de foto inválido.';
  end if;

  update public.profiles
     set foto_path = p_path,
         atualizado_em = now()
   where id = v_uid;
end $$;

revoke all on function public.salvar_foto_perfil(text) from public;
grant execute on function public.salvar_foto_perfil(text) to authenticated;

create or replace function public.salvar_personalidade(p_resultado jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid         uuid := auth.uid();
  v_tipo        text;
  v_base        text;
  v_identidade  text;
  v_papel       text;
  v_estrategia  text;
  v_dimensoes   jsonb;
  v_chave       text;
  v_valor       jsonb;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre novamente.';
  end if;
  if p_resultado is null or jsonb_typeof(p_resultado) <> 'object' then
    raise exception 'Resultado de personalidade inválido.';
  end if;
  if pg_column_size(p_resultado) > 8192 then
    raise exception 'Resultado de personalidade grande demais.';
  end if;

  v_tipo := upper(coalesce(p_resultado->>'tipo', ''));
  -- E/I + N/S + F/T + J/P + identidade A/T, exatamente no formato do modelo.
  if v_tipo !~ '^[EI][NS][FT][JP]-[AT]$' then
    raise exception 'Código de personalidade inválido.';
  end if;

  v_base := left(v_tipo, 4);
  v_identidade := right(v_tipo, 1);

  -- O papel e a estratégia são derivados do código, não aceitos do cliente.
  v_papel := case
    when substring(v_base from 2 for 2) = 'NT' then 'analistas'
    when substring(v_base from 2 for 2) = 'NF' then 'diplomatas'
    when substring(v_base from 2 for 1) = 'S' and right(v_base, 1) = 'J' then 'sentinelas'
    else 'exploradores'
  end;

  v_estrategia := case
    when v_identidade = 'A' and left(v_base, 1) = 'I' then 'individualismo-confiante'
    when v_identidade = 'A' and left(v_base, 1) = 'E' then 'dominio-social'
    when v_identidade = 'T' and left(v_base, 1) = 'I' then 'aprimoramento-constante'
    else 'engajamento-social'
  end;

  v_dimensoes := p_resultado->'dimensoes';
  if v_dimensoes is null or jsonb_typeof(v_dimensoes) <> 'object' then
    raise exception 'Percentuais de personalidade ausentes.';
  end if;

  foreach v_chave in array array['energia', 'percepcao', 'decisao', 'organizacao', 'identidade'] loop
    v_valor := v_dimensoes->v_chave;
    if v_valor is null or jsonb_typeof(v_valor) <> 'number' then
      raise exception 'Percentual inválido no eixo %.', v_chave;
    end if;
    if (v_valor #>> '{}')::numeric < 0 or (v_valor #>> '{}')::numeric > 100 then
      raise exception 'Percentual fora de 0–100 no eixo %.', v_chave;
    end if;
  end loop;

  update public.profiles
     set personalidade = jsonb_build_object(
           'tipo', v_tipo,
           'papel', v_papel,
           'estrategia', v_estrategia,
           'identidade', v_identidade,
           'dimensoes', v_dimensoes,
           'versao', coalesce((p_resultado->>'versao')::int, 1)
         ),
         personalidade_em = now(),
         atualizado_em = now()
   where id = v_uid;
end $$;

revoke all on function public.salvar_personalidade(jsonb) from public;
grant execute on function public.salvar_personalidade(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Frequência: uma linha por aluno e por data de aula
-- -----------------------------------------------------------------------------
create table if not exists public.frequencias (
  id              uuid primary key default gen_random_uuid(),
  turma_id        uuid not null references public.turmas(id) on delete cascade,
  aluno_id        uuid references public.profiles(id) on delete set null,
  matricula       text not null,
  nome_completo   text not null,
  data_aula       date not null,
  presente        boolean not null default true,
  registrado_por  uuid references public.profiles(id) on delete set null default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (turma_id, matricula, data_aula)
);

create index if not exists frequencias_turma_data_idx
  on public.frequencias (turma_id, data_aula);
create index if not exists frequencias_aluno_idx
  on public.frequencias (aluno_id, data_aula);

comment on table public.frequencias is
  'Chamada do professor: presente/ausente por aluno e por data de aula. O nome é um retrato da lista no momento da chamada.';

create or replace function public.marcar_autor_da_frequencia()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.registrado_por := auth.uid();
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.criado_em := coalesce(new.criado_em, now());
  end if;
  return new;
end $$;

drop trigger if exists trg_marcar_autor_da_frequencia on public.frequencias;
create trigger trg_marcar_autor_da_frequencia
  before insert or update on public.frequencias
  for each row execute function public.marcar_autor_da_frequencia();

alter table public.frequencias enable row level security;

drop policy if exists frequencias_professor on public.frequencias;
create policy frequencias_professor on public.frequencias for all to authenticated
  using (public.eh_professor())
  with check (public.eh_professor());

grant select, insert, update, delete on public.frequencias to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado para as fotos de perfil
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('perfis', 'perfis', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- O aluno lê/escreve apenas a própria pasta; o professor lê todas as fotos
-- (é ele quem monta a lista de frequência). Ninguém fora da sessão lê.
drop policy if exists perfis_foto_le on storage.objects;
create policy perfis_foto_le on storage.objects for select to authenticated
  using (
    bucket_id = 'perfis'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_professor())
  );

drop policy if exists perfis_foto_escreve on storage.objects;
create policy perfis_foto_escreve on storage.objects for insert to authenticated
  with check (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists perfis_foto_atualiza on storage.objects;
create policy perfis_foto_atualiza on storage.objects for update to authenticated
  using (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists perfis_foto_apaga on storage.objects;
create policy perfis_foto_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'perfis' and (storage.foldername(name))[1] = auth.uid()::text);
