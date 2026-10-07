-- ZENKICKS: phone alert when someone @mentions you in the chat (needs push.sql, push2.sql and chat.sql first)
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.push_subs add column if not exists mentions boolean not null default true;

-- this phone's choices (the 4th choice is new; older app versions still work)
drop function if exists public.push_prefs(text, boolean, boolean);
create or replace function public.push_prefs(p_endpoint text, p_weekly boolean, p_grails boolean, p_mentions boolean default null)
returns void language sql volatile security definer set search_path = public as $$
  update push_subs set weekly = coalesce(p_weekly, weekly), grails = coalesce(p_grails, grails),
    mentions = coalesce(p_mentions, mentions), user_id = coalesce(auth.uid(), user_id), seen_at = now()
  where endpoint = p_endpoint
$$;
grant execute on function public.push_prefs(text, boolean, boolean, boolean) to anon, authenticated;

-- queue: one row per (message, mentioned member)
create table if not exists public.chat_mentions (
  id bigint generated always as identity primary key,
  message_id uuid not null references public.chat_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author text not null,
  snippet text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (message_id, user_id)
);
create index if not exists chat_mentions_unsent_idx on public.chat_mentions (created_at) where sent_at is null;
alter table public.chat_mentions enable row level security;
revoke all on public.chat_mentions from anon, authenticated;

-- every new chat message: find the @usernames in it (not yourself, not banned, not someone who blocked you)
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
  return new;
end $$;
drop trigger if exists zk_chat_mentions on public.chat_messages;
create trigger zk_chat_mentions after insert on public.chat_messages for each row execute function public.zk_queue_chat_mentions();

-- called only by the Edge Function: phones of members with unsent mentions
create or replace function public.push_mention_due()
returns table (endpoint text, p256dh text, auth text, user_id uuid, items jsonb)
language sql volatile security definer set search_path = public as $$
  with tidy as (
    update chat_mentions set sent_at = now() where sent_at is null and created_at < now() - interval '1 day' returning 1
  ), due as (
    select c.user_id, jsonb_agg(jsonb_build_object('author', c.author, 'snippet', c.snippet) order by c.created_at desc) as items
    from chat_mentions c join chat_messages m on m.id = c.message_id and not m.removed
    where c.sent_at is null
    group by c.user_id
  )
  select s.endpoint, s.p256dh, s.auth, d.user_id, d.items
  from due d join push_subs s on s.user_id = d.user_id and s.mentions and s.fails < 5
$$;

create or replace function public.push_mention_done(p_user uuid default null)
returns void language sql volatile security definer set search_path = public as $$
  update chat_mentions c set sent_at = now()
  where c.sent_at is null and (
    c.user_id = p_user
    or (p_user is null and not exists (select 1 from push_subs s where s.user_id = c.user_id and s.mentions))
  )
$$;

do $$ begin
  revoke execute on function public.push_mention_due(), public.push_mention_done(uuid) from public, anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_mention_due(), public.push_mention_done(uuid) to service_role;
  end if;
end $$;

-- every minute: same call as the grail alerts job, only the action changes (so the key is not pasted here)
do $$
declare c text;
begin
  select command into c from cron.job where jobname = 'zenkicks-grail-alerts';
  if c is null then raise exception 'zenkicks-grail-alerts job not found'; end if;
  perform cron.schedule('zenkicks-chat-mentions', '* * * * *', replace(c, '"action":"grails"', '"action":"mentions"'));
end $$;
