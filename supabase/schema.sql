-- ============================================================================
-- Compounding Growth Tracker — Supabase schema
-- Run this whole file once in the Supabase SQL editor (Project > SQL Editor).
-- Safe to re-run on a fresh project. NOT idempotent against a half-built one —
-- if you need to re-run after an error, drop the objects first.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. TABLES
-- ----------------------------------------------------------------------------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  flagship_priority text,
  created_at timestamptz not null default now()
);

create table if not exists daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  log_date date not null,
  dwu int not null default 0 check (dwu >= 0),
  sleep_hours numeric check (sleep_hours is null or (sleep_hours >= 0 and sleep_hours <= 24)),
  moved boolean not null default false,
  shipped boolean not null default false,
  shipped_note text,
  floor_mode boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  week_start date not null,
  category text not null check (category in ('skill','asset','opportunity','positioning')),
  description text not null,
  points int not null,
  created_at timestamptz not null default now()
);

create table if not exists sprint_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  description text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists partnerships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references profiles(id) on delete cascade,
  partner_id uuid references profiles(id) on delete cascade,
  invite_code text unique not null,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  share_level text not null default 'summary_only' check (share_level in ('summary_only','full_daily')),
  created_at timestamptz not null default now(),
  constraint no_self_partner check (partner_id is null or partner_id <> requester_id)
);

