-- =====================================================================
-- ZENKICKS: invite links (serelldc.github.io/zenkicks/join?ref=username)
-- - Someone who signs up from a member's link is saved as invited by them.
-- - Only the new member can set it, once, within 3 days of joining.
-- - Members see how many friends joined; the owner sees the top inviters.
-- Safe to run more than once.
-- =====================================================================
alter table public.profiles add column if not exists referred_by uuid references auth.users(id) on delete set null;
create index if not exists profiles_referred_by_idx on public.profiles (referred_by) where referred_by is not null;
-- note: no "grant update (referred_by)" on purpose; it can only be set by set_referrer() below

create or replace function public.set_referrer(p_ref text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare me uuid := auth.uid(); cur uuid; joined timestamptz; r uuid;
begin
  if me is null then return 'signin'; end if;
  select referred_by, created_at into cur, joined from profiles where id = me;
  if not found then return 'noprofile'; end if;
  if cur is not null then return 'already'; end if;
  if joined < now() - interval '3 days' then return 'too_late'; end if;
  select id into r from profiles where lower(username) = lower(btrim(coalesce(p_ref, ''), ' @')) limit 1;
  if r is null then return 'unknown'; end if;
  if r = me then return 'self'; end if;
  update profiles set referred_by = r where id = me and referred_by is null;
  return 'ok';
end $$;

-- how many people joined with my link
create or replace function public.my_invites()
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from profiles where referred_by = auth.uid()
$$;

-- owner only: who brought in the most members
create or replace function public.invite_stats()
returns table (user_id uuid, username text, invited int, last_joined timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, count(f.id)::int, max(f.created_at)
  from profiles f join profiles p on p.id = f.referred_by
  where exists (select 1 from profiles o where o.id = auth.uid() and o.is_owner)
  group by p.id, p.username
  order by count(f.id) desc, max(f.created_at) desc
  limit 50
$$;

revoke execute on function public.set_referrer(text), public.my_invites(), public.invite_stats() from public, anon;
grant execute on function public.set_referrer(text), public.my_invites(), public.invite_stats() to authenticated;
