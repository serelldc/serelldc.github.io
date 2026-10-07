-- ZENKICKS: count installs (opens from the home-screen icon). Run once in Supabase > SQL Editor.
-- One row per phone (random device id, no personal data). Linked to a member only when they are signed in.

create table if not exists public.app_installs (
  device_id text primary key check (char_length(device_id) between 8 and 64),
  user_id uuid references auth.users(id) on delete set null,
  platform text not null default 'other' check (platform in ('ios','android','other')),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  opens int not null default 1
);
alter table public.app_installs enable row level security;
revoke all on public.app_installs from anon, authenticated;

create or replace function public.record_app_open(p_device text, p_platform text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_device is null or char_length(p_device) not between 8 and 64 then return; end if;
  insert into app_installs (device_id, user_id, platform)
  values (p_device, auth.uid(), case when p_platform in ('ios','android') then p_platform else 'other' end)
  on conflict (device_id) do update
    set last_at = now(), opens = app_installs.opens + 1, user_id = coalesce(auth.uid(), app_installs.user_id);
end $$;
revoke all on function public.record_app_open(text, text) from public;
grant execute on function public.record_app_open(text, text) to anon, authenticated;

create or replace function public.owner_install_stats() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then raise exception 'Owner only'; end if;
  return jsonb_build_object(
    'total',   (select count(*) from app_installs),
    'ios',     (select count(*) from app_installs where platform = 'ios'),
    'android', (select count(*) from app_installs where platform = 'android'),
    'new_7d',  (select count(*) from app_installs where first_at > now() - interval '7 days'),
    'active_7d', (select count(*) from app_installs where last_at > now() - interval '7 days'),
    'members', (select count(*) from app_installs where user_id is not null),
    'recent',  coalesce((select jsonb_agg(r) from (
                  select p.username, a.platform, a.first_at
                  from app_installs a left join profiles p on p.id = a.user_id
                  order by a.first_at desc limit 8) r), '[]'::jsonb)
  );
end $$;
revoke all on function public.owner_install_stats() from public, anon;
grant execute on function public.owner_install_stats() to authenticated;