-- Stretch feature: lightweight partner nudge messages.
create table if not exists partner_messages (
  id uuid primary key default gen_random_uuid(),
  partnership_id uuid not null references partnerships(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Stretch feature: per-user scoring weight overrides, off by default. When
-- enabled = false (the default), every user gets the spec's fixed weights
-- (0.55/0.20/0.25 for G_day, 0.60/0.40 for WCS) — see the views below.
create table if not exists scoring_settings (
  user_id uuid primary key references profiles(id) on delete cascade,
  enabled boolean not null default false,
  e_weight numeric not null default 0.55 check (e_weight >= 0 and e_weight <= 1),
  a_weight numeric not null default 0.20 check (a_weight >= 0 and a_weight <= 1),
  s_weight numeric not null default 0.25 check (s_weight >= 0 and s_weight <= 1),
  g_weight numeric not null default 0.60 check (g_weight >= 0 and g_weight <= 1),
  o_weight numeric not null default 0.40 check (o_weight >= 0 and o_weight <= 1),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. SCORING VIEWS
-- All scoring math lives here so the frontend only ever selects numbers.
--
-- NOTE on security_invoker: Postgres views normally run with the view
-- owner's privileges, and in Supabase the owner is a superuser that
-- bypasses RLS — so without security_invoker = true, every view below would
-- silently leak every user's rows to every other user. Setting it makes
-- each view run as the querying (authenticated) role instead, so the RLS
-- policies on the underlying tables are what actually decide what comes
-- back. Requires Postgres 15+ (Supabase's current default).
-- ----------------------------------------------------------------------------

-- Per-user weekly ledger totals (O_week), by ISO week starting Monday.
create or replace view weekly_ledger
with (security_invoker = true) as
select
  user_id,
  week_start,
  least(sum(points) filter (where category = 'skill'), 24)        as skill_subtotal,
  least(sum(points) filter (where category = 'asset'), 36)        as asset_subtotal,
  least(sum(points) filter (where category = 'opportunity'), 30)  as opportunity_subtotal,
  least(sum(points) filter (where category = 'positioning'), 18)  as positioning_subtotal,
  least(
    coalesce(least(sum(points) filter (where category = 'skill'), 24), 0)
    + coalesce(least(sum(points) filter (where category = 'asset'), 36), 0)
    + coalesce(least(sum(points) filter (where category = 'opportunity'), 30), 0)
    + coalesce(least(sum(points) filter (where category = 'positioning'), 18), 0),
    100
  ) as o_week
from ledger_entries
group by user_id, week_start;

-- Daily score (G_day). Reads scoring_settings when a user has opted into
-- custom weights (enabled = true); otherwise falls back to the spec's fixed
-- weights. The COALESCE covers both "no settings row yet" and "row exists
-- but enabled = false", since the LEFT JOIN only matches when ss.enabled.
create or replace view daily_scores
with (security_invoker = true) as
select
  d.id,
  d.user_id,
  d.log_date,
  d.dwu,
  d.sleep_hours,
  d.moved,
  d.shipped,
  d.shipped_note,
  d.floor_mode,
  (least(d.dwu, 4) / 4.0) as e_score,
  (
    0.7 * (case
             when d.sleep_hours is null then 0
             when d.sleep_hours >= 7 then 1
             when d.sleep_hours >= 6 then 0.5
             else 0
           end)
    + 0.3 * (d.moved::int)
  ) as a_score,
  (d.shipped::int)::numeric as s_score,
  round(
    100 * (
      coalesce(ss.e_weight, 0.55) * (least(d.dwu, 4) / 4.0)
      + coalesce(ss.a_weight, 0.20) * (
          0.7 * (case
                   when d.sleep_hours is null then 0
                   when d.sleep_hours >= 7 then 1
                   when d.sleep_hours >= 6 then 0.5
                   else 0
                 end)
          + 0.3 * (d.moved::int)
        )
      + coalesce(ss.s_weight, 0.25) * (d.shipped::int)
    )
  )::int as g_day
from daily_logs d
left join scoring_settings ss on ss.user_id = d.user_id and ss.enabled;

-- Weekly compounding score (WCS): 0.60 * (7-day G_day avg, excluding
-- floor_mode days) + 0.40 * O_week by default, or a user's custom split.
create or replace view weekly_scores
with (security_invoker = true) as
with day_weeks as (
  select
    user_id,
    (log_date - ((extract(isodow from log_date)::int - 1) || ' days')::interval)::date as week_start,
    g_day,
    floor_mode
  from daily_scores
),
day_avgs as (
  select
    user_id,
    week_start,
    avg(g_day) filter (where not floor_mode) as g_day_avg,
    count(*) as days_logged,
    count(*) filter (where not floor_mode) as days_counted
  from day_weeks
  group by user_id, week_start
),
combined as (
  select
    coalesce(da.user_id, wl.user_id) as user_id,
    coalesce(da.week_start, wl.week_start) as week_start,
    da.g_day_avg,
    coalesce(wl.o_week, 0) as o_week,
    da.days_logged,
    da.days_counted
  from day_avgs da
  full outer join weekly_ledger wl
    on wl.user_id = da.user_id and wl.week_start = da.week_start
)
select
  c.user_id,
  c.week_start,
  round(coalesce(c.g_day_avg, 0))::int as g_day_avg,
  c.o_week,
  c.days_logged,
  c.days_counted,
  round(
    coalesce(ss.g_weight, 0.60) * coalesce(c.g_day_avg, 0) + coalesce(ss.o_weight, 0.40) * c.o_week
  )::int as wcs
from combined c
left join scoring_settings ss on ss.user_id = c.user_id and ss.enabled;

-- ----------------------------------------------------------------------------
-- 3. AUTO-PROVISION PROFILE + SEED SPRINT TARGETS ON SIGNUP
-- ----------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));

  insert into sprint_targets (user_id, description, completed) values
    (new.id, 'Flagship milestone shipped', false),
    (new.id, '5 outreach contacts made', false),
    (new.id, 'Portfolio piece done', false),
    (new.id, 'Shortlist + draft written', false);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ----------------------------------------------------------------------------

alter table profiles enable row level security;
alter table daily_logs enable row level security;
alter table ledger_entries enable row level security;
alter table sprint_targets enable row level security;
alter table partnerships enable row level security;
alter table partner_messages enable row level security;
alter table scoring_settings enable row level security;

-- profiles: a user can read/write only their own profile row.
-- (Partner display names are exposed only via get_partnership_display_name
-- below, not by relaxing this policy.)
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- daily_logs: strictly own rows.
drop policy if exists daily_logs_self on daily_logs;
create policy daily_logs_self on daily_logs
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ledger_entries: strictly own rows.
drop policy if exists ledger_entries_self on ledger_entries;
create policy ledger_entries_self on ledger_entries
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- sprint_targets: strictly own rows.
drop policy if exists sprint_targets_self on sprint_targets;
create policy sprint_targets_self on sprint_targets
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- scoring_settings: strictly own row.
drop policy if exists scoring_settings_self on scoring_settings;
create policy scoring_settings_self on scoring_settings
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- partnerships: visible to either side of the relationship.
drop policy if exists partnerships_select on partnerships;
create policy partnerships_select on partnerships
  for select
  using (requester_id = auth.uid() or partner_id = auth.uid());

drop policy if exists partnerships_insert on partnerships;
create policy partnerships_insert on partnerships
  for insert
  with check (requester_id = auth.uid());

-- Either party may update status (accept/decline); only the requester may
-- change other fields such as share_level, enforced by the check clause
-- allowing updates from either side but requiring requester_id stay theirs.
drop policy if exists partnerships_update on partnerships;
create policy partnerships_update on partnerships
  for update
  using (requester_id = auth.uid() or partner_id = auth.uid())
  with check (requester_id = auth.uid() or partner_id = auth.uid());

drop policy if exists partnerships_delete on partnerships;
create policy partnerships_delete on partnerships
  for delete
  using (requester_id = auth.uid() or partner_id = auth.uid());

-- partner_messages: visible to members of an accepted partnership only.
drop policy if exists partner_messages_select on partner_messages;
create policy partner_messages_select on partner_messages
  for select
  using (
    exists (
      select 1 from partnerships p
      where p.id = partnership_id
        and (p.requester_id = auth.uid() or p.partner_id = auth.uid())
        and p.status = 'accepted'
    )
  );

drop policy if exists partner_messages_insert on partner_messages;
create policy partner_messages_insert on partner_messages
  for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from partnerships p
      where p.id = partnership_id
        and (p.requester_id = auth.uid() or p.partner_id = auth.uid())
        and p.status = 'accepted'
    )
  );

