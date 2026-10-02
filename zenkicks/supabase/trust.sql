-- =====================================================================
-- ZENKICKS: trust layer
-- 1. "Deal done": after a bid is accepted, buyer and seller each confirm
--    the deal happened. Ratings for a deal unlock only when BOTH confirmed.
--    Seller confirming also marks the pair as sold.
-- 2. "Deal fell through": either side can cancel an accepted deal that
--    isn't confirmed by both yet.
-- 3. Verified seller: members ask for verification; the owner/admins check
--    them over a WhatsApp video call (Emirates ID shown on camera, nothing
--    stored) and give the "Verified seller" badge (verified_level = 'id').
-- 4. Buyers can still open a listing after it is sold (to confirm and rate).
-- Safe to run more than once.
-- =====================================================================

alter table public.bids add column if not exists buyer_done_at timestamptz;
alter table public.bids add column if not exists seller_done_at timestamptz;

-- a buyer with an accepted bid can still see the listing after it's marked sold
-- (helper runs without row security, so listings -> bids -> listings policies don't loop)
create or replace function public.zk_my_accepted(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from bids b where b.listing_id = lid and b.bidder_id = auth.uid() and b.status = 'accepted')
$$;
grant execute on function public.zk_my_accepted(uuid) to anon, authenticated;
drop policy if exists "listings readable" on public.listings;
create policy "listings readable" on public.listings for select using (
  status = 'active' or seller_id = auth.uid() or public.is_staff() or (auth.uid() is not null and public.zk_my_accepted(id))
);

-- confirm my side of a deal. Returns 'waiting' (other side hasn't confirmed) or 'done'
create or replace function public.confirm_deal(bid uuid)
returns text language plpgsql volatile security definer set search_path = public as $$
declare b bids; l listings;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into b from bids where id = bid;
  if not found or b.status <> 'accepted' then raise exception 'This deal is not open'; end if;
  select * into l from listings where id = b.listing_id;
  if auth.uid() = b.bidder_id then
    update bids set buyer_done_at = coalesce(buyer_done_at, now()) where id = bid returning * into b;
  elsif auth.uid() = l.seller_id then
    update bids set seller_done_at = coalesce(seller_done_at, now()) where id = bid returning * into b;
    update listings set status = 'sold' where id = l.id and status = 'active';
  else
    raise exception 'Not your deal';
  end if;
  return case when b.buyer_done_at is not null and b.seller_done_at is not null then 'done' else 'waiting' end;
end $$;

-- the deal didn't happen: seller -> bid declined (pair goes back on sale), buyer -> bid withdrawn
create or replace function public.cancel_deal(bid uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare b bids; l listings;
begin
  select * into b from bids where id = bid;
  if not found or b.status <> 'accepted' then raise exception 'This deal is not open'; end if;
  if b.buyer_done_at is not null and b.seller_done_at is not null then raise exception 'Both of you already confirmed this deal'; end if;
  select * into l from listings where id = b.listing_id;
  if auth.uid() = l.seller_id then
    update bids set status = 'declined', buyer_done_at = null, seller_done_at = null where id = bid;
    update listings set status = 'active' where id = l.id and status = 'sold'
      and not exists (select 1 from bids x where x.listing_id = l.id and x.status = 'accepted' and x.id <> bid);
  elsif auth.uid() = b.bidder_id then
    update bids set status = 'withdrawn', buyer_done_at = null, seller_done_at = null where id = bid;
  else
    raise exception 'Not your deal';
  end if;
end $$;

-- my open and finished deals (as buyer or seller), newest first
create or replace function public.my_deals()
returns table (bid_id uuid, listing_id uuid, model text, amount_aed int, role text, other_id uuid, other_username text,
  me_done boolean, other_done boolean, rated boolean, accepted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.id, l.id, l.model, b.amount_aed,
         case when b.bidder_id = auth.uid() then 'buyer' else 'seller' end,
         o.id, o.username,
         case when b.bidder_id = auth.uid() then b.buyer_done_at is not null else b.seller_done_at is not null end,
         case when b.bidder_id = auth.uid() then b.seller_done_at is not null else b.buyer_done_at is not null end,
         exists (select 1 from vouches v where v.from_id = auth.uid() and v.to_id = o.id and v.ref_id = l.id),
         b.created_at
  from bids b join listings l on l.id = b.listing_id
  join profiles o on o.id = case when b.bidder_id = auth.uid() then l.seller_id else b.bidder_id end
  where b.status = 'accepted' and auth.uid() in (b.bidder_id, l.seller_id)
  order by (case when b.bidder_id = auth.uid() then b.buyer_done_at is null else b.seller_done_at is null end) desc, b.created_at desc
  limit 30
$$;

-- deal ratings now need both sides to have confirmed "Deal done"
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
      where l.id = ref and b.status = 'accepted' and b.buyer_done_at is not null and b.seller_done_at is not null
        and ((b.bidder_id = auth.uid() and l.seller_id = target) or (l.seller_id = auth.uid() and b.bidder_id = target))
    ) into ok;
    if not ok then raise exception 'You can rate after you both tap Deal done'; end if;
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

-- ratings summary + finished deals for a set of members (one row per member that has either)
drop function if exists public.vouch_summary(uuid[]);
create function public.vouch_summary(ids uuid[])
returns table (user_id uuid, avg_stars numeric, total int, deals int, legit int, deal_avg numeric, trusted boolean, deals_done int)
language sql stable security definer set search_path = public as $$
  with v as (
    select v.to_id as uid, round(avg(v.stars)::numeric, 1) as avg_stars, count(*)::int as total,
           count(*) filter (where v.kind = 'deal')::int as deals, count(*) filter (where v.kind = 'legit')::int as legit,
           round((avg(v.stars) filter (where v.kind = 'deal'))::numeric, 1) as deal_avg,
           (count(*) filter (where v.kind = 'deal') >= 5 and avg(v.stars) filter (where v.kind = 'deal') >= 4.5) as trusted
    from vouches v where v.to_id = any(ids) group by v.to_id
  ), d as (
    select u.id as uid, count(*)::int as n
    from unnest(ids) u(id)
    join bids b on b.status = 'accepted' and b.buyer_done_at is not null and b.seller_done_at is not null
    join listings l on l.id = b.listing_id and u.id in (b.bidder_id, l.seller_id)
    group by u.id
  )
  select coalesce(v.uid, d.uid), v.avg_stars, coalesce(v.total, 0), coalesce(v.deals, 0), coalesce(v.legit, 0),
         v.deal_avg, coalesce(v.trusted, false), coalesce(d.n, 0)
  from v full join d on d.uid = v.uid
$$;

-- ---------- Verified seller ----------
create table if not exists public.verify_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'done', 'rejected')),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  handled_by uuid references public.profiles(id) on delete set null,
  handled_at timestamptz
);
alter table public.verify_requests enable row level security;
drop policy if exists "verify own read" on public.verify_requests;
create policy "verify own read" on public.verify_requests for select using (user_id = auth.uid() or public.is_admin());
revoke insert, update, delete on public.verify_requests from anon, authenticated;
grant select on public.verify_requests to authenticated;

