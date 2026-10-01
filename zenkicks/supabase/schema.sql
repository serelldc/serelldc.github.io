-- =====================================================================
-- ZENKICKS — Supabase database schema
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe to run once on a fresh project.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- PROFILES (public) + PRIVATE CONTACTS (only the owner can read)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-z0-9._]{3,24}$'),
  display_name text check (char_length(display_name) <= 40),
  city text check (city in ('Dubai','Sharjah','Abu Dhabi','Ajman','Ras Al Khaimah','Fujairah','Umm Al Quwain','Al Ain')),
  verified_level text not null default 'email' check (verified_level in ('email','phone','id')),
  is_checker boolean not null default false,
  is_admin boolean not null default false,
  is_banned boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.private_contacts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  whatsapp text check (whatsapp ~ '^\+?[0-9 ]{7,20}$')
);

-- create a profile automatically when someone signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text; candidate text; n int := 0;
begin
  base := lower(regexp_replace(coalesce(split_part(new.email, '@', 1), 'kicks'), '[^a-z0-9._]', '', 'g'));
  if char_length(base) < 3 then base := 'kicks' || base; end if;
  base := left(base, 18);
  candidate := base;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1; candidate := base || n::text;
  end loop;
  insert into public.profiles (id, username, verified_level)
  values (new.id, candidate, case when new.phone_confirmed_at is not null then 'phone' else 'email' end);
  insert into public.private_contacts (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- upgrade to 'phone' when a phone number gets confirmed
create or replace function public.handle_phone_confirmed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone_confirmed_at is not null and old.phone_confirmed_at is null then
    update public.profiles set verified_level = 'phone' where id = new.id and verified_level = 'email';
  end if;
  return new;
end $$;

create trigger on_auth_phone_confirmed
  after update of phone_confirmed_at on auth.users for each row execute function public.handle_phone_confirmed();

create or replace function public.is_banned() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_banned from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_checker from public.profiles where id = auth.uid()), false)
$$;

-- ---------------------------------------------------------------------
-- MARKETPLACE
-- ---------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  model text not null check (char_length(model) between 2 and 80),
  brand text check (char_length(brand) <= 30),
  size_eu numeric(4,1) check (size_eu between 30 and 52),
  condition text not null check (condition in ('New / DS','Pre-owned 9/10','Pre-owned 8/10','Pre-owned 7/10 or lower')),
  price_aed integer not null check (price_aed between 1 and 1000000),
  accept_bids boolean not null default true,
  city text,
  description text check (char_length(description) <= 1000),
  legit_checked boolean not null default false,
  status text not null default 'active' check (status in ('active','sold','removed')),
  created_at timestamptz not null default now()
);
create index on public.listings (status, created_at desc);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  path text not null,
  kind text check (kind in ('tag','side','label','box','sole','insole','other')),
  position int not null default 0
);

create table public.bids (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  amount_aed integer not null check (amount_aed between 1 and 1000000),
  status text not null default 'pending' check (status in ('pending','accepted','declined','withdrawn')),
  created_at timestamptz not null default now()
);
create index on public.bids (listing_id, amount_aed desc);

