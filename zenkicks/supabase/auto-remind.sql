-- ZENKICKS: auto-remind people who asked for a sign-up code but never typed it.
-- One reminder per person, ever. At most 1 email per run (every 10 min) so we stay under email limits.
-- Run once in Supabase > SQL Editor. Safe to re-run.

create table if not exists public.signup_reminders (
  user_id uuid primary key,
  sent_at timestamptz not null default now()
);
alter table public.signup_reminders enable row level security;
revoke all on public.signup_reminders from anon, authenticated;

create or replace function public.remind_unfinished_signup() returns int
language plpgsql security definer set search_path = public, auth, extensions as $$
declare u record; k text;
begin
  select au.id, au.email into u
  from auth.users au
  where au.email_confirmed_at is null and au.phone_confirmed_at is null and au.email is not null
    and au.created_at < now() - interval '24 hours'
    and au.created_at > now() - interval '30 days'
    and (au.banned_until is null or au.banned_until < now())
    and not exists (select 1 from public.signup_reminders r where r.user_id = au.id)
  order by au.created_at
  limit 1;
  if u.id is null then return 0; end if;

  -- anon key (public, same as config.js), split so the SQL editor does not mask it
  k := 'ey' ||
      'JhbGciOiJIUzI1NiIsInR5cC' ||
      'I6IkpXVCJ9.eyJpc3MiOiJzd' ||
      'XBhYmFzZSIsInJlZiI6ImRzZ' ||
      '3l4a3JwdXRraWZ4bmJja25mI' ||
      'iwicm9sZSI6ImFub24iLCJpY' ||
      'XQiOjE3OTA2NzkxNDMsImV4c' ||
      'CI6MjEwNjI1NTE0M30.UPz9k' ||
      'k8zzgqZ49yih6Ii8MUiFdzm0' ||
      'uorjQm3FnF8avw';
  insert into public.signup_reminders (user_id) values (u.id) on conflict do nothing;
  perform net.http_post(
    url := 'https://dsgyxkrputkifxnbcknf.supabase.co/auth/v1/resend',
    headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', k, 'Authorization', 'Bearer ' || k),
    body := jsonb_build_object('type', 'signup', 'email', u.email)
  );
  return 1;
end $$;
revoke all on function public.remind_unfinished_signup() from public, anon, authenticated;

select cron.schedule('zenkicks-signup-reminder', '*/10 * * * *', $cron$ select public.remind_unfinished_signup(); $cron$);
