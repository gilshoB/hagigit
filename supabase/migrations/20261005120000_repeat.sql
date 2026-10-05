-- Repeating tasks: a done task opens again on its next date.
-- repeat: how often; repeat_on: weekday 0-6 (weekly) or day of month 1-31 (monthly); repeat_next: the date it opens again.
alter table public.tasks
  add column if not exists repeat text check (repeat in ('daily','weekly','monthly')),
  add column if not exists repeat_on smallint,
  add column if not exists repeat_next date;
