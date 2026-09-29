-- הגיגית — schema, security rules, sharing, images
-- Every table is protected by row level security: a user only ever sees
-- lists they are a member of, and the tasks inside them.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  name          text,
  email         text,
  created_at    timestamptz not null default now()
);

-- the personal token the iPhone Shortcut uses; readable only by its owner
create table if not exists public.capture_tokens (
  user_id    uuid primary key references auth.users on delete cascade,
  token      text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- lists
create table if not exists public.lists (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  color      int  not null default 0,
  kind       text not null default 'list' check (kind in ('list', 'inbox')),
  created_at timestamptz not null default now()
);

-- membership is also where each person keeps their own order / pin for a list
create table if not exists public.list_members (
  list_id    uuid not null references public.lists on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  position   int,
  pinned     boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (list_id, user_id)
);
create index if not exists list_members_user_idx on public.list_members (user_id);

-- ---------------------------------------------------------------- tasks
create table if not exists public.tasks (
  id         uuid primary key default gen_random_uuid(),
  list_id    uuid not null references public.lists on delete cascade,
  text       text not null,
  note       text not null default '',
  note_at    timestamptz,
  done       boolean not null default false,
  done_at    timestamptz,
  pinned     boolean not null default false,
  labels     text[] not null default '{}',   -- label names, so shared lists work across people
  images     text[] not null default '{}',   -- storage paths in the "images" bucket
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz                      -- recycle bin
);
create index if not exists tasks_list_idx on public.tasks (list_id);

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at := now(); return new; end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- labels (per person)
create table if not exists public.labels (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users on delete cascade,
  name       text not null,
  emoji      text not null default '',
  h          int  not null default 200,
  s          int  not null default 30,
  ord        int  not null default 0,
  pin        boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

-- ---------------------------------------------------------------- invites (share link)
create table if not exists public.invites (
  token      text primary key default encode(gen_random_bytes(12), 'hex'),
  list_id    uuid not null references public.lists on delete cascade,
  created_by uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_member(l uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from list_members where list_id = l and user_id = auth.uid());
$$;

create or replace function public.shares_a_list_with(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from list_members a join list_members b on a.list_id = b.list_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

create or replace function public.can_access_task(tid text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks t where t.id::text = tid and is_member(t.list_id));
$$;

-- the creator of a list becomes its owner-member
create or replace function public.add_owner_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into list_members (list_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists lists_owner_member on public.lists;
create trigger lists_owner_member after insert on public.lists
  for each row execute function public.add_owner_membership();

-- new account: profile + the default labels
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, email, name)
  values (new.id, new.email, split_part(new.email, '@', 1))
  on conflict (id) do nothing;
  insert into capture_tokens (user_id) values (new.id) on conflict do nothing;
  insert into labels (owner_id, name, emoji, h, s, ord, pin) values
    (new.id, 'דחוף',  '🔥', 6,   62, 0, true),
    (new.id, 'חשוב',  '⭐', 44,  70, 1, false),
    (new.id, 'השבוע', '📅', 208, 48, 2, false),
    (new.id, 'מחכה',  '⏳', 268, 34, 3, false),
    (new.id, 'שיחה',  '📞', 152, 40, 4, false)
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- sharing RPCs
create or replace function public.accept_invite(t text) returns uuid
language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select list_id into l from invites where token = t;
  if l is null then raise exception 'invite not found'; end if;
  insert into list_members (list_id, user_id, role) values (l, auth.uid(), 'member')
  on conflict do nothing;
  return l;
end $$;

-- returns 'added' | 'already' | 'not_found'
create or replace function public.add_member_by_email(l uuid, e text) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if not is_member(l) then raise exception 'not a member'; end if;
  select id into u from profiles where lower(email) = lower(trim(e));
  if u is null then return 'not_found'; end if;
  if exists (select 1 from list_members where list_id = l and user_id = u) then return 'already'; end if;
  insert into list_members (list_id, user_id, role) values (l, u, 'member');
  return 'added';
end $$;

create or replace function public.list_people(l uuid)
returns table (user_id uuid, name text, email text, role text)
language sql stable security definer set search_path = public as $$
  select m.user_id, p.name, p.email, m.role
  from list_members m join profiles p on p.id = m.user_id
  where m.list_id = l and is_member(l)
  order by m.role desc, m.created_at;
$$;

-- a member can leave; the owner can remove anyone except themself
create or replace function public.remove_member(l uuid, u uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if u = auth.uid() then
    if exists (select 1 from lists where id = l and owner_id = u) then
      raise exception 'owner cannot leave; delete the list instead';
    end if;
    delete from list_members where list_id = l and user_id = u;
  elsif exists (select 1 from lists where id = l and owner_id = auth.uid()) then
    delete from list_members where list_id = l and user_id = u;
  else
    raise exception 'not allowed';
  end if;
end $$;

grant execute on function public.accept_invite(text), public.add_member_by_email(uuid, text),
  public.list_people(uuid), public.remove_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------- row level security
alter table public.profiles     enable row level security;
alter table public.lists        enable row level security;
alter table public.list_members enable row level security;
alter table public.tasks        enable row level security;
alter table public.labels       enable row level security;
alter table public.invites      enable row level security;
alter table public.capture_tokens enable row level security;

drop policy if exists "token own" on public.capture_tokens;
create policy "token own" on public.capture_tokens for select to authenticated using (user_id = auth.uid());

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_a_list_with(id));
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "lists read" on public.lists;
create policy "lists read" on public.lists for select to authenticated using (public.is_member(id));
drop policy if exists "lists create" on public.lists;
create policy "lists create" on public.lists for insert to authenticated with check (owner_id = auth.uid());
drop policy if exists "lists update" on public.lists;
create policy "lists update" on public.lists for update to authenticated
  using (public.is_member(id)) with check (public.is_member(id));
drop policy if exists "lists delete" on public.lists;
create policy "lists delete" on public.lists for delete to authenticated using (owner_id = auth.uid());

drop policy if exists "members read" on public.list_members;
create policy "members read" on public.list_members for select to authenticated using (public.is_member(list_id));
drop policy if exists "members update own" on public.list_members;
create policy "members update own" on public.list_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "tasks all" on public.tasks;
create policy "tasks all" on public.tasks for all to authenticated
  using (public.is_member(list_id)) with check (public.is_member(list_id));

drop policy if exists "labels own" on public.labels;
create policy "labels own" on public.labels for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "invites create" on public.invites;
create policy "invites create" on public.invites for insert to authenticated
  with check (created_by = auth.uid() and public.is_member(list_id));
drop policy if exists "invites read own" on public.invites;
create policy "invites read own" on public.invites for select to authenticated using (created_by = auth.uid());

-- ---------------------------------------------------------------- live updates
do $$ begin
  begin alter publication supabase_realtime add table public.tasks;        exception when others then null; end;
  begin alter publication supabase_realtime add table public.lists;        exception when others then null; end;
  begin alter publication supabase_realtime add table public.list_members; exception when others then null; end;
  begin alter publication supabase_realtime add table public.labels;       exception when others then null; end;
end $$;

-- ---------------------------------------------------------------- images in notes
insert into storage.buckets (id, name, public) values ('images', 'images', false)
on conflict (id) do nothing;

drop policy if exists "note images read" on storage.objects;
create policy "note images read" on storage.objects for select to authenticated
  using (bucket_id = 'images' and public.can_access_task((storage.foldername(name))[1]));
drop policy if exists "note images add" on storage.objects;
create policy "note images add" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and public.can_access_task((storage.foldername(name))[1]));
drop policy if exists "note images remove" on storage.objects;
create policy "note images remove" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and public.can_access_task((storage.foldername(name))[1]));
