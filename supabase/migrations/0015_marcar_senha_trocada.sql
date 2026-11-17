-- -----------------------------------------------------------------------------
-- O aluno marca que trocou a senha provisória
--
-- A política de update de `profiles` é só do professor (0001). O aluno precisa
-- de um caminho estreito para apagar o próprio aviso — e nada além disso.
-- A função não recebe parâmetros: sempre age sobre auth.uid().
-- -----------------------------------------------------------------------------

create or replace function public.marcar_senha_trocada()
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set precisa_trocar_senha = false,
         atualizado_em = now()
   where id = auth.uid();
$$;

revoke all on function public.marcar_senha_trocada() from public;
grant execute on function public.marcar_senha_trocada() to authenticated;

comment on function public.marcar_senha_trocada() is
  'Chamada pelo app depois que o aluno troca a senha provisória; só mexe no próprio perfil.';