create table public.watches (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

-- ---------------------------------------------------------------------
-- LEGIT OR FAKE
-- ---------------------------------------------------------------------
create table public.checks (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  model text not null check (char_length(model) between 2 and 80),
  size text check (char_length(size) <= 10),
  price_aed integer check (price_aed between 0 and 1000000),
  found_where text check (found_where in ('Group chat','Instagram','Marketplace app','In person','Other')),
  question text check (char_length(question) <= 600),
  verdict text check (verdict in ('legit','fake')),
  verdict_note text check (char_length(verdict_note) <= 400),
  verdict_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index on public.checks (created_at desc);

create table public.check_photos (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks(id) on delete cascade,
  path text not null,
  position int not null default 0
);

create table public.check_votes (
  check_id uuid not null references public.checks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote text not null check (vote in ('legit','fake','unsure')),
  primary key (check_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.checks(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index on public.comments (check_id, created_at);

create table public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (comment_id, user_id)
);

-- ---------------------------------------------------------------------
-- REPORTS (moderation)
-- ---------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('listing','check','comment','user')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 3 and 500),
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.private_contacts enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.bids enable row level security;
alter table public.watches enable row level security;
alter table public.checks enable row level security;
alter table public.check_photos enable row level security;
alter table public.check_votes enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;
alter table public.reports enable row level security;

-- profiles: anyone can read; owners may edit only safe columns
create policy "profiles readable" on public.profiles for select using (true);
create policy "profiles self update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (username, display_name, city) on public.profiles to authenticated;

-- private contacts: only the owner
create policy "contact own read" on public.private_contacts for select using (user_id = auth.uid());
create policy "contact own update" on public.private_contacts for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- listings
create policy "listings readable" on public.listings for select using (status = 'active' or seller_id = auth.uid() or public.is_staff());
create policy "listings insert own" on public.listings for insert with check (seller_id = auth.uid() and not public.is_banned());
create policy "listings update own" on public.listings for update using (seller_id = auth.uid() or public.is_staff()) with check (seller_id = auth.uid() or public.is_staff());
revoke update on public.listings from authenticated, anon;
grant update (model, brand, size_eu, condition, price_aed, accept_bids, city, description, status) on public.listings to authenticated;

create policy "listing photos readable" on public.listing_photos for select using (true);
create policy "listing photos insert own" on public.listing_photos for insert
  with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
create policy "listing photos delete own" on public.listing_photos for delete
  using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));

-- bids: visible to the bidder and the seller; changes go through functions below
create policy "bids visible to parties" on public.bids for select using (
  bidder_id = auth.uid() or exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())
);
create policy "bids insert own" on public.bids for insert with check (
  bidder_id = auth.uid() and not public.is_banned()
  and exists (select 1 from public.listings l where l.id = listing_id and l.status = 'active' and l.accept_bids and l.seller_id <> auth.uid())
);

-- watches: own rows only
create policy "watches own" on public.watches for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- checks
create policy "checks readable" on public.checks for select using (true);
create policy "checks insert own" on public.checks for insert with check (author_id = auth.uid() and not public.is_banned() and verdict is null);
create policy "checks delete own" on public.checks for delete using (author_id = auth.uid() or public.is_staff());

create policy "check photos readable" on public.check_photos for select using (true);
create policy "check photos insert own" on public.check_photos for insert
  with check (exists (select 1 from public.checks c where c.id = check_id and c.author_id = auth.uid()));

-- votes: you see and change only your own; totals come from check_stats()
create policy "votes own" on public.check_votes for all using (user_id = auth.uid()) with check (user_id = auth.uid() and not public.is_banned());

-- comments
create policy "comments readable" on public.comments for select using (true);
create policy "comments insert own" on public.comments for insert with check (author_id = auth.uid() and not public.is_banned());
create policy "comments delete own" on public.comments for delete using (author_id = auth.uid() or public.is_staff());

create policy "likes readable" on public.comment_likes for select using (true);
create policy "likes own" on public.comment_likes for insert with check (user_id = auth.uid());
create policy "likes own delete" on public.comment_likes for delete using (user_id = auth.uid());

-- reports: anyone signed in can file; only staff can read
create policy "reports insert" on public.reports for insert with check (reporter_id = auth.uid());
create policy "reports staff read" on public.reports for select using (public.is_staff());
create policy "reports staff update" on public.reports for update using (public.is_staff());

-- ---------------------------------------------------------------------
-- FUNCTIONS (aggregates and actions that must not leak private rows)
-- ---------------------------------------------------------------------

