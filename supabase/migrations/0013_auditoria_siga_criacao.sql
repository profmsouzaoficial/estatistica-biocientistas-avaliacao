-- Índice para a checagem de idempotência do "Criar no SIGA".
--
-- A rota api/siga/avaliacao.ts pergunta "o que já aconteceu para esta avaliação?"
-- antes de criar estrutura no SIGA (que não tem rota de exclusão). Sem índice, a
-- consulta varre a auditoria inteira a cada clique.
create index if not exists auditoria_acao_entidade_idx
  on public.auditoria (acao, entidade_id, criado_em desc);
