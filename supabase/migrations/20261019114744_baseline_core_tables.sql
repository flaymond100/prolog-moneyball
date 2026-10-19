-- Baseline: core tables synced from intervals.icu, plus staff (KB §4–5).
-- The project started empty, so these are created here instead of pulled.
--
-- Pattern (KB §5): every synced row keeps the full API response in `raw`;
-- dashboard columns are generated from it with immutable casts only.
-- Dates and timestamps are set by the sync, never generated.
--
-- RLS is enabled on every table with no policies yet, so only the service
-- role can read or write. Staff read policies arrive with is_staff() (2.3).

-- athletes ------------------------------------------------------------------

create table public.athletes (
  id text primary key, -- intervals.icu athlete id
  name text not null,
  active boolean not null default true,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

comment on table public.athletes is
  'Coached athletes from intervals.icu athlete-summary.';

alter table public.athletes enable row level security;

-- activities ----------------------------------------------------------------

create table public.activities (
  id text primary key, -- intervals.icu activity id
  athlete_id text not null references public.athletes (id) on delete cascade,
  start_date_local timestamp not null,
  raw jsonb not null, -- icu_intervals and icu_groups stripped before insert
  synced_at timestamptz not null default now(),

  -- context
  type text generated always as (raw->>'type') stored,
  trainer boolean generated always as ((raw->>'trainer')::boolean) stored,
  race boolean generated always as ((raw->>'race')::boolean) stored,
  source text generated always as (raw->>'source') stored,
  paired_event_id text generated always as (raw->>'paired_event_id') stored,

  -- volume
  moving_time numeric generated always as ((raw->>'moving_time')::numeric) stored,
  elapsed_time numeric generated always as ((raw->>'elapsed_time')::numeric) stored,
  icu_distance numeric generated always as ((raw->>'icu_distance')::numeric) stored,
  total_elevation_gain numeric generated always as ((raw->>'total_elevation_gain')::numeric) stored,

  -- load and intensity
  icu_training_load numeric generated always as ((raw->>'icu_training_load')::numeric) stored,
  icu_intensity numeric generated always as ((raw->>'icu_intensity')::numeric) stored,
  icu_weighted_avg_watts numeric generated always as ((raw->>'icu_weighted_avg_watts')::numeric) stored,
  icu_average_watts numeric generated always as ((raw->>'icu_average_watts')::numeric) stored,
  icu_variability_index numeric generated always as ((raw->>'icu_variability_index')::numeric) stored,
  icu_efficiency_factor numeric generated always as ((raw->>'icu_efficiency_factor')::numeric) stored,
  icu_joules numeric generated always as ((raw->>'icu_joules')::numeric) stored,
  icu_joules_above_ftp numeric generated always as ((raw->>'icu_joules_above_ftp')::numeric) stored,
  trimp numeric generated always as ((raw->>'trimp')::numeric) stored,
  icu_rpe numeric generated always as ((raw->>'icu_rpe')::numeric) stored,
  feel numeric generated always as ((raw->>'feel')::numeric) stored,

  -- fitness snapshot
  icu_ctl numeric generated always as ((raw->>'icu_ctl')::numeric) stored,
  icu_atl numeric generated always as ((raw->>'icu_atl')::numeric) stored,
  icu_ftp numeric generated always as ((raw->>'icu_ftp')::numeric) stored,
  icu_weight numeric generated always as ((raw->>'icu_weight')::numeric) stored,

  -- heart rate
  average_heartrate numeric generated always as ((raw->>'average_heartrate')::numeric) stored,
  max_heartrate numeric generated always as ((raw->>'max_heartrate')::numeric) stored,
  decoupling numeric generated always as ((raw->>'decoupling')::numeric) stored
);

comment on table public.activities is
  'intervals.icu activities; raw JSON plus generated dashboard columns.';

create index activities_athlete_start_idx
  on public.activities (athlete_id, start_date_local desc);

alter table public.activities enable row level security;

-- activity_intervals --------------------------------------------------------

create table public.activity_intervals (
  activity_id text not null references public.activities (id) on delete cascade,
  interval_id integer not null, -- id within the activity's icu_intervals
  raw jsonb not null,

  type text generated always as (raw->>'type') stored,
  label text generated always as (raw->>'label') stored,
  group_id text generated always as (raw->>'group_id') stored,
  moving_time numeric generated always as ((raw->>'moving_time')::numeric) stored,
  average_watts numeric generated always as ((raw->>'average_watts')::numeric) stored,
  weighted_average_watts numeric generated always as ((raw->>'weighted_average_watts')::numeric) stored,
  average_watts_kg numeric generated always as ((raw->>'average_watts_kg')::numeric) stored,
  max_watts numeric generated always as ((raw->>'max_watts')::numeric) stored,
  intensity numeric generated always as ((raw->>'intensity')::numeric) stored,
  training_load numeric generated always as ((raw->>'training_load')::numeric) stored,
  zone numeric generated always as ((raw->>'zone')::numeric) stored,
  decoupling numeric generated always as ((raw->>'decoupling')::numeric) stored,
  wbal_start numeric generated always as ((raw->>'wbal_start')::numeric) stored,
  wbal_end numeric generated always as ((raw->>'wbal_end')::numeric) stored,
  average_heartrate numeric generated always as ((raw->>'average_heartrate')::numeric) stored,
  average_cadence numeric generated always as ((raw->>'average_cadence')::numeric) stored,

  primary key (activity_id, interval_id)
);

comment on table public.activity_intervals is
  'Intervals split out of activity icu_intervals at sync.';

alter table public.activity_intervals enable row level security;

-- wellness ------------------------------------------------------------------

create table public.wellness (
  athlete_id text not null references public.athletes (id) on delete cascade,
  date date not null, -- local date from raw id, set by the sync
  raw jsonb not null, -- menstrualPhase* stripped at sync (KB §11)
  synced_at timestamptz not null default now(),

  ctl numeric generated always as ((raw->>'ctl')::numeric) stored,
  atl numeric generated always as ((raw->>'atl')::numeric) stored,
  ramp_rate numeric generated always as ((raw->>'rampRate')::numeric) stored,
  weight numeric generated always as ((raw->>'weight')::numeric) stored,
  resting_hr numeric generated always as ((raw->>'restingHR')::numeric) stored,
  hrv numeric generated always as ((raw->>'hrv')::numeric) stored,
  hrv_sdnn numeric generated always as ((raw->>'hrvSDNN')::numeric) stored,
  readiness numeric generated always as ((raw->>'readiness')::numeric) stored,
  sleep_secs numeric generated always as ((raw->>'sleepSecs')::numeric) stored,
  sleep_score numeric generated always as ((raw->>'sleepScore')::numeric) stored,
  sleep_quality numeric generated always as ((raw->>'sleepQuality')::numeric) stored,
  avg_sleeping_hr numeric generated always as ((raw->>'avgSleepingHR')::numeric) stored,
  soreness numeric generated always as ((raw->>'soreness')::numeric) stored,
  fatigue numeric generated always as ((raw->>'fatigue')::numeric) stored,
  stress numeric generated always as ((raw->>'stress')::numeric) stored,
  mood numeric generated always as ((raw->>'mood')::numeric) stored,
  motivation numeric generated always as ((raw->>'motivation')::numeric) stored,
  injury numeric generated always as ((raw->>'injury')::numeric) stored,
  spo2 numeric generated always as ((raw->>'spO2')::numeric) stored,
  vo2max numeric generated always as ((raw->>'vo2max')::numeric) stored,

  primary key (athlete_id, date)
);

comment on table public.wellness is
  'intervals.icu wellness by local date; raw JSON plus generated columns.';

alter table public.wellness enable row level security;

-- staff ---------------------------------------------------------------------

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

comment on table public.staff is
  'Staff users of the dashboard. Role enum and helpers are added in 2.3.';

alter table public.staff enable row level security;
