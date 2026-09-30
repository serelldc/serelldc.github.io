-- =====================================================================
-- ZENKICKS: owner panel shows "+ N pending" (signed up, never entered the code)
-- Safe to run more than once.
-- =====================================================================
drop function if exists public.admin_stats();
create function public.admin_stats()
returns table (members int, new_7d int, active_listings int, sold int, checks int, open_reports int, banned int, pending int)
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
    (select count(*)::int from profiles where is_banned or banned_until > now()),
    (select count(*)::int from auth.users where email_confirmed_at is null and phone_confirmed_at is null);
end $$;
revoke all on function public.admin_stats() from anon;
grant execute on function public.admin_stats() to authenticated;
