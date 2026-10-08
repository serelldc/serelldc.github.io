-- ZENKICKS: chat emoji reactions + replies (needs chat.sql, chat-push.sql, chat-unread.sql first)
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.chat_messages add column if not exists reply_to uuid references public.chat_messages(id) on delete set null;

create table if not exists public.chat_reactions (
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('🔥','❤️','😂','👍','😮','👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
alter table public.chat_reactions enable row level security;
revoke all on public.chat_reactions from anon, authenticated;

-- read: now also says which message each one replies to (people you blocked are left out)
drop function if exists public.chat_feed(timestamptz, int);
create function public.chat_feed(p_before timestamptz default null, p_limit int default 40)
returns table (id uuid, user_id uuid, username text, is_admin boolean, is_checker boolean, body text, image_path text, created_at timestamptz, reply_to uuid, reply_user text, reply_body text)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, p.username, (p.is_admin or p.is_owner), p.is_checker, m.body, m.image_path, m.created_at,
         m.reply_to, rp.username, case when rm.id is null then null else coalesce(nullif(left(rm.body, 80), ''), '[photo]') end
  from chat_messages m join profiles p on p.id = m.user_id
  left join chat_messages rm on rm.id = m.reply_to and not rm.removed
    and not exists (select 1 from chat_blocks bb where bb.blocker = auth.uid() and bb.blocked = rm.user_id)
  left join profiles rp on rp.id = rm.user_id
  where not m.removed
    and (p_before is null or m.created_at < p_before)
    and not exists (select 1 from chat_blocks b where b.blocker = auth.uid() and b.blocked = m.user_id)
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 40), 1), 100)
$$;

drop function if exists public.chat_since(timestamptz);
create function public.chat_since(p_after timestamptz)
returns table (id uuid, user_id uuid, username text, is_admin boolean, is_checker boolean, body text, image_path text, created_at timestamptz, reply_to uuid, reply_user text, reply_body text)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, p.username, (p.is_admin or p.is_owner), p.is_checker, m.body, m.image_path, m.created_at,
         m.reply_to, rp.username, case when rm.id is null then null else coalesce(nullif(left(rm.body, 80), ''), '[photo]') end
  from chat_messages m join profiles p on p.id = m.user_id
  left join chat_messages rm on rm.id = m.reply_to and not rm.removed
    and not exists (select 1 from chat_blocks bb where bb.blocker = auth.uid() and bb.blocked = rm.user_id)
  left join profiles rp on rp.id = rm.user_id
  where not m.removed and m.created_at >= p_after
    and not exists (select 1 from chat_blocks b where b.blocker = auth.uid() and b.blocked = m.user_id)
  order by m.created_at asc
  limit 100
$$;

-- write: same rules as before, plus an optional message to reply to (older app versions still work)
drop function if exists public.chat_post(text, text);
create or replace function public.chat_post(p_body text, p_image text default null, p_reply_to uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare b text := btrim(coalesce(p_body, '')); new_id uuid; rto uuid := p_reply_to;
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
  if rto is not null and not exists (select 1 from chat_messages where id = rto and not removed) then rto := null; end if;
  insert into chat_messages (user_id, body, image_path, reply_to) values (auth.uid(), b, p_image, rto) returning id into new_id;
  return new_id;
end $$;

-- react: tap an emoji to add it, tap again to take it back
create or replace function public.chat_react(p_message uuid, p_emoji text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in to react'; end if;
  if public.is_banned() then raise exception 'Your account is on hold'; end if;
  if p_emoji not in ('🔥','❤️','😂','👍','😮','👏') then raise exception 'Pick one of the emoji'; end if;
  if not exists (select 1 from chat_messages where id = p_message and not removed) then raise exception 'That message is gone'; end if;
  if exists (select 1 from chat_reactions where message_id = p_message and user_id = auth.uid() and emoji = p_emoji) then
    delete from chat_reactions where message_id = p_message and user_id = auth.uid() and emoji = p_emoji;
  else
    if (select count(*) from chat_reactions where user_id = auth.uid() and created_at > now() - interval '10 seconds') >= 8 then
      raise exception 'Slow down a little';
    end if;
    insert into chat_reactions (message_id, user_id, emoji) values (p_message, auth.uid(), p_emoji);
  end if;
end $$;

-- how many of each emoji on these messages, and which ones are yours
create or replace function public.chat_reaction_counts(p_ids uuid[])
returns table (message_id uuid, emoji text, n int, mine boolean)
language sql stable security definer set search_path = public as $$
  select r.message_id, r.emoji, count(*)::int, coalesce(bool_or(r.user_id = auth.uid()), false)
  from chat_reactions r
  where r.message_id = any (p_ids[1:200])
    and not exists (select 1 from chat_blocks b where b.blocker = auth.uid() and b.blocked = r.user_id)
  group by r.message_id, r.emoji
  order by r.message_id, min(r.created_at)
$$;

-- replying to someone counts as a mention for them (red number on Chat, phone alert)
create or replace function public.zk_queue_chat_mentions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into chat_mentions (message_id, user_id, author, snippet)
  select new.id, p.id, a.username, left(new.body, 140)
  from (select distinct lower(t.m[1]) as n from regexp_matches(new.body, '(?:^|\s)@([a-zA-Z0-9._]{3,24})', 'g') as t(m)) x
  join profiles p on lower(p.username) = x.n
  cross join (select username from profiles where id = new.user_id) a
  where p.id <> new.user_id and not p.is_banned
    and not exists (select 1 from chat_blocks b where b.blocker = p.id and b.blocked = new.user_id)
  on conflict do nothing;
  if new.reply_to is not null then
    insert into chat_mentions (message_id, user_id, author, snippet)
    select new.id, rm.user_id, a.username, left(coalesce(nullif(new.body, ''), '[photo]'), 140)
    from chat_messages rm
    join profiles pp on pp.id = rm.user_id
    cross join (select username from profiles where id = new.user_id) a
    where rm.id = new.reply_to and rm.user_id <> new.user_id and not pp.is_banned
      and not exists (select 1 from chat_blocks b where b.blocker = rm.user_id and b.blocked = new.user_id)
    on conflict do nothing;
  end if;
  return new;
end $$;

revoke all on function public.chat_feed(timestamptz, int), public.chat_since(timestamptz) from public;
grant execute on function public.chat_feed(timestamptz, int), public.chat_since(timestamptz) to anon, authenticated;
revoke all on function public.chat_post(text, text, uuid), public.chat_react(uuid, text), public.chat_reaction_counts(uuid[]) from public, anon;
grant execute on function public.chat_post(text, text, uuid), public.chat_react(uuid, text), public.chat_reaction_counts(uuid[]) to authenticated;
