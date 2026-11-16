-- O prazo não pode ser anterior à abertura **no momento da criação**.
--
-- As telas sempre gravaram `abre_em = agora` e o campo de prazo aceita qualquer
-- data: um prazo no passado criava uma avaliação que nasce fechada — o aluno
-- via "Prazo encerrado" em algo que o professor acabou de publicar. A validação
-- do formulário agora recusa, mas o banco é a última linha: um script, o SQL
-- editor ou uma chamada direta à API não passam por tela nenhuma.
--
-- Só no INSERT, de propósito. A mesma comparação no UPDATE proibiria um uso
-- legítimo: o professor registra a avaliação depois da data real de entrega e
-- muda o prazo para o passado para marcar como atrasadas as redações que
-- chegaram fora do prazo (é o que o passo 24 do teste de fumaça faz). Nesse
-- caso o efeito é avisado na tela antes de gravar, não bloqueado.
--
-- Um CHECK não serve porque vale para a linha inteira, em qualquer gravação.
create or replace function public.checa_prazo_de_criacao()
returns trigger language plpgsql as $$
begin
  if new.prazo_em is not null and new.abre_em is not null and new.prazo_em < new.abre_em then
    raise exception 'O prazo de entrega não pode ser anterior à abertura da avaliação.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_avaliacao_prazo on public.avaliacoes;
create trigger trg_avaliacao_prazo
  before insert on public.avaliacoes
  for each row execute function public.checa_prazo_de_criacao();

-- A constraint da primeira versão desta migration nunca foi usada em produção
-- (a tabela estava vazia) e impedia o caso legítimo do UPDATE: sai de cena.
alter table public.avaliacoes
  drop constraint if exists avaliacoes_prazo_depois_da_abertura;
