-- One row per sorted item: who decided where it went, and how sure each step was.
-- Lets us see why something landed in the wrong list.
create table if not exists public.sort_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  source       text not null check (source in ('app', 'shortcut')),
  text         text not null,
  task_id      uuid,
  list_id      uuid,
  decided_by   text not null check (decided_by in ('direct', 'quick', 'strong', 'local', 'asked')),
  confidence   real,
  quick_list   uuid,
  quick_conf   real,
  strong_list  uuid,
  strong_conf  real,
  local_list   uuid,
  local_conf   real,
  error        text
);
create index if not exists sort_log_user_time on public.sort_log (user_id, created_at desc);

alter table public.sort_log enable row level security;
drop policy if exists "own sort log read" on public.sort_log;
create policy "own sort log read" on public.sort_log for select to authenticated using (user_id = auth.uid());
drop policy if exists "own sort log write" on public.sort_log;
create policy "own sort log write" on public.sort_log for insert to authenticated with check (user_id = auth.uid());

-- new tables need explicit grants (Supabase, since 2026-10-30); no access for signed-out visitors
grant select, insert on public.sort_log to authenticated;
grant select, insert, update, delete on public.sort_log to service_role;
