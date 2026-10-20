-- Sync target tables (KB §5): power_curves, planned_events,
-- durability_efforts and sync_runs. The sync and jobs write with the service
-- role; staff read (performance data, KB §11). No write policies.

-- power_curves --------------------------------------------------------------
-- One best-power curve per athlete, day and window. The arrays are set by the
-- sync (or a manual upload for prospects, KB §2), not generated: jsonb arrays
-- have no immutable cast to Postgres arrays. `window` is a reserved word, so
-- the window column is `time_window`.

create type public.power_curve_window as enum ('42d', '84d', 'season');

create table public.power_curves (
  athlete_id text not null references public.athletes (id) on delete cascade,
  as_of date not null,
  time_window public.power_curve_window not null,
  secs integer[] not null,
  watts numeric[] not null,
  wkg numeric[], -- null when no body mass is known (e.g. a manual upload)
  raw jsonb not null default '{}'::jsonb, -- API curve; empty for manual uploads
  synced_at timestamptz not null default now(),

  primary key (athlete_id, as_of, time_window),
  constraint power_curves_not_empty check (cardinality(secs) > 0),
  constraint power_curves_watts_match_secs check (cardinality(watts) = cardinality(secs)),
  constraint power_curves_wkg_match_secs check (wkg is null or cardinality(wkg) = cardinality(secs))
);

comment on table public.power_curves is
  'Best-power curves per athlete, as-of date and window (42d, 84d, season).';

-- planned_events ------------------------------------------------------------
-- Planned workouts from intervals.icu events, for load projection (KB §9).

create table public.planned_events (
  id text primary key, -- intervals.icu event id
  athlete_id text not null references public.athletes (id) on delete cascade,
  start_date_local timestamp not null,
  raw jsonb not null,
  synced_at timestamptz not null default now(),

  category text generated always as (raw->>'category') stored,
  type text generated always as (raw->>'type') stored,
  name text generated always as (raw->>'name') stored,
  icu_training_load numeric generated always as ((raw->>'icu_training_load')::numeric) stored,
  moving_time numeric generated always as ((raw->>'moving_time')::numeric) stored
);

comment on table public.planned_events is
  'Planned intervals.icu events; raw JSON plus generated columns.';

create index planned_events_athlete_start_idx
  on public.planned_events (athlete_id, start_date_local);

-- durability_efforts --------------------------------------------------------
-- Best power after accumulated work, written by compute-durability (TODO 5.6).
-- Computed from streams, so there is no raw API response.

create table public.durability_efforts (
  activity_id text not null references public.activities (id) on delete cascade,
  kj_kg_bucket smallint not null check (kj_kg_bucket in (10, 20, 30)),
  duration_s integer not null check (duration_s in (60, 300, 1200)),
  watts numeric not null check (watts > 0),
  wkg numeric check (wkg > 0),
  computed_at timestamptz not null default now(),

  primary key (activity_id, kj_kg_bucket, duration_s)
);

comment on table public.durability_efforts is
  'Best 1/5/20 min power per activity after 10/20/30 kJ/kg of work.';

-- sync_runs -----------------------------------------------------------------
-- One row per sync or backfill run, read by v_sync_health (TODO 3.7).

create table public.sync_runs (
  id bigint generated always as identity primary key,
  job text not null default 'sync-nightly', -- e.g. sync-nightly, backfill
  params jsonb not null default '{}'::jsonb, -- e.g. backfill {athlete_id, from, to}
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'partial', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  athlete_ids text[] not null default '{}', -- athletes the run covered
  counts jsonb not null default '{}'::jsonb, -- rows upserted per table
  errors jsonb not null default '[]'::jsonb, -- [{athlete_id, step, message}]
  api_calls integer check (api_calls >= 0),
  rate_limit_remaining integer,

  error_count integer generated always as (jsonb_array_length(errors)) stored,

  constraint sync_runs_finished_when_done check (
    (status = 'running') = (finished_at is null)
  ),
  constraint sync_runs_finished_after_start check (finished_at >= started_at)
);

comment on table public.sync_runs is
  'Sync and backfill run log: timing, counts, errors and rate-limit headroom.';

create index sync_runs_started_idx on public.sync_runs (started_at desc);

-- RLS -----------------------------------------------------------------------

alter table public.power_curves enable row level security;
alter table public.planned_events enable row level security;
alter table public.durability_efforts enable row level security;
alter table public.sync_runs enable row level security;

create policy "Staff read power curves"
  on public.power_curves for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read planned events"
  on public.planned_events for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read durability efforts"
  on public.durability_efforts for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read sync runs"
  on public.sync_runs for select to authenticated
  using ((select public.is_staff()));
