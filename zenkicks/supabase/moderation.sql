-- =====================================================================
-- ZENKICKS: OG badge, warnings, temporary bans (suspensions), Trusted Seller
-- Safe to run more than once.
-- =====================================================================

-- ---------- suspensions ----------
alter table public.profiles add column if not exists banned_until timestamptz;
-- (reasons live in public.warnings, which only the member and admins can read)

-- banned = permanent ban OR an active suspension
create or replace function public.is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_banned or coalesce(banned_until > now(), false) from public.profiles where id = auth.uid()), false)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_owner from profiles where id = auth.uid()
    and not is_banned and not coalesce(banned_until > now(), false)), false)
$$;
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_checker or is_owner from profiles where id = auth.uid()
    and not is_banned and not coalesce(banned_until > now(), false)), false)
$$;

-- ---------- notices (warnings, suspensions, bans) shown to the member ----------
create table if not exists public.warnings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  by_id uuid references public.profiles(id) on delete set null,
  kind text not null default 'warn' check (kind in ('warn', 'suspend', 'ban', 'lift')),
  reason text not null check (char_length(reason) between 3 and 300),
  until_at timestamptz,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists warnings_user_idx on public.warnings (user_id, created_at desc);
alter table public.warnings enable row level security;
drop policy if exists "warnings read own or admin" on public.warnings;
create policy "warnings read own or admin" on public.warnings for select using (user_id = auth.uid() or public.is_admin());
-- no insert/update policies: only the functions below can write

-- who may act on whom: owner untouchable; staff only by the owner
create or replace function public.zk_can_moderate(target uuid) returns profiles
language plpgsql stable security definer set search_path = public as $$
declare t profiles;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into t from profiles where id = target;
  if not found then raise exception 'Member not found'; end if;
  if t.is_owner then raise exception 'The owner cannot be moderated'; end if;
  if t.id = auth.uid() then raise exception 'You cannot moderate yourself'; end if;
  if (t.is_admin or t.is_checker) and not public.is_owner() then raise exception 'Only the owner can moderate staff'; end if;
  return t;
end $$;

create or replace function public.admin_warn(target uuid, msg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.zk_can_moderate(target);
  insert into warnings (user_id, by_id, kind, reason) values (target, auth.uid(), 'warn', trim(msg));
end $$;

create or replace function public.admin_suspend(target uuid, days int, msg text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare u timestamptz;
begin
  perform public.zk_can_moderate(target);
  if days is null or days < 1 or days > 90 then raise exception 'Pick 1 to 90 days'; end if;
  u := now() + make_interval(days => days);
  update profiles set banned_until = u where id = target;
  insert into warnings (user_id, by_id, kind, reason, until_at) values (target, auth.uid(), 'suspend', trim(msg), u);
  return u;
end $$;

create or replace function public.admin_lift(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.zk_can_moderate(target);
  update profiles set banned_until = null where id = target;
  insert into warnings (user_id, by_id, kind, reason) values (target, auth.uid(), 'lift', 'Your suspension was lifted.');
end $$;

-- permanent ban with a reason (old 2-argument version stays for compatibility)
create or replace function public.admin_set_ban(target uuid, val boolean, msg text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.zk_can_moderate(target);
  update profiles set is_banned = val, banned_until = case when val then banned_until else null end where id = target;
  if val then
    update listings set status = 'removed' where seller_id = target and status = 'active';
    insert into warnings (user_id, by_id, kind, reason) values (target, auth.uid(), 'ban', coalesce(nullif(trim(coalesce(msg, '')), ''), 'Your account was banned.'));
  else
    insert into warnings (user_id, by_id, kind, reason) values (target, auth.uid(), 'lift', 'Your ban was lifted.');
  end if;
end $$;

-- member reads and dismisses their own notices
create or replace function public.my_notices()
returns table (id uuid, kind text, reason text, until_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.id, w.kind, w.reason, w.until_at, w.created_at from warnings w
  where w.user_id = auth.uid() and not w.seen order by w.created_at
$$;
create or replace function public.ack_notices()
returns void language sql security definer set search_path = public as $$
  update warnings set seen = true where user_id = auth.uid() and not seen
$$;

-- admin member search now shows suspensions and warning counts
drop function if exists public.admin_find_users(text);
create function public.admin_find_users(q text default '')
returns table (id uuid, username text, email text, city text, verified_level text, is_owner boolean, is_admin boolean,
  is_checker boolean, is_banned boolean, banned_until timestamptz, warns int, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select p.id, p.username, case when public.is_owner() then u.email::text else null end, p.city, p.verified_level,
           p.is_owner, p.is_admin, p.is_checker, p.is_banned,
           case when p.banned_until > now() then p.banned_until else null end,
           (select count(*)::int from warnings w where w.user_id = p.id and w.kind = 'warn'), p.created_at
    from profiles p left join auth.users u on u.id = p.id
    where coalesce(q, '') = '' or p.username ilike '%' || q || '%' or (public.is_owner() and u.email ilike '%' || q || '%')
    order by p.is_owner desc, p.is_admin desc, p.is_checker desc, p.created_at desc
    limit 50;
end $$;

create or replace function public.admin_stats()
returns table (members int, new_7d int, active_listings int, sold int, checks int, open_reports int, banned int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query select
    (select count(*)::int from profiles),
    (select count(*)::int from profiles where created_at > now() - interval '7 days'),
    (select count(*)::int from listings where status = 'active'),
    (select count(*)::int from listings where status = 'sold'),
    (select count(*)::int from checks),
    (select count(*)::int from reports where not resolved),
    (select count(*)::int from profiles where is_banned or banned_until > now());
end $$;

-- ---------- OG badge: the first 100 members ----------
create or replace function public.og_members()
returns table (user_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select id, (row_number() over (order by created_at, id))::int from profiles order by created_at, id limit 100
$$;

-- ---------- Trusted Seller: 5+ deal vouches averaging 4.5+ ----------
drop function if exists public.vouch_summary(uuid[]);
create function public.vouch_summary(ids uuid[])
returns table (user_id uuid, avg_stars numeric, total int, deals int, legit int, deal_avg numeric, trusted boolean)
language sql stable security definer set search_path = public as $$
  select v.to_id, round(avg(v.stars)::numeric, 1), count(*)::int,
         count(*) filter (where v.kind = 'deal')::int, count(*) filter (where v.kind = 'legit')::int,
         round((avg(v.stars) filter (where v.kind = 'deal'))::numeric, 1),
         (count(*) filter (where v.kind = 'deal') >= 5 and avg(v.stars) filter (where v.kind = 'deal') >= 4.5)
  from vouches v where v.to_id = any(ids) group by v.to_id
$$;

revoke all on function public.admin_warn(uuid, text), public.admin_suspend(uuid, int, text), public.admin_lift(uuid),
  public.admin_set_ban(uuid, boolean, text), public.my_notices(), public.ack_notices(),
  public.admin_find_users(text), public.zk_can_moderate(uuid) from anon;
grant execute on function public.og_members(), public.vouch_summary(uuid[]) to anon, authenticated;
