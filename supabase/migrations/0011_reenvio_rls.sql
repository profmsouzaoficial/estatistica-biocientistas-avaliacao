-- Reenvio de redação devolvida: o aluno precisa poder gravar nela.
--
-- A política de UPDATE do aluno exigia que a linha NOVA tivesse status
-- 'rascunho' ou 'enviada'. Só que quem reescreve está justamente com status
-- 'devolvida': ao salvar a foto, a transcrição ou o próprio envio, o status
-- continuava 'devolvida' e o `with check` recusava com
-- "new row violates row-level security policy for table submissoes".
--
-- Na prática, o botão "Devolver para o aluno reescrever" era um beco sem saída:
-- o aluno via o aviso, abria a redação e não conseguia nem trocar a foto nem
-- enviar de novo. O gatilho de reenvio (0009) estava certo; faltava a porta.

drop policy if exists submissoes_aluno_atualiza on public.submissoes;
create policy submissoes_aluno_atualiza on public.submissoes for update to authenticated
  -- só se mexe na própria redação enquanto ela está em rascunho ou devolvida
  using (aluno_id = auth.uid() and status in ('rascunho', 'devolvida'))
  -- e ela só pode ficar em rascunho, devolvida (enquanto reescreve) ou enviada
  with check (aluno_id = auth.uid() and status in ('rascunho', 'devolvida', 'enviada'));
