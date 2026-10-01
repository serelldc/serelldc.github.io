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
