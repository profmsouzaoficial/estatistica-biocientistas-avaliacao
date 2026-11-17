-- -----------------------------------------------------------------------------
-- Disciplina e horário da turma
--
-- Motivo: o professor dá a mesma disciplina em turmas diferentes (A e B) e
-- outras disciplinas no mesmo semestre. O dropdown precisa mostrar mais do que
-- o código do SIGA para ninguém escolher a turma errada.
-- -----------------------------------------------------------------------------

alter table public.turmas
  add column if not exists disciplina text;

alter table public.turmas
  add column if not exists horario text;

-- Turmas antigas continuam com o nome como disciplina.
update public.turmas set disciplina = nome where coalesce(trim(disciplina), '') = '';
