-- ZENKICKS: community chat room (text + photos, report, block). Run once in Supabase > SQL Editor.
-- Messages are only reachable through the functions below (no direct table access).

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 500),
  image_path text,
  created_at timestamptz not null default now(),
  removed boolean not null default false,
  check (char_length(btrim(body)) > 0 or image_path is not null)
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at desc);
alter table public.chat_messages enable row level security;
revoke all on public.chat_messages from anon, authenticated;

create table if not exists public.chat_blocks (
  blocker uuid not null references public.profiles(id) on delete cascade,
  blocked uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked)
);
alter table public.chat_blocks enable row level security;
revoke all on public.chat_blocks from anon, authenticated;

-- reports can point at a chat message
alter table public.reports drop constraint if exists reports_target_type_check;
alter table public.reports add constraint reports_target_type_check
  check (target_type in ('listing','check','comment','user','chat'));

-- photos: public bucket, members upload only into their own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', true, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "chat photos public read" on storage.objects;
create policy "chat photos public read" on storage.objects for select using (bucket_id = 'chat-photos');
drop policy if exists "chat photos upload own folder" on storage.objects;
create policy "chat photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-photos' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned());
drop policy if exists "chat photos delete own folder" on storage.objects;
create policy "chat photos delete own folder" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- read: newest first (people you blocked are left out)
create or replace function public.chat_feed(p_before timestamptz default null, p_limit int default 40)
returns table (id uuid, user_id uuid, username text, is_admin boolean, is_checker boolean, body text, image_path text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, p.username, (p.is_admin or p.is_owner), p.is_checker, m.body, m.image_path, m.created_at
  from chat_messages m join profiles p on p.id = m.user_id
  where not m.removed
    and (p_before is null or m.created_at < p_before)
    and not exists (select 1 from chat_blocks b where b.blocker = auth.uid() and b.blocked = m.user_id)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$$;

-- read: anything newer (the app asks every few seconds)
create or replace function public.chat_since(p_after timestamptz)
returns table (id uuid, user_id uuid, username text, is_admin boolean, is_checker boolean, body text, image_path text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, p.username, (p.is_admin or p.is_owner), p.is_checker, m.body, m.image_path, m.created_at
  from chat_messages m join profiles p on p.id = m.user_id
  where not m.removed and m.created_at >= p_after
    and not exists (select 1 from chat_blocks b where b.blocker = auth.uid() and b.blocked = m.user_id)
  order by m.created_at asc
  limit 100
$$;

-- write: signed in, not banned, no links (staff excepted), simple flood limits
create or replace function public.chat_post(p_body text, p_image text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare b text := btrim(coalesce(p_body, '')); new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to chat'; end if;
  if public.is_banned() then raise exception 'Your account is on hold'; end if;
  if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'Finish setting up your profile first'; end if;
  if char_length(b) = 0 and p_image is null then raise exception 'Write something first'; end if;
  if char_length(b) > 500 then raise exception 'Keep it under 500 characters'; end if;
  if p_image is not null and p_image not like auth.uid()::text || '/%' then raise exception 'Bad photo'; end if;
  if not public.is_staff() and b ~* '(https?:|www\.|[a-z0-9]\.(com|net|org|ae|io|me|co|ly|gl|xyz|app|shop|store|link|to)([^a-z]|$))' then
    raise exception 'No links in chat. Share the pair, not a link.';
  end if;
  if (select count(*) from chat_messages where user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 3
     or (select count(*) from chat_messages where user_id = auth.uid() and created_at > now() - interval '1 minute') >= 12 then
    raise exception 'Slow down a little';
  end if;
  if exists (select 1 from chat_messages where user_id = auth.uid() and body = b and char_length(b) > 0 and created_at > now() - interval '1 minute') then
    raise exception 'You just sent that';
  end if;
  insert into chat_messages (user_id, body, image_path) values (auth.uid(), b, p_image) returning id into new_id;
  return new_id;
end $$;

-- remove: your own message, or any message if you are an admin (kept in the table, hidden)
create or replace function public.chat_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  update chat_messages set removed = true where id = p_id and (user_id = auth.uid() or public.is_admin());
end $$;

-- block / unblock someone (only changes what you see)
create or replace function public.chat_block(p_target uuid, p_on boolean default true) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_target = auth.uid() then raise exception 'You cannot block yourself'; end if;
  if p_on then insert into chat_blocks (blocker, blocked) values (auth.uid(), p_target) on conflict do nothing;
  else delete from chat_blocks where blocker = auth.uid() and blocked = p_target; end if;
end $$;

create or replace function public.chat_block_list()
returns table (user_id uuid, username text)
language sql stable security definer set search_path = public as $$
  select b.blocked, p.username from chat_blocks b join profiles p on p.id = b.blocked
  where b.blocker = auth.uid() order by b.created_at desc
$$;

revoke all on function public.chat_feed(timestamptz, int), public.chat_since(timestamptz) from public;
grant execute on function public.chat_feed(timestamptz, int), public.chat_since(timestamptz) to anon, authenticated;
revoke all on function public.chat_post(text, text), public.chat_remove(uuid), public.chat_block(uuid, boolean), public.chat_block_list() from public, anon;
grant execute on function public.chat_post(text, text), public.chat_remove(uuid), public.chat_block(uuid, boolean), public.chat_block_list() to authenticated;
