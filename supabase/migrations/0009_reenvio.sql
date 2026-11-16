-- Reenvio depois de devolução.
--
-- Quando o professor devolve uma redação ("reenvie com a segunda folha"), a
-- submissão volta com status 'devolvida' e a correção fica 'rejeitada'. O aluno
-- reenvia: a submissão vira 'enviada', mas a correção continuava 'rejeitada'.
-- Efeito na tela do professor: a redação reenviada não entrava em "a revisar"
-- (decisão não era 'pendente') nem em "corrigir" (já existia correção) e, pior,
-- caía em "Lançar no SIGA" — o servidor recusava com 409 NAO_APROVADA, mas o
-- botão aparecia com uma redação que ninguém aprovou.
--
-- A correção volta para 'pendente' e o professor revisa a versão nova. Os
-- critérios da rodada anterior continuam ali como ponto de partida.

create or replace function public.ao_reenviar_redacao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'enviada' and old.status = 'devolvida' then
    update public.correcoes
       set decisao = 'pendente',
           revisado_por = null,
           revisado_em = null
     where submissao_id = new.id
       and decisao = 'rejeitada';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reenvio_redacao on public.submissoes;
create trigger trg_reenvio_redacao
  after update on public.submissoes
  for each row execute function public.ao_reenviar_redacao();
