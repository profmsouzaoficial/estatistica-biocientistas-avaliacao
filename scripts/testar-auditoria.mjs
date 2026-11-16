#!/usr/bin/env node
/**
 * Teste da trilha de auditoria (migration 0010).
 *
 *   pnpm test:auditoria
 *
 * A auditoria nasceu quebrada: os três pontos do app mandavam a coluna
 * `ator_id`, que não existe (`ator`), e o erro era engolido por um catch vazio —
 * a tabela ficou com zero linhas durante todas as rodadas de teste. Além de
 * corrigir os três pontos, revisão, devolução, prazo e estado da avaliação
 * passaram a ser auditados por gatilho, independente da tela.
 *
 * Roda dentro de uma transação que termina em ROLLBACK: nada fica no banco.
 */
import { carregarEnv, exigir, refDoProjeto } from './_env.mjs'

carregarEnv()

const ref = refDoProjeto()
const token = exigir('SUPABASE_ACCESS_TOKEN')

const TURMA = '00000000-0000-4000-8000-000000000aa1'
const ALUNO = '00000000-0000-4000-8000-000000000ad1'
const AVALIACAO = '00000000-0000-4000-8000-000000000aa3'
const SUBMISSAO = '00000000-0000-4000-8000-000000000ab1'
const CORRECAO = '00000000-0000-4000-8000-000000000ac1'

const sql = /* sql */ `
begin;

insert into public.turmas (id, nome, codigo_siga, periodo, curso)
values ('${TURMA}', 'TESTE AUDITORIA', 'TESTEAUD-A', '2099/1', 'Ciências Biológicas');

insert into public.alunos_esperados (turma_id, matricula, nome_completo, email)
values ('${TURMA}', '2099000101GV', 'Aluno Auditoria', 'auditoria.teste@example.com');

insert into auth.users (id, email, raw_user_meta_data)
values ('${ALUNO}', 'auditoria.teste@example.com',
        '{"matricula":"2099000101GV","turma_id":"${TURMA}","nome_completo":"Aluno Auditoria"}'::jsonb);

insert into public.avaliacoes (id, turma_id, titulo, tema, instrucoes, valor_total, rubrica, status)
values ('${AVALIACAO}', '${TURMA}', 'Teste auditoria', 'Tema', 'Instruções', 10,
        '[{"id":"c1","nome":"Critério","descricao":"d","valor":10}]'::jsonb, 'publicada');

insert into public.submissoes (id, avaliacao_id, aluno_id, status)
values ('${SUBMISSAO}', '${AVALIACAO}', '${ALUNO}', 'enviada');

insert into public.correcoes (id, submissao_id, criterios, nota_bruta, nota_final,
                              pontos_fortes, pontos_desenvolver, decisao)
values ('${CORRECAO}', '${SUBMISSAO}', '[{"id":"c1","nome":"Critério","valor":7,"justificativa":"x"}]'::jsonb,
        7, 7, '{}', '{}', 'pendente');

-- 1. aprovação -----------------------------------------------------------
update public.correcoes set decisao = 'aprovada' where id = '${CORRECAO}';
do $$
declare n int; d jsonb;
begin
  select count(*) into n from public.auditoria
   where acao = 'revisar_correcao' and entidade_id = '${CORRECAO}';
  if n <> 1 then raise exception 'aprovação: esperava 1 registro, achei %', n; end if;
  select detalhe into d from public.auditoria
   where acao = 'revisar_correcao' and entidade_id = '${CORRECAO}' order by id desc limit 1;
  if d->>'de' <> 'pendente' or d->>'para' <> 'aprovada' then
    raise exception 'aprovação: detalhe ficou %', d;
  end if;
end $$;

-- 2. devolução -----------------------------------------------------------
update public.correcoes set decisao = 'rejeitada' where id = '${CORRECAO}';
do $$
declare n int;
begin
  select count(*) into n from public.auditoria
   where acao = 'revisar_correcao' and entidade_id = '${CORRECAO}';
  if n <> 2 then raise exception 'devolução: esperava 2 registros, achei %', n; end if;
end $$;

-- 3. mudança de prazo ----------------------------------------------------
update public.avaliacoes set prazo_em = '2026-12-01T23:59:00-03:00' where id = '${AVALIACAO}';
do $$
declare d jsonb;
begin
  select detalhe into d from public.auditoria
   where acao = 'mudar_prazo' and entidade_id = '${AVALIACAO}' order by id desc limit 1;
  if d is null then raise exception 'prazo: nenhum registro de auditoria'; end if;
  if d->>'de' is not null then raise exception 'prazo: "de" deveria ser nulo, veio %', d->>'de'; end if;
  if d->>'para' is null then raise exception 'prazo: "para" vazio'; end if;
end $$;

-- 4. encerrar entregas ---------------------------------------------------
update public.avaliacoes set status = 'encerrada' where id = '${AVALIACAO}';
do $$
declare d jsonb;
begin
  select detalhe into d from public.auditoria
   where acao = 'mudar_status_avaliacao' and entidade_id = '${AVALIACAO}' order by id desc limit 1;
  if d is null then raise exception 'status: nenhum registro de auditoria'; end if;
  if d->>'para' <> 'encerrada' then raise exception 'status: detalhe ficou %', d; end if;
end $$;

-- 5. update sem mudança não gera ruído -----------------------------------
do $$
declare antes int; depois int;
begin
  select count(*) into antes from public.auditoria;
  update public.avaliacoes set titulo = 'Outro título' where id = '${AVALIACAO}';
  update public.correcoes set nota_bruta = 7 where id = '${CORRECAO}';
  select count(*) into depois from public.auditoria;
  if depois <> antes then
    raise exception 'ruído: update sem mudança de decisão/prazo/status gerou % registro(s)', depois - antes;
  end if;
end $$;

rollback;
`

async function consultar(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const corpo = await r.text()
  if (!r.ok) throw new Error(`${r.status}: ${corpo.slice(0, 400)}`)
  return corpo
}

console.log('\n  Trilha de auditoria\n')
try {
  await consultar(sql)
  console.log('  ✓ aprovação e devolução registram de/para')
  console.log('  ✓ mudança de prazo registra a data anterior e a nova')
  console.log('  ✓ encerrar entregas registra a mudança de estado')
  console.log('  ✓ update que não muda decisão/prazo/status não gera ruído')
  console.log('\n  ✓ Auditoria verificada (transação revertida — nada ficou no banco)\n')
} catch (e) {
  console.error(`\n  ✗ ${e.message}\n`)
  process.exit(1)
}