-- member asks to be verified (needs a WhatsApp number so the team can reach them)
create or replace function public.request_verify(p_note text default null)
returns text language plpgsql volatile security definer set search_path = public as $$
declare wa text; lvl text;
begin
  if auth.uid() is null then return 'signin'; end if;
  if public.is_banned() then return 'blocked'; end if;
  select verified_level into lvl from profiles where id = auth.uid();
  if lvl = 'id' then return 'already'; end if;
  select whatsapp into wa from private_contacts where user_id = auth.uid();
  if coalesce(wa, '') = '' then return 'nowhatsapp'; end if;
  insert into verify_requests (user_id, note) values (auth.uid(), nullif(left(trim(coalesce(p_note, '')), 300), ''))
  on conflict (user_id) do update set status = 'pending', note = excluded.note, created_at = now(), handled_by = null, handled_at = null
    where verify_requests.status <> 'pending';
  return 'ok';
end $$;

-- admins: who is waiting (with WhatsApp so you can video-call them)
create or replace function public.admin_verify_queue()
returns table (user_id uuid, username text, whatsapp text, note text, requested_at timestamptz, deals_done int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  return query
    select r.user_id, p.username, pc.whatsapp, r.note, r.created_at,
      (select count(*)::int from bids b join listings l on l.id = b.listing_id
        where b.status = 'accepted' and b.buyer_done_at is not null and b.seller_done_at is not null and r.user_id in (b.bidder_id, l.seller_id))
    from verify_requests r join profiles p on p.id = r.user_id left join private_contacts pc on pc.user_id = r.user_id
    where r.status = 'pending' order by r.created_at;
end $$;

-- admins: approve (badge on) / reject a request, or remove a badge later
create or replace function public.admin_verify(target uuid, approve boolean)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if approve then
    update profiles set verified_level = 'id' where id = target;
  else
    update profiles set verified_level = case when verified_level = 'id' then 'email' else verified_level end where id = target;
  end if;
  insert into verify_requests (user_id, status, handled_by, handled_at) values (target, case when approve then 'done' else 'rejected' end, auth.uid(), now())
  on conflict (user_id) do update set status = excluded.status, handled_by = auth.uid(), handled_at = now();
end $$;

revoke all on function public.confirm_deal(uuid), public.cancel_deal(uuid), public.my_deals(), public.request_verify(text),
  public.admin_verify_queue(), public.admin_verify(uuid, boolean), public.give_vouch(uuid, uuid, text, int, text) from public, anon;
grant execute on function public.confirm_deal(uuid), public.cancel_deal(uuid), public.my_deals(), public.request_verify(text),
  public.admin_verify_queue(), public.admin_verify(uuid, boolean), public.give_vouch(uuid, uuid, text, int, text) to authenticated;
grant execute on function public.vouch_summary(uuid[]) to anon, authenticated;
