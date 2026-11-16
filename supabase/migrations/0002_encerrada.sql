-- -----------------------------------------------------------------------------
-- Avaliação encerrada: o aluno continua vendo a avaliação e a própria devolutiva,
-- mas não abre uma entrega nova. Reabrir é só voltar o status para 'publicada'.
--
-- Sem isso, "encerrada" sumia da lista do aluno (a policy só liberava
-- 'publicada') — e o aluno perdia o acesso à correção já lançada.
-- -----------------------------------------------------------------------------

drop policy if exists avaliacoes_leitura on public.avaliacoes;
create policy avaliacoes_leitura on public.avaliacoes for select to authenticated
  using (
    public.eh_professor()
    or (status in ('publicada', 'encerrada') and turma_id = public.minha_turma())
  );

-- Entrega nova só em avaliação publicada. Quem já tinha rascunho ou devolutiva
-- continua podendo concluir/reformular (a policy de update não muda).
drop policy if exists submissoes_aluno_insere on public.submissoes;
create policy submissoes_aluno_insere on public.submissoes for insert to authenticated
  with check (
    aluno_id = auth.uid()
    and exists (
      select 1 from public.avaliacoes a
       where a.id = avaliacao_id and a.status = 'publicada'
    )
  );
