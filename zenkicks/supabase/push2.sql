-- =====================================================================
-- ZENKICKS: more phone alerts (needs push.sql first)
-- 1. Weekly "drops this week" digest, every Monday 12 PM UAE.
-- 2. Grail alerts: when someone lists a pair that matches your grail,
--    your phone gets a notification within about 15 minutes.
-- Each phone can switch either one off (Me > Alerts).
-- Safe to run more than once.
-- =====================================================================

alter table public.push_subs add column if not exists weekly boolean not null default true;
alter table public.push_subs add column if not exists grails boolean not null default true;

-- this phone's choices
create or replace function public.push_prefs(p_endpoint text, p_weekly boolean, p_grails boolean)
returns void language sql volatile security definer set search_path = public as $$
  update push_subs set weekly = coalesce(p_weekly, weekly), grails = coalesce(p_grails, grails),
    user_id = coalesce(auth.uid(), user_id), seen_at = now()
  where endpoint = p_endpoint
$$;
grant execute on function public.push_prefs(text, boolean, boolean) to anon, authenticated;

-- ---------- grail alert queue ----------
create table if not exists public.grail_alerts (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (user_id, listing_id)
);
create index if not exists grail_alerts_unsent_idx on public.grail_alerts (created_at) where sent_at is null;
alter table public.grail_alerts enable row level security;
revoke all on public.grail_alerts from anon, authenticated;

-- every new active listing is matched against everyone's grails
create or replace function public.zk_queue_grail_alerts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'active' then
    insert into grail_alerts (user_id, listing_id)
    select distinct g.user_id, new.id from grails g
    where g.user_id <> new.seller_id
      and zk_words_match(g.model, new.model || ' ' || coalesce(new.brand, ''))
      and (g.size_eu is null or new.size_eu = g.size_eu)
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists zk_grail_alerts on public.listings;
create trigger zk_grail_alerts after insert on public.listings for each row execute function public.zk_queue_grail_alerts();

-- ---------- called only by the Edge Function (service role) ----------

-- phones whose owner has unsent grail matches (still for sale), with the pairs
create or replace function public.push_grail_due()
returns table (endpoint text, p256dh text, auth text, user_id uuid, items jsonb)
language sql volatile security definer set search_path = public as $$
  with tidy as (
    update grail_alerts set sent_at = now() where sent_at is null and created_at < now() - interval '2 days' returning 1
  ), due as (
    select a.user_id, jsonb_agg(jsonb_build_object('id', l.id, 'model', l.model, 'size', l.size_eu, 'price', l.price_aed,
             'photo', (select p.path from listing_photos p where p.listing_id = l.id order by (p.kind = 'side') desc, p.position limit 1))
             order by a.created_at desc) as items
    from grail_alerts a join listings l on l.id = a.listing_id and l.status = 'active'
    where a.sent_at is null
    group by a.user_id
  )
  select s.endpoint, s.p256dh, s.auth, d.user_id, d.items
  from due d join push_subs s on s.user_id = d.user_id and s.grails
$$;

-- mark a member's grail alerts as sent (also members with no phone set up, so the queue stays small)
create or replace function public.push_grail_done(p_user uuid default null)
returns void language sql volatile security definer set search_path = public as $$
  update grail_alerts a set sent_at = now()
  where a.sent_at is null and (
    a.user_id = p_user
    or (p_user is null and not exists (select 1 from push_subs s where s.user_id = a.user_id and s.grails))
  )
$$;

-- phones that want the weekly digest
create or replace function public.push_weekly_targets()
returns table (endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select endpoint, p256dh, auth from push_subs where weekly and fails < 5
$$;

-- the digest goes out at most once every 6 days, however often the function is called
alter table public.push_config add column if not exists weekly_at timestamptz;
create or replace function public.push_weekly_claim()
returns boolean language plpgsql volatile security definer set search_path = public as $$
begin
  update push_config set weekly_at = now() where id = 1 and (weekly_at is null or weekly_at < now() - interval '6 days');
  return found;
end $$;

do $$ begin
  revoke execute on function public.push_grail_due(), public.push_grail_done(uuid), public.push_weekly_targets(), public.push_weekly_claim() from public, anon, authenticated;
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_grail_due(), public.push_grail_done(uuid), public.push_weekly_targets(), public.push_weekly_claim() to service_role;
  end if;
end $$;

-- ---------- schedules (the key is the public anon key, same as config.js) ----------
create extension if not exists pg_cron;
create extension if not exists pg_net;
-- grail alerts: every 15 minutes
select cron.schedule('zenkicks-grail-alerts', '*/15 * * * *', $cron$
  select net.http_post(
    url := 'https://dsgyxkrputkifxnbcknf.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZ3l4a3JwdXRraWZ4bmJja25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzkxNDMsImV4cCI6MjEwNjI1NTE0M30.UPz9kk8zzgqZ49yih6Ii8MUiFdzm0uorjQm3FnF8avw'),
    body := '{"action":"grails"}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);
-- weekly digest: Mondays 08:07 UTC = 12:07 PM UAE (after the weekly calendar update)
select cron.schedule('zenkicks-weekly-drops', '7 8 * * 1', $cron$
  select net.http_post(
    url := 'https://dsgyxkrputkifxnbcknf.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRzZ3l4a3JwdXRraWZ4bmJja25mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2NzkxNDMsImV4cCI6MjEwNjI1NTE0M30.UPz9kk8zzgqZ49yih6Ii8MUiFdzm0uorjQm3FnF8avw'),
    body := '{"action":"weekly"}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);
