-- tasks that came in from a recording are marked "new" until their list is opened
alter table public.tasks add column if not exists fresh boolean not null default false;