-- IMPORTANT: there is deliberately NO cross-user select policy on
-- daily_logs / ledger_entries. Partner access only ever goes through the
-- security-definer functions below, which check for an accepted
-- partnership and (for daily-level data) the sharer's chosen share_level
-- before returning anything.

-- ----------------------------------------------------------------------------
-- 5. PARTNER SUMMARY FUNCTIONS (SECURITY DEFINER)
-- ----------------------------------------------------------------------------

-- Weekly aggregate summary — always allowed once a partnership is accepted,
-- regardless of share_level, since this is the "summary_only" tier.
create or replace function get_partner_summary(target_user uuid)
returns table (
  week_start date,
  g_day_avg int,
  o_week int,
  wcs int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from partnerships
    where status = 'accepted'
      and ((requester_id = auth.uid() and partner_id = target_user)
        or (partner_id = auth.uid() and requester_id = target_user))
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select ws.week_start, ws.g_day_avg, ws.o_week, ws.wcs
    from weekly_scores ws
    where ws.user_id = target_user
    order by ws.week_start desc;
end;
$$;

-- Current streak + display name for the partner panel. Streak is derived
-- from daily_logs (any row counts, floor_mode included), so this function
-- does not leak the underlying daily content — just a count and a name.
create or replace function get_partner_profile_summary(target_user uuid)
returns table (
  display_name text,
  current_streak int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  streak int := 0;
  cursor_date date := current_date;
begin
  if not exists (
    select 1 from partnerships
    where status = 'accepted'
      and ((requester_id = auth.uid() and partner_id = target_user)
        or (partner_id = auth.uid() and requester_id = target_user))
  ) then
    raise exception 'not authorized';
  end if;

  if not exists (select 1 from daily_logs where user_id = target_user and log_date = cursor_date) then
    cursor_date := cursor_date - 1;
  end if;

  loop
    exit when not exists (
      select 1 from daily_logs where user_id = target_user and log_date = cursor_date
    );
    streak := streak + 1;
    cursor_date := cursor_date - 1;
  end loop;

  return query
    select p.display_name, streak
    from profiles p
    where p.id = target_user;
end;
$$;

-- Daily-level detail, only returned when the sharer opted into 'full_daily'.
create or replace function get_partner_daily(target_user uuid, days_back int default 14)
returns table (
  log_date date,
  g_day int,
  floor_mode boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from partnerships
    where status = 'accepted'
      and share_level = 'full_daily'
      and ((requester_id = auth.uid() and partner_id = target_user)
        or (partner_id = auth.uid() and requester_id = target_user))
  ) then
    raise exception 'not authorized or sharer has not enabled full_daily sharing';
  end if;

  return query
    select ds.log_date, ds.g_day, ds.floor_mode
    from daily_scores ds
    where ds.user_id = target_user
      and ds.log_date >= current_date - days_back
    order by ds.log_date asc;
end;
$$;

-- Create a pending invite as the requester. Generates a short shareable code.
create or replace function create_partner_invite()
returns table (id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  new_id uuid;
begin
  new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 7));
  insert into partnerships (requester_id, invite_code, status, share_level)
  values (auth.uid(), new_code, 'pending', 'summary_only')
  returning partnerships.id, partnerships.invite_code into new_id, new_code;

  return query select new_id, new_code;
end;
$$;

-- Redeem someone else's invite code: attaches the caller as partner_id on
-- the matching pending row. Status stays 'pending' until the requester (or
-- the redeemer) explicitly accepts via the normal partnerships update policy.
create or replace function redeem_partner_invite(code text)
returns table (id uuid, requester_id uuid, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target partnerships%rowtype;
begin
  select * into target from partnerships
  where invite_code = upper(code) and partner_id is null;

  if not found then
    raise exception 'Invite code not found or already used';
  end if;

  if target.requester_id = auth.uid() then
    raise exception 'You cannot redeem your own invite code';
  end if;

  update partnerships set partner_id = auth.uid()
  where partnerships.id = target.id;

  return query select target.id, target.requester_id, target.status;
end;
$$;

-- Lets either side of a (pending or accepted) partnership see the other
-- party's display name, without opening up the profiles table generally.
create or replace function get_partnership_display_name(partnership_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  p partnerships%rowtype;
  other_id uuid;
  name text;
begin
  select * into p from partnerships where id = partnership_id;
  if not found then
    raise exception 'Partnership not found';
  end if;
  if p.requester_id <> auth.uid() and p.partner_id <> auth.uid() then
    raise exception 'not authorized';
  end if;
  other_id := case when p.requester_id = auth.uid() then p.partner_id else p.requester_id end;
  if other_id is null then
    return null;
  end if;
  select display_name into name from profiles where id = other_id;
  return name;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. HELPFUL INDEXES
-- ----------------------------------------------------------------------------

create index if not exists idx_daily_logs_user_date on daily_logs (user_id, log_date desc);
create index if not exists idx_ledger_entries_user_week on ledger_entries (user_id, week_start desc);
create index if not exists idx_partnerships_requester on partnerships (requester_id);
create index if not exists idx_partnerships_partner on partnerships (partner_id);
create index if not exists idx_partnerships_invite_code on partnerships (invite_code);
create index if not exists idx_partner_messages_partnership on partner_messages (partnership_id, created_at desc);

-- Done. Next: copy your Project URL + anon key into .env (see README), then
-- `npm install && npm run dev`.