-- bid count, highest bid and watchers for a set of listings
create or replace function public.listing_stats(ids uuid[])
returns table (listing_id uuid, bid_count int, high_bid int, watchers int)
language sql stable security definer set search_path = public as $$
  select l.id,
         (select count(*)::int from bids b where b.listing_id = l.id and b.status in ('pending','accepted')),
         (select max(amount_aed) from bids b where b.listing_id = l.id and b.status in ('pending','accepted')),
         (select count(*)::int from watches w where w.listing_id = l.id)
  from listings l where l.id = any(ids) and l.status = 'active'
$$;

-- "On Zenkicks" hot list: bids x2 + watchlist saves in the last 7 days
create or replace function public.hot_listings(max_rows int default 10)
returns table (listing_id uuid, score int)
language sql stable security definer set search_path = public as $$
  select l.id,
         (2 * (select count(*) from bids b where b.listing_id = l.id and b.created_at > now() - interval '7 days')
          + (select count(*) from watches w where w.listing_id = l.id and w.created_at > now() - interval '7 days'))::int as score
  from listings l where l.status = 'active'
  order by score desc, l.created_at desc
  limit least(max_rows, 50)
$$;

-- vote totals for a set of checks
create or replace function public.check_stats(ids uuid[])
returns table (check_id uuid, legit int, fake int, unsure int, comments int)
language sql stable security definer set search_path = public as $$
  select c.id,
         (select count(*)::int from check_votes v where v.check_id = c.id and v.vote = 'legit'),
         (select count(*)::int from check_votes v where v.check_id = c.id and v.vote = 'fake'),
         (select count(*)::int from check_votes v where v.check_id = c.id and v.vote = 'unsure'),
         (select count(*)::int from comments m where m.check_id = c.id)
  from checks c where c.id = any(ids)
$$;

-- likes count per comment for one check
create or replace function public.comment_like_counts(chk_id uuid)
returns table (comment_id uuid, likes int)
language sql stable security definer set search_path = public as $$
  select m.id, (select count(*)::int from comment_likes k where k.comment_id = m.id)
  from comments m where m.check_id = chk_id
$$;

