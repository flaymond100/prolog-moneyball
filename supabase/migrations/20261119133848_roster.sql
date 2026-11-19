-- roster_entries: the signed riders of a season as scouted, with the power
-- numbers they reported and the staff's notes (Roster 2027 view, requested by
-- Kosta on 19 November 2026). Riders need not be synced from intervals.icu yet;
-- `athlete_id` links the row once they are.
--
-- No rider data in this migration: the repo is public. Rows are entered on the
-- live database (coach writes).
--
-- Visibility:
--   * tier, base, power, scores and scouting notes: all staff (performance, KB §11)
--   * weight_kg: coach and medical only (KB §5, §11), as on the other tables
--   * staff_notes (call notes: job, availability, personal circumstances): coach only
-- Client roles read the table without those two columns; v_roster returns every
-- column with the restricted ones nulled for roles that may not see them.

-- enums ---------------------------------------------------------------------

create type public.roster_tier as enum ('ambassador', 'core', 'development');

-- How the reported numbers were obtained, when not a clean maximal test.
create type public.roster_data_quality as enum ('modelled', 'sub_maximal', 'garmin_estimate');

-- table ---------------------------------------------------------------------

create table public.roster_entries (
  id uuid primary key default gen_random_uuid(),
  season smallint not null check (season between 2026 and 2100),
  rider_name text not null check (btrim(rider_name) <> ''),
  athlete_id text references public.athletes (id) on delete set null,
  tier public.roster_tier not null,
  base text,
  weight_kg numeric check (weight_kg between 35 and 100),
  -- Reported best power and W/kg as entered (sheet values, not recomputed).
  p20m_w numeric check (p20m_w > 0),
  p20m_wkg numeric check (p20m_wkg > 0),
  p5m_w numeric check (p5m_w > 0),
  p5m_wkg numeric check (p5m_wkg > 0),
  p1m_w numeric check (p1m_w > 0),
  p1m_wkg numeric check (p1m_wkg > 0),
  data_quality public.roster_data_quality,
  race_score smallint check (race_score between 1 and 5),
  team_score smallint check (team_score between 1 and 5),
  total_score smallint generated always as (race_score + team_score) stored,
  scouting_notes text,
  staff_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint roster_entries_one_per_season unique (season, rider_name),
  constraint roster_entries_athlete_once_per_season unique (season, athlete_id)
);

comment on table public.roster_entries is
  'Signed riders per season with reported power, scores and notes; coach writes, staff read (kg and call notes restricted).';

create index roster_entries_athlete_id_idx on public.roster_entries (athlete_id);

create trigger roster_entries_set_updated_at
  before update on public.roster_entries
  for each row execute function public.set_updated_at();

-- RLS -----------------------------------------------------------------------

alter table public.roster_entries enable row level security;

create policy "Staff read roster entries"
  on public.roster_entries for select to authenticated
  using ((select public.is_staff()));

create policy "Coach inserts roster entries"
  on public.roster_entries for insert to authenticated
  with check ((select public.has_role('coach')));

create policy "Coach updates roster entries"
  on public.roster_entries for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));

create policy "Coach deletes roster entries"
  on public.roster_entries for delete to authenticated
  using ((select public.has_role('coach')));

-- Column grants: no client role reads weight_kg or staff_notes directly
-- (a table-level grant would override column revokes, see 20261020121136).

revoke select on public.roster_entries from anon, authenticated;
grant select (
  id, season, rider_name, athlete_id, tier, base, p20m_w, p20m_wkg, p5m_w, p5m_wkg, p1m_w,
  p1m_wkg, data_quality, race_score, team_score, total_score, scouting_notes, created_at, updated_at
) on public.roster_entries to authenticated;

-- v_roster ------------------------------------------------------------------
-- Every column for staff, with kg for coach and medical and call notes for the
-- coach. Runs with its owner's rights (it reads the revoked columns), so the
-- staff and role checks are part of the view.

create view public.v_roster
with (security_barrier)
as
select r.id, r.season, r.rider_name, r.athlete_id, r.tier, r.base,
       case when (select public.has_role('coach')) or (select public.has_role('medical'))
            then r.weight_kg end as weight_kg,
       r.p20m_w, r.p20m_wkg, r.p5m_w, r.p5m_wkg, r.p1m_w, r.p1m_wkg,
       r.data_quality, r.race_score, r.team_score, r.total_score, r.scouting_notes,
       case when (select public.has_role('coach')) then r.staff_notes end as staff_notes,
       r.updated_at
  from public.roster_entries r
 where (select public.is_staff());

comment on view public.v_roster is
  'Roster entries for staff; weight_kg for coach and medical, staff_notes for coach, otherwise null.';

revoke all on public.v_roster from public, anon, authenticated;
grant select on public.v_roster to authenticated;
