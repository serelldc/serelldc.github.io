-- ZENKICKS: unread @mention count on the Chat tab (needs chat.sql and chat-push.sql first)
-- Run once in Supabase > SQL Editor. Safe to run more than once.

alter table public.chat_mentions add column if not exists seen_at timestamptz;

-- how many @mentions of you have you not looked at yet
create or replace function public.chat_unread_mentions() returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from chat_mentions c
  join chat_messages m on m.id = c.message_id and not m.removed
  where c.user_id = auth.uid() and c.seen_at is null
$$;

-- you opened the chat: they are now "seen"
create or replace function public.chat_mark_seen() returns void
language sql volatile security definer set search_path = public as $$
  update chat_mentions set seen_at = now() where user_id = auth.uid() and seen_at is null
$$;

revoke all on function public.chat_unread_mentions(), public.chat_mark_seen() from public, anon;
grant execute on function public.chat_unread_mentions(), public.chat_mark_seen() to authenticated;
