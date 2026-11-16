-- 0007 — guarda a escala usada no lançamento.
--
-- O SIGA não documenta se a nota vai de 0 a 10 ou de 0 até o peso da avaliação
-- (ver SIGA_ESCALA em api/_lib/siga.ts). Como essa escolha muda o número que
-- fica gravado no SIGA, cada lançamento registra qual escala foi usada — sem
-- isso, meses depois não dá para saber se um "7" era 7/10 ou 7/20.

alter table public.lancamentos_siga
  add column if not exists escala text
  check (escala is null or escala in ('nota10', 'pontos'));

comment on column public.lancamentos_siga.escala is
  'Escala usada no envio: nota10 (0 a 10) ou pontos (0 até o valor da avaliação). Nulo nos lançamentos anteriores a esta configuração.';
