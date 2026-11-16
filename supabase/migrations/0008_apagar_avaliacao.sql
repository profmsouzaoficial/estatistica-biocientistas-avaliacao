-- 0008_apagar_avaliacao.sql
-- Uma avaliação criada errado (título, peso, rubrica) ficava para sempre: não havia
-- como apagar, e a exclusão da turma leva junto as outras avaliações. A função
-- abaixo remove UMA avaliação, com duas travas:
--
--   · se alguma redação já foi enviada, não apaga — o aluno perderia a entrega;
--   · se alguma nota já foi ao SIGA, não apaga — o histórico do lançamento some.
--
-- Professor que quer recomeçar uma avaliação com entregas deve antes encerrar as
-- entregas e criar outra; o que sobra aqui é o caso comum: rascunho ou avaliação
-- publicada que ninguém respondeu.

create or replace function public.apagar_avaliacao(p_avaliacao uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_titulo text;
  v_submissoes int;
  v_lancadas int;
begin
  if not public.eh_professor() then
    return jsonb_build_object('ok', false, 'motivo', 'sem_permissao');
  end if;

  select titulo into v_titulo from public.avaliacoes where id = p_avaliacao;
  if v_titulo is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_encontrada');
  end if;

  select count(*) into v_submissoes from public.submissoes where avaliacao_id = p_avaliacao;
  select count(*) into v_lancadas
    from public.lancamentos_siga l
    join public.submissoes s on s.id = l.submissao_id
   where s.avaliacao_id = p_avaliacao and l.sucesso;

  if v_lancadas > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'tem_lancamentos', 'lancadas', v_lancadas);
  end if;
  if v_submissoes > 0 then
    return jsonb_build_object('ok', false, 'motivo', 'tem_submissoes', 'submissoes', v_submissoes);
  end if;

  delete from public.avaliacoes where id = p_avaliacao;
  return jsonb_build_object('ok', true, 'titulo', v_titulo);
end $$;

revoke all on function public.apagar_avaliacao(uuid) from public, anon;
grant execute on function public.apagar_avaliacao(uuid) to authenticated;
