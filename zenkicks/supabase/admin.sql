-- =====================================================================
-- ZENKICKS — Owner / admin tools (run once after schema.sql)
-- Roles: owner (founder, top) > admin (reports, bans, removals) > checker (verdicts)
-- =====================================================================
alter table public.profiles add column if not exists is_owner boolean not null default false;

create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_owner from profiles where id = auth.uid()), false)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_owner from profiles where id = auth.uid() and not is_banned), false)
$$;

-- owners count as staff everywhere
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_checker or is_owner from profiles where id = auth.uid() and not is_banned), false)
$$;

-- dashboard numbers
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
    (select count(*)::int from profiles where is_banned);
end $$;

-- find members (email is shown to the owner only)
create or replace function public.admin_find_users(q text default '')
returns table (id uuid, username text, email text, city text, verified_level text, is_owner boolean, is_admin boolean, is_checker boolean, is_banned boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select p.id, p.username, case when public.is_owner() then u.email::text else null end, p.city, p.verified_level,
           p.is_owner, p.is_admin, p.is_checker, p.is_banned, p.created_at
    from profiles p left join auth.users u on u.id = p.id
    where coalesce(q, '') = '' or p.username ilike '%' || q || '%' or (public.is_owner() and u.email ilike '%' || q || '%')
    order by p.is_owner desc, p.is_admin desc, p.is_checker desc, p.created_at desc
    limit 50;
end $$;

-- give or take roles. Owner: admin + checker. Admin: checker only. Nobody can touch the owner.
create or replace function public.admin_set_role(target uuid, role text, val boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t profiles;
begin
  select * into t from profiles where id = target;
  if not found then raise exception 'Member not found'; end if;
  if t.is_owner then raise exception 'The owner cannot be changed'; end if;
  if role = 'admin' then
    if not public.is_owner() then raise exception 'Only the owner can appoint admins'; end if;
    update profiles set is_admin = val where id = target;
  elsif role = 'checker' then
    if not public.is_admin() then raise exception 'Admins only'; end if;
    update profiles set is_checker = val where id = target;
  else
    raise exception 'Unknown role';
  end if;
end $$;

-- ban / unban. Owner can ban anyone but themself; admins can ban regular members only.
create or replace function public.admin_set_ban(target uuid, val boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t profiles;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  select * into t from profiles where id = target;
  if not found then raise exception 'Member not found'; end if;
  if t.is_owner then raise exception 'The owner cannot be banned'; end if;
  if (t.is_admin or t.is_checker) and not public.is_owner() then raise exception 'Only the owner can ban staff'; end if;
  update profiles set is_banned = val where id = target;
  if val then update listings set status = 'removed' where seller_id = target and status = 'active'; end if;
end $$;

-- take down a listing (any status)
create or replace function public.admin_remove_listing(lid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  update listings set status = 'removed' where id = lid;
end $$;

-- public list of founder accounts (for the Founder badge)
create or replace function public.owner_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from profiles where is_owner
$$;

revoke all on function public.admin_stats(), public.admin_find_users(text), public.admin_set_role(uuid, text, boolean),
  public.admin_set_ban(uuid, boolean), public.admin_remove_listing(uuid) from anon;
