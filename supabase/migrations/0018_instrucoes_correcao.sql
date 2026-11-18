-- Instruções adicionais de correção para a LLM.
--
-- O campo é opcional e complementa o prompt fixo do sistema (formato JSON,
-- fidelidade ao texto e faixas de nota). Fica separado de `instrucoes`, que é
-- o texto pedagógico mostrado ao aluno. Não é exibido ao estudante na tela de
-- envio; é usado pelo servidor em /api/corrigir.

alter table public.avaliacoes
  add column if not exists instrucoes_correcao text;

comment on column public.avaliacoes.instrucoes_correcao is
  'Orientações do professor que entram no prompt do sistema da correção automática.';
