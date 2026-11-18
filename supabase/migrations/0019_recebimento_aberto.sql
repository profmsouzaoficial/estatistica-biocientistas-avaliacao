-- O que libera e o que bloqueia uma entrega.
--
-- Até aqui, a política de INSERT do aluno já exigia a avaliação em
-- `publicada`; o resto da tela, porém, tratava a data (`prazo_em`) como se ela
-- fechasse o envio. Isso criava duas verdades: o professor via "recebendo
-- entregas" e o aluno via "Prazo encerrado" só porque a data tinha passado.
--
-- A regra passa a ser uma só: **a data é referência para marcar atraso; quem
-- decide se aceita entrega é o status**. `publicada` recebe; `encerrada` não.
--
-- A política de INSERT já barra entrega nova em avaliação encerrada. Faltava o
-- caminho de quem deixou um rascunho ou uma redação devolvida: o UPDATE para
-- `enviada` passava mesmo com a avaliação encerrada. Este gatilho fecha essa
-- porta com uma mensagem que o aluno entende, em vez de um erro de RLS.

create or replace function public.checa_recebimento_aberto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  situacao text;
begin
  if new.status = 'enviada' then
    select a.status into situacao
      from public.avaliacoes a
     where a.id = new.avaliacao_id;

    if situacao is distinct from 'publicada' then
      raise exception using
        errcode = 'P0001',
        message = 'As entregas desta avaliação estão encerradas. Peça ao professor para reabrir o recebimento.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_submissao_recebimento on public.submissoes;
create trigger trg_submissao_recebimento
  before insert or update of status on public.submissoes
  for each row execute function public.checa_recebimento_aberto();

comment on function public.checa_recebimento_aberto() is
  'Recusa marcar submissão como enviada quando a avaliação não está em publicada. A data de referência não participa: ela só marca atraso.';
