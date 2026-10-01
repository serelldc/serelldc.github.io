-- =====================================================================
-- ZENKICKS: drop-day phone notifications ("Remind me")
-- - A phone that turns on alerts saves its push address here (push_subs)
--   with the drops it wants a reminder for (drop_reminders).
-- - The "push" Edge Function sends one notification at 8 AM UAE time on
--   drop day (scheduled with pg_cron at the bottom of this file).
-- - Nobody can read these tables from the app; the app only calls the
--   functions below. Only the Edge Function (service role) sends.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.push_subs (
  endpoint text primary key check (endpoint ~ '^https://' and length(endpoint) < 1000),
  p256dh text not null check (length(p256dh) between 60 and 120),
  auth text not null check (length(auth) between 16 and 40),
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  last_status int,
  last_sent timestamptz,
  last_test timestamptz,
  fails int not null default 0
);

create table if not exists public.drop_reminders (
  endpoint text not null references public.push_subs(endpoint) on delete cascade on update cascade,
  release_key text not null check (length(release_key) between 3 and 200),
  name text not null check (length(name) between 1 and 160),
  release_date date not null,
  image text check (image is null or length(image) <= 600),
  retail_usd numeric,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (endpoint, release_key)
);
create index if not exists drop_reminders_day_idx on public.drop_reminders (release_date) where sent_at is null;

-- the app's sending keys (made once by the Edge Function; the private half never leaves the database)
create table if not exists public.push_config (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_jwk jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_subs enable row level security;
alter table public.drop_reminders enable row level security;
alter table public.push_config enable row level security;
revoke all on public.push_subs, public.drop_reminders, public.push_config from anon, authenticated;

-- ---------- called by the app ----------

-- public half of the sending key (the phone needs it to sign up for alerts)
create or replace function public.push_public_key()
returns text language sql stable security definer set search_path = public as $$
  select public_key from push_config where id = 1
$$;

-- save this phone's push address and the full list of drops it wants reminders for
-- items: [{"key": "...", "name": "...", "date": "YYYY-MM-DD", "image": "...", "usd": 170}, ...]
create or replace function public.push_save(p_endpoint text, p_p256dh text, p_auth text, p_items jsonb default '[]'::jsonb)
returns int language plpgsql volatile security definer set search_path = public as $$
declare today date := (now() at time zone 'Asia/Dubai')::date; n int;
begin
  if p_endpoint is null or p_endpoint !~ '^https://' then raise exception 'bad push address'; end if;
  insert into push_subs (endpoint, p256dh, auth, user_id)
  values (p_endpoint, p_p256dh, p_auth, auth.uid())
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh, auth = excluded.auth,
    user_id = coalesce(auth.uid(), push_subs.user_id), seen_at = now(), fails = 0;

  with items as (
    select distinct on (left(x->>'key', 200)) left(x->>'key', 200) as k, left(coalesce(x->>'name', ''), 160) as nm,
           (x->>'date')::date as d, nullif(left(coalesce(x->>'image', ''), 600), '') as im,
           case when (x->>'usd') ~ '^[0-9]+(\.[0-9]+)?$' then (x->>'usd')::numeric end as usd
    from (select x from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) x limit 60) s
    where coalesce(x->>'key', '') <> '' and coalesce(x->>'name', '') <> '' and (x->>'date') ~ '^\d{4}-\d{2}-\d{2}$'
  ), del as (
    delete from drop_reminders r where r.endpoint = p_endpoint and r.sent_at is null
      and not exists (select 1 from items i where i.k = r.release_key)
  )
  insert into drop_reminders (endpoint, release_key, name, release_date, image, retail_usd)
  select p_endpoint, k, nm, d, im, usd from items where d >= today and length(k) >= 3
  on conflict (endpoint, release_key) do update set name = excluded.name, image = excluded.image, retail_usd = excluded.retail_usd;

  select count(*) into n from drop_reminders where endpoint = p_endpoint and sent_at is null and release_date >= today;
  return n;
end $$;

-- turn alerts off on this phone
create or replace function public.push_off(p_endpoint text)
returns void language sql volatile security definer set search_path = public as $$
  delete from push_subs where endpoint = p_endpoint
$$;

grant execute on function public.push_public_key() to anon, authenticated;
grant execute on function public.push_save(text, text, text, jsonb) to anon, authenticated;
grant execute on function public.push_off(text) to anon, authenticated;

-- ---------- called only by the Edge Function (service role) ----------

create or replace function public.push_keys()
returns table (public_key text, private_jwk jsonb) language sql stable security definer set search_path = public as $$
  select public_key, private_jwk from push_config where id = 1
$$;

create or replace function public.push_init_keys(p_public text, p_private jsonb)
returns void language sql volatile security definer set search_path = public as $$
  insert into push_config (id, public_key, private_jwk) values (1, p_public, p_private) on conflict (id) do nothing
$$;

-- phones with drops today (UAE date) that haven't been notified yet
create or replace function public.push_due()
returns table (endpoint text, p256dh text, auth text, items jsonb)
language sql volatile security definer set search_path = public as $$
  with tidy as (
    delete from drop_reminders where release_date < (now() at time zone 'Asia/Dubai')::date - 30 returning 1
  )
  select s.endpoint, s.p256dh, s.auth,
         jsonb_agg(jsonb_build_object('key', r.release_key, 'name', r.name, 'image', r.image, 'usd', r.retail_usd) order by r.name)
  from drop_reminders r join push_subs s on s.endpoint = r.endpoint
  where r.release_date = (now() at time zone 'Asia/Dubai')::date and r.sent_at is null
  group by s.endpoint, s.p256dh, s.auth
$$;

-- record how a send went: delivered -> mark sent; phone gone (404/410) -> forget it
create or replace function public.push_done(p_endpoint text, p_status int, p_keys text[] default '{}')
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if p_status between 200 and 299 then
    update drop_reminders set sent_at = now() where endpoint = p_endpoint and release_key = any (p_keys);
    update push_subs set last_status = p_status, last_sent = now(), fails = 0 where endpoint = p_endpoint;
  elsif p_status in (404, 410) then
    delete from push_subs where endpoint = p_endpoint;
  else
    update push_subs set last_status = p_status, fails = fails + 1 where endpoint = p_endpoint;
  end if;
end $$;

-- a "test notification" right after turning alerts on (max one every 30 seconds per phone)
create or replace function public.push_test_target(p_endpoint text)
returns table (p256dh text, auth text) language sql volatile security definer set search_path = public as $$
  update push_subs set last_test = now()
  where endpoint = p_endpoint and (last_test is null or last_test < now() - interval '30 seconds')
  returning p256dh, auth
$$;

do $$ begin
  revoke execute on function public.push_keys(), public.push_init_keys(text, jsonb), public.push_due(),
    public.push_done(text, int, text[]), public.push_test_target(text) from public, anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_keys(), public.push_init_keys(text, jsonb), public.push_due(),
      public.push_done(text, int, text[]), public.push_test_target(text) to service_role;
  end if;
end $$;

-- ---------- schedule: every day 04:00 UTC = 8:00 AM UAE ----------
-- (needs the "push" Edge Function deployed; the key below is the public anon key, same as config.js)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule('zenkicks-drop-alerts', '0 4 * * *', $cron$
  select net.http_post(
    url := 'https://dsgyxkrputkifxnbcknf.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZ3l4a3JwdXRraWZ4bmJja25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzkxNDMsImV4cCI6MjEwNjI1NTE0M30.UPz9kk8zzgqZ49yih6Ii8MUiFdzm0uorjQm3FnF8avw'),
    body := '{"action":"run"}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);