-- seller accepts one bid (others stay pending until the seller marks the pair sold)
create or replace function public.accept_bid(bid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update bids b set status = 'accepted'
  from listings l
  where b.id = bid and l.id = b.listing_id and l.seller_id = auth.uid() and b.status = 'pending';
  if not found then raise exception 'Bid not found or not yours to accept'; end if;
end $$;

create or replace function public.decline_bid(bid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update bids b set status = 'declined'
  from listings l
  where b.id = bid and l.id = b.listing_id and l.seller_id = auth.uid() and b.status = 'pending';
end $$;

create or replace function public.withdraw_bid(bid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update bids set status = 'withdrawn' where id = bid and bidder_id = auth.uid() and status in ('pending','accepted');
end $$;

-- after a bid is accepted, each side can see the other's WhatsApp number
create or replace function public.deal_contact(bid uuid)
returns table (username text, whatsapp text)
language sql stable security definer set search_path = public as $$
  select p.username, pc.whatsapp
  from bids b
  join listings l on l.id = b.listing_id
  join profiles p on p.id = case when auth.uid() = b.bidder_id then l.seller_id else b.bidder_id end
  left join private_contacts pc on pc.user_id = p.id
  where b.id = bid and b.status = 'accepted' and auth.uid() in (b.bidder_id, l.seller_id)
$$;

-- checkers and admins post the final verdict
create or replace function public.set_verdict(chk uuid, v text, note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Only checkers can post a verdict'; end if;
  if v not in ('legit','fake') then raise exception 'Verdict must be legit or fake'; end if;
  update checks set verdict = v, verdict_note = left(note, 400), verdict_by = auth.uid() where id = chk;
end $$;

revoke all on function public.accept_bid(uuid), public.decline_bid(uuid), public.withdraw_bid(uuid),
  public.deal_contact(uuid), public.set_verdict(uuid, text, text) from anon;

-- ---------------------------------------------------------------------
-- VOUCHES: 1-5 star ratings between members
--   deal  : buyer and seller rate each other after a bid is accepted
--   legit : the poster of a legit check rates people who helped in the comments
-- ---------------------------------------------------------------------
create table public.vouches (
  id uuid primary key default gen_random_uuid(),
  from_id uuid not null references public.profiles(id) on delete cascade,
  to_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('deal','legit')),
  ref_id uuid not null,
  stars int not null check (stars between 1 and 5),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (from_id, to_id, ref_id),
  check (from_id <> to_id)
);
create index on public.vouches (to_id, created_at desc);
alter table public.vouches enable row level security;
create policy "vouches readable" on public.vouches for select using (true);
-- no direct insert/update: everything goes through give_vouch()

create or replace function public.give_vouch(target uuid, ref uuid, k text, s int, msg text)
returns void language plpgsql security definer set search_path = public as $$
declare ok boolean := false;
begin
  if auth.uid() is null or public.is_banned() then raise exception 'Sign in to vouch'; end if;
  if target = auth.uid() then raise exception 'You cannot vouch for yourself'; end if;
  if s < 1 or s > 5 then raise exception 'Pick 1 to 5 stars'; end if;
  if k = 'deal' then
    select exists (
      select 1 from bids b join listings l on l.id = b.listing_id
      where l.id = ref and b.status = 'accepted'
        and ((b.bidder_id = auth.uid() and l.seller_id = target) or (l.seller_id = auth.uid() and b.bidder_id = target))
    ) into ok;
    if not ok then raise exception 'You can only rate someone you made a deal with'; end if;
  elsif k = 'legit' then
    select exists (
      select 1 from checks c where c.id = ref and c.author_id = auth.uid()
        and exists (select 1 from comments m where m.check_id = c.id and m.author_id = target)
    ) into ok;
    if not ok then raise exception 'Only the poster can vouch for people who helped on this check'; end if;
  else
    raise exception 'Unknown vouch type';
  end if;
  insert into vouches (from_id, to_id, kind, ref_id, stars, note)
  values (auth.uid(), target, k, ref, s, nullif(left(trim(coalesce(msg, '')), 280), ''))
  on conflict (from_id, to_id, ref_id) do update set stars = excluded.stars, note = excluded.note, created_at = now();
end $$;

-- average stars and counts for a set of members
create or replace function public.vouch_summary(ids uuid[])
returns table (user_id uuid, avg_stars numeric, total int, deals int, legit int)
language sql stable security definer set search_path = public as $$
  select v.to_id, round(avg(v.stars)::numeric, 1), count(*)::int,
         count(*) filter (where v.kind = 'deal')::int, count(*) filter (where v.kind = 'legit')::int
  from vouches v where v.to_id = any(ids) group by v.to_id
$$;

revoke all on function public.give_vouch(uuid, uuid, text, int, text) from anon;

-- ---------------------------------------------------------------------
-- STORAGE: public photo buckets; users upload only into their own folder
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('listing-photos', 'listing-photos', true, 5242880, array['image/jpeg','image/png','image/webp']),
       ('check-photos', 'check-photos', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "photos public read" on storage.objects for select
  using (bucket_id in ('listing-photos','check-photos'));
create policy "photos upload own folder" on storage.objects for insert to authenticated
  with check (bucket_id in ('listing-photos','check-photos') and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned());
create policy "photos delete own folder" on storage.objects for delete to authenticated
  using (bucket_id in ('listing-photos','check-photos') and (storage.foldername(name))[1] = auth.uid()::text);
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


-- =====================================================================
-- (appended) moderation.sql: OG badge, warnings, suspensions, Trusted Seller
-- =====================================================================
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


-- =====================================================================
-- (appended) verified-members.sql
-- =====================================================================
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


-- =====================================================================
-- ZENKICKS: Cop or Drop votes, Grail list + alerts, my sneaker size
-- Safe to run more than once.
-- =====================================================================

-- my sneaker size (stored in EU; the app shows US and EU)
alter table public.profiles add column if not exists size_eu numeric(4,1);
grant update (size_eu) on public.profiles to authenticated;

-- ---------- Cop or Drop ----------
create table if not exists public.drop_votes (
  release_key text not null check (length(release_key) between 3 and 200),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  vote smallint not null check (vote in (1, -1)),
  created_at timestamptz not null default now(),
  primary key (release_key, user_id)
);
alter table public.drop_votes enable row level security;
drop policy if exists "drop votes own read" on public.drop_votes;
drop policy if exists "drop votes own insert" on public.drop_votes;
drop policy if exists "drop votes own update" on public.drop_votes;
drop policy if exists "drop votes own delete" on public.drop_votes;
create policy "drop votes own read" on public.drop_votes for select using (user_id = auth.uid());
create policy "drop votes own insert" on public.drop_votes for insert with check (user_id = auth.uid() and not public.is_banned());
create policy "drop votes own update" on public.drop_votes for update using (user_id = auth.uid()) with check (user_id = auth.uid() and not public.is_banned());
create policy "drop votes own delete" on public.drop_votes for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.drop_votes to authenticated;

-- totals for a list of releases (anyone can see the percentages)
create or replace function public.drop_vote_stats(keys text[])
returns table (release_key text, cops int, drops int, mine smallint)
language sql stable security definer set search_path = public as $$
  select k.key,
         (select count(*)::int from drop_votes v where v.release_key = k.key and v.vote = 1),
         (select count(*)::int from drop_votes v where v.release_key = k.key and v.vote = -1),
         (select v.vote from drop_votes v where v.release_key = k.key and v.user_id = auth.uid())
  from unnest(keys[1:60]) as k(key)
$$;
grant execute on function public.drop_vote_stats(text[]) to anon, authenticated;

-- ---------- Grails ----------
create table if not exists public.grails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model text not null check (length(trim(model)) between 2 and 80),
  size_eu numeric(4,1),
  created_at timestamptz not null default now()
);
create index if not exists grails_user_idx on public.grails (user_id);
alter table public.grails enable row level security;
drop policy if exists "grails own read" on public.grails;
drop policy if exists "grails own insert" on public.grails;
drop policy if exists "grails own delete" on public.grails;
create policy "grails own read" on public.grails for select using (user_id = auth.uid());
create policy "grails own insert" on public.grails for insert with check (user_id = auth.uid() and (select count(*) from public.grails g where g.user_id = auth.uid()) < 20);
create policy "grails own delete" on public.grails for delete using (user_id = auth.uid());
grant select, insert, delete on public.grails to authenticated;

-- every key word of the grail must appear in the listing (so "Jordan 4 Bred" finds "Air Jordan 4 Retro Bred Reimagined")
create or replace function public.zk_words_match(needle text, hay text)
returns boolean language sql immutable as $$
  select not exists (
    select 1 from unnest(regexp_split_to_array(lower(regexp_replace(coalesce(needle, ''), '[^a-zA-Z0-9.]+', ' ', 'g')), ' ')) w
    where w <> '' and w not in ('air', 'retro', 'og', 'nike', 'the', 'and', 'x', 'sp', 'qs', 'mens', 'womens', 'w')
      and position(w in lower(regexp_replace(coalesce(hay, ''), '[^a-zA-Z0-9.]+', ' ', 'g'))) = 0
  )
$$;

-- active listings (from other members) that match my grails
create or replace function public.my_grail_matches()
returns table (grail_id uuid, grail_model text, listing_id uuid, listed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select g.id, g.model, l.id, l.created_at
  from grails g
  join listings l on l.status = 'active' and l.seller_id <> g.user_id
   and zk_words_match(g.model, l.model || ' ' || coalesce(l.brand, ''))
   and (g.size_eu is null or l.size_eu = g.size_eu)
  where g.user_id = auth.uid()
  order by l.created_at desc
  limit 60
$$;
grant execute on function public.my_grail_matches() to authenticated;
