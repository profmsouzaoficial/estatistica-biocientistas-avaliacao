#!/usr/bin/env node
/**
 * Teste do reenvio depois de devolução (migration 0009).
 *
 *   pnpm test:reenvio
 *
 * Cenário: o professor devolve a redação ("reenvie com a segunda folha"), o
 * aluno reenvia e a correção precisa voltar para 'pendente' — senão a redação
 * nova some da fila de revisão e, pior, aparece em "Lançar no SIGA" com uma
 * decisão que o professor nunca aprovou.
 *
 * Tudo roda dentro de uma transação que termina em ROLLBACK: nenhuma linha de
 * teste fica no banco de produção. Qualquer verificação que falhe interrompe o
 * script com o motivo, então um teste verde é prova de que o gatilho está
 * instalado e faz o que promete.
 */
import { carregarEnv, exigir, refDoProjeto } from './_env.mjs'

carregarEnv()

const ref = refDoProjeto()
const token = exigir('SUPABASE_ACCESS_TOKEN')

// Três alunos porque `submissoes` é única por (avaliação, aluno): cada cenário
// precisa do próprio par.
const ALUNOS = [
  { id: '00000000-0000-4000-8000-0000000009d1', matricula: '2099000001GV', email: 'reenvio.a@example.com' },
  { id: '00000000-0000-4000-8000-0000000009d2', matricula: '2099000002GV', email: 'reenvio.b@example.com' },
  { id: '00000000-0000-4000-8000-0000000009d3', matricula: '2099000003GV', email: 'reenvio.c@example.com' },
]
const TURMA = '00000000-0000-4000-8000-0000000009a1'
const AVALIACAO = '00000000-0000-4000-8000-0000000009a3'

const sql = /* sql */ `
begin;

insert into public.turmas (id, nome, codigo_siga, periodo, curso)
values ('${TURMA}', 'TESTE REENVIO', 'TESTEREEV-A', '2099/1', 'Ciências Biológicas');

insert into public.alunos_esperados (turma_id, matricula, nome_completo, email) values
  ${ALUNOS.map((a) => `('${TURMA}', '${a.matricula}', 'Aluno ${a.matricula}', '${a.email}')`).join(',\n  ')};

-- o gatilho de cadastro cria os perfis a partir dos metadados, como no app
insert into auth.users (id, email, raw_user_meta_data) values
  ${ALUNOS.map(
    (a) =>
      `('${a.id}', '${a.email}', '{"matricula":"${a.matricula}","turma_id":"${TURMA}","nome_completo":"Aluno ${a.matricula}"}'::jsonb)`,
  ).join(',\n  ')};

insert into public.avaliacoes (id, turma_id, titulo, tema, instrucoes, valor_total, rubrica, status)
values ('${AVALIACAO}', '${TURMA}', 'Teste reenvio', 'Tema', 'Instruções', 10,
        '[{"id":"c1","nome":"Critério","descricao":"d","valor":10}]'::jsonb, 'publicada');

-- A: devolvida (o caso do teste). B: enviada sem devolução. C: já aprovada.
insert into public.submissoes (id, avaliacao_id, aluno_id, status) values
  ('00000000-0000-4000-8000-0000000009b1', '${AVALIACAO}', '${ALUNOS[0].id}', 'devolvida'),
  ('00000000-0000-4000-8000-0000000009b2', '${AVALIACAO}', '${ALUNOS[1].id}', 'enviada'),
  ('00000000-0000-4000-8000-0000000009b3', '${AVALIACAO}', '${ALUNOS[2].id}', 'enviada');

insert into public.correcoes (id, submissao_id, criterios, nota_bruta, nota_final, pontos_fortes,
                              pontos_desenvolver, decisao, revisado_em) values
  ('00000000-0000-4000-8000-0000000009c1', '00000000-0000-4000-8000-0000000009b1',
   '[{"id":"c1","nome":"Critério","valor":5,"justificativa":"x"}]'::jsonb, 5, 5, '{}', '{}',
   'rejeitada', now()),
  ('00000000-0000-4000-8000-0000000009c2', '00000000-0000-4000-8000-0000000009b2',
   '[{"id":"c1","nome":"Critério","valor":5,"justificativa":"x"}]'::jsonb, 5, 5, '{}', '{}',
   'rejeitada', now()),
  ('00000000-0000-4000-8000-0000000009c3', '00000000-0000-4000-8000-0000000009b3',
   '[{"id":"c1","nome":"Critério","valor":5,"justificativa":"x"}]'::jsonb, 5, 5, '{}', '{}',
   'aprovada', now());

-- 1. o aluno reenvia a redação devolvida ---------------------------------
update public.submissoes set status = 'enviada'
 where id = '00000000-0000-4000-8000-0000000009b1';
do $$
declare r record;
begin
  select decisao, revisado_em, revisado_por into r
    from public.correcoes where id = '00000000-0000-4000-8000-0000000009c1';
  if r.decisao <> 'pendente' then
    raise exception 'reenvio: decisão ficou em %, esperava pendente', r.decisao;
  end if;
  if r.revisado_em is not null or r.revisado_por is not null then
    raise exception 'reenvio: revisão antiga ficou registrada (revisado_em=%)', r.revisado_em;
  end if;
end $$;

-- 2. enviar de novo (sem devolução) não mexe na correção -----------------
update public.submissoes set status = 'enviada'
 where id = '00000000-0000-4000-8000-0000000009b2';
do $$
declare d text;
begin
  select decisao into d from public.correcoes where id = '00000000-0000-4000-8000-0000000009c2';
  if d <> 'rejeitada' then
    raise exception 'sem devolução: decisão virou %, esperava continuar rejeitada', d;
  end if;
end $$;

-- 3. reenvio não desfaz aprovação já dada --------------------------------
update public.submissoes set status = 'devolvida'
 where id = '00000000-0000-4000-8000-0000000009b3';
update public.submissoes set status = 'enviada'
 where id = '00000000-0000-4000-8000-0000000009b3';
do $$
declare d text;
begin
  select decisao into d from public.correcoes where id = '00000000-0000-4000-8000-0000000009c3';
  if d <> 'aprovada' then
    raise exception 'aprovação: decisão virou %, esperava continuar aprovada', d;
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

console.log('\n  Reenvio depois de devolução\n')
try {
  await consultar(sql)
  console.log('  ✓ correção devolvida volta para pendente quando o aluno reenvia')
  console.log('  ✓ reenvio sem devolução não altera a correção')
  console.log('  ✓ aprovação já dada não é desfeita pelo reenvio')
  console.log('\n  ✓ Gatilho de reenvio verificado (transação revertida — nada ficou no banco)\n')
} catch (e) {
  console.error(`\n  ✗ ${e.message}\n`)
  process.exit(1)
}
