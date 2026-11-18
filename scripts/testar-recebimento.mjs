#!/usr/bin/env node
/**
 * Teste do recebimento (migration 0019).
 *
 *   pnpm test:recebimento
 *
 * A regra que o professor pediu: a data é só referência; quem manda é o status.
 * O teste roda numa transação com ROLLBACK e prova três coisas:
 *
 *   1. avaliação encerrada recusa até o rascunho que já existia;
 *   2. avaliação publicada aceita entrega mesmo com a data no passado;
 *   3. reabrir (voltar para publicada) libera a entrega de novo.
 *
 * Nada fica no banco de produção.
 */
import { carregarEnv, exigir, refDoProjeto } from './_env.mjs'

carregarEnv()

const ref = refDoProjeto()
const token = exigir('SUPABASE_ACCESS_TOKEN')

const TURMA = '00000000-0000-4000-8000-0000000009f1'
const ALUNO = '00000000-0000-4000-8000-0000000009f2'
const AV_ENCERRADA = '00000000-0000-4000-8000-0000000009f3'
const AV_REFERENCIA = '00000000-0000-4000-8000-0000000009f4'
const SUB_ENCERRADA = '00000000-0000-4000-8000-0000000009f5'
const SUB_REFERENCIA = '00000000-0000-4000-8000-0000000009f6'

const sql = /* sql */ `
begin;

insert into public.turmas (id, nome, codigo_siga, periodo, curso)
values ('${TURMA}', 'TESTE RECEBIMENTO', 'TESTERECEB-A', '2099/1', 'Ciências Biológicas');

insert into public.alunos_esperados (turma_id, matricula, nome_completo, email)
values ('${TURMA}', '2099000010GV', 'Aluno Recebimento', 'recebimento@example.com');

insert into auth.users (id, email, raw_user_meta_data)
values (
  '${ALUNO}',
  'recebimento@example.com',
  '{"matricula":"2099000010GV","turma_id":"${TURMA}","nome_completo":"Aluno Recebimento"}'::jsonb
);

insert into public.avaliacoes
  (id, turma_id, titulo, tema, instrucoes, valor_total, rubrica, status, prazo_em)
values
  ('${AV_ENCERRADA}', '${TURMA}', 'Teste encerrada', 'Tema', 'Instruções', 10,
   '[{"id":"c1","nome":"Critério","descricao":"d","valor":10}]'::jsonb, 'encerrada', null),
  ('${AV_REFERENCIA}', '${TURMA}', 'Teste referência passada', 'Tema', 'Instruções', 10,
   '[{"id":"c1","nome":"Critério","descricao":"d","valor":10}]'::jsonb, 'publicada', '2020-01-10T23:59:00Z');

insert into public.submissoes (id, avaliacao_id, aluno_id, status) values
  ('${SUB_ENCERRADA}', '${AV_ENCERRADA}', '${ALUNO}', 'rascunho'),
  ('${SUB_REFERENCIA}', '${AV_REFERENCIA}', '${ALUNO}', 'rascunho');

-- 1. encerrada: nem o rascunho existente pode virar 'enviada' ---------------
do $$
begin
  begin
    update public.submissoes set status = 'enviada'
     where id = '${SUB_ENCERRADA}';
    raise exception 'O gatilho aceitou enviar com a avaliação encerrada.';
  exception when sqlstate 'P0001' then
    if sqlerrm not like '%encerradas%' then
      raise;
    end if;
  end;
end $$;

do $$
begin
  if exists (select 1 from public.submissoes
              where id = '${SUB_ENCERRADA}' and status = 'enviada') then
    raise exception 'A submissão ficou enviada apesar do recebimento encerrado.';
  end if;
end $$;

-- 2. data no passado não bloqueia: publicada continua recebendo -------------
update public.submissoes set status = 'enviada'
 where id = '${SUB_REFERENCIA}';

do $$
begin
  if not exists (select 1 from public.submissoes
                  where id = '${SUB_REFERENCIA}' and status = 'enviada') then
    raise exception 'A data de referência no passado bloqueou uma avaliação publicada.';
  end if;
end $$;

-- 3. reabrir a avaliação encerrada libera o rascunho que ficou parado -------
update public.avaliacoes set status = 'publicada'
 where id = '${AV_ENCERRADA}';

update public.submissoes set status = 'enviada'
 where id = '${SUB_ENCERRADA}';

do $$
begin
  if not exists (select 1 from public.submissoes
                  where id = '${SUB_ENCERRADA}' and status = 'enviada') then
    raise exception 'Reabrir o recebimento não liberou a entrega que estava presa.';
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
  if (!r.ok) throw new Error(`${r.status}: ${corpo.slice(0, 600)}`)
  return corpo
}

console.log('\n  Recebimento de entregas\n')
try {
  await consultar(sql)
  console.log('  ✓ avaliação encerrada recusa até rascunho já existente')
  console.log('  ✓ data de referência no passado não bloqueia avaliação publicada')
  console.log('  ✓ reabrir o recebimento libera a entrega de novo')
  console.log('\n  ✓ Regra de recebimento verificada (transação revertida — nada ficou no banco)\n')
} catch (e) {
  console.error(`\n  ✗ ${e.message}\n`)
  process.exit(1)
}
