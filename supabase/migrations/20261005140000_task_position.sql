-- Manual order of tasks inside a list (smaller comes first; null = by creation time, newest first).
alter table public.tasks add column if not exists position double precision;
