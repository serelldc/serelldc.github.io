-- =====================================================================
-- ZENKICKS: only count members who finished signing in (confirmed email/phone)
-- - OG numbers go to confirmed members only (typos and abandoned sign-ups don't use up spots)
-- - Owner panel shows who never confirmed
-- Safe to run more than once.
-- =====================================================================

create or replace function public.og_members()
returns table (user_id uuid, n int)
language sql stable security definer set search_path = public as $$
  select p.id, (row_number() over (order by p.created_at, p.id))::int
  from profiles p join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null or u.phone_confirmed_at is not null or p.is_owner
  order by p.created_at, p.id limit 100
$$;

drop function if exists public.admin_find_users(text);
create function public.admin_find_users(q text default '')
returns table (id uuid, username text, email text, city text, verified_level text, is_owner boolean, is_admin boolean,
  is_checker boolean, is_banned boolean, banned_until timestamptz, warns int, confirmed boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select p.id, p.username, case when public.is_owner() then u.email::text else null end, p.city, p.verified_level,
           p.is_owner, p.is_admin, p.is_checker, p.is_banned,
           case when p.banned_until > now() then p.banned_until else null end,
           (select count(*)::int from warnings w where w.user_id = p.id and w.kind = 'warn'),
           (u.email_confirmed_at is not null or u.phone_confirmed_at is not null), p.created_at
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
    (select count(*)::int from auth.users where email_confirmed_at is not null or phone_confirmed_at is not null),
    (select count(*)::int from profiles p join auth.users u on u.id = p.id where (u.email_confirmed_at is not null or u.phone_confirmed_at is not null) and p.created_at > now() - interval '7 days'),
    (select count(*)::int from listings where status = 'active'),
    (select count(*)::int from listings where status = 'sold'),
    (select count(*)::int from checks),
    (select count(*)::int from reports where not resolved),
    (select count(*)::int from profiles where is_banned or banned_until > now());
end $$;

revoke all on function public.admin_find_users(text) from anon;
grant execute on function public.og_members() to anon, authenticated;
