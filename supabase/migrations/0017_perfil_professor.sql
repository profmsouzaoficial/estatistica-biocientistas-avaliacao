-- Perfil do professor: departamento e instituto no lugar de matrícula/curso.
-- São campos de identificação profissional, editáveis pelo próprio usuário;
-- o RPC continua sem permitir mexer em papel, turma ou e-mail.

alter table public.profiles add column if not exists departamento text;
alter table public.profiles add column if not exists instituto   text;

-- A assinatura antiga (3 parâmetros) precisa sair: com duas versões e valores
-- padrão, o PostgREST não saberia qual escolher quando o app envia 3 argumentos.
drop function if exists public.atualizar_meu_perfil(text, text, text);

create or replace function public.atualizar_meu_perfil(
  p_nome        text default null,
  p_telefone    text default null,
  p_curso       text default null,
  p_departamento text default null,
  p_instituto    text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set nome_completo = coalesce(nullif(trim(p_nome), ''), nome_completo),
         telefone      = coalesce(p_telefone, telefone),
         curso         = coalesce(nullif(trim(p_curso), ''), curso),
         departamento  = coalesce(nullif(trim(p_departamento), ''), departamento),
         instituto     = coalesce(nullif(trim(p_instituto), ''), instituto),
         atualizado_em = now()
   where id = auth.uid();
end $$;

grant execute on function public.atualizar_meu_perfil(text, text, text, text, text) to authenticated;
