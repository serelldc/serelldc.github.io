-- =====================================================================
-- ZENKICKS: OG numbers are permanent
-- - Each member gets their OG number once, in the order they FINISHED
--   signing up (confirmed email, phone or Google). It never changes after.
-- - Late confirmers no longer push other members' numbers down.
-- Safe to run more than once.
-- =====================================================================
alter table public.profiles add column if not exists og_no int;
create unique index if not exists profiles_og_no_key on public.profiles (og_no) where og_no is not null;

create or replace function public.og_members()
returns table (user_id uuid, n int)
language plpgsql volatile security definer set search_path = public as $$
declare base int;
begin
  -- hand out numbers to anyone who finished signing up but has none yet (first 100 only)
  if exists (select 1 from profiles p join auth.users u on u.id = p.id
             where p.og_no is null and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null or p.is_owner)) then
    perform pg_advisory_xact_lock(424242);
    select coalesce(max(og_no), 0) into base from profiles;
    if base < 100 then
      with todo as (
        select p.id, row_number() over (order by p.is_owner desc, coalesce(u.email_confirmed_at, u.phone_confirmed_at, p.created_at), p.id) as rn
        from profiles p join auth.users u on u.id = p.id
        where p.og_no is null and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null or p.is_owner)
      )
      update profiles p set og_no = base + t.rn from todo t where p.id = t.id and base + t.rn <= 100;
    end if;
  end if;
  return query select p.id, p.og_no from profiles p where p.og_no is not null order by p.og_no;
end $$;
grant execute on function public.og_members() to anon, authenticated;
