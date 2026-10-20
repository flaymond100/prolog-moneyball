-- Output tables (KB §5–9): rider_ratings, rider_ca_pa and forecasts, written
-- by the Phase 7 jobs with the service role and read by all staff; plus
-- saved_layouts and saved_filters, UI state owned by each staff user.

-- rider_ratings -------------------------------------------------------------
-- One 1–20 rating per rider, day, benchmark set and attribute (KB §6).

create type public.rating_confidence as enum ('high', 'low');

create table public.rider_ratings (
  athlete_id text not null references public.athletes (id) on delete cascade,
  as_of date not null,
  -- Ratings never mix sets; each row names its set (KB §6).
  set_id text not null references public.benchmark_sets (id) on delete cascade,
  attribute public.rating_attribute not null,
  value numeric not null, -- in the benchmark unit: W/kg, retained %, mL/kg/min
  rating numeric not null check (rating between 1 and 20),
  -- Squad-relative mode: squad percentile mapped linearly to 1–20 (KB §6).
  squad_rating numeric check (squad_rating between 1 and 20),
  -- Low confidence counts at 50% in CA and renders hatched (KB §6).
  confidence public.rating_confidence not null,
  -- Absolute 20/60-min power for Rouleur/TT, rated squad-relative (KB §6–7).
  watts numeric check (watts > 0),
  watts_squad_rating numeric check (watts_squad_rating between 1 and 20),
  computed_at timestamptz not null default now(),

  primary key (athlete_id, as_of, set_id, attribute),
  constraint rider_ratings_watts_only_20_60_min check (
    attribute in ('p20m', 'p60m') or (watts is null and watts_squad_rating is null)
  )
);

comment on table public.rider_ratings is
  'Attribute ratings 1–20 with confidence, per rider, day and benchmark set.';

-- rider_ca_pa ---------------------------------------------------------------
-- Rider type, CA and PA per rider and day (KB §7–8); history is kept.

create table public.rider_ca_pa (
  athlete_id text not null references public.athletes (id) on delete cascade,
  as_of date not null,
  set_id text not null references public.benchmark_sets (id) on delete cascade,
  ca numeric not null check (ca between 1 and 20),
  -- Computed type, or rider_profiles.primary_type_override when set (KB §7).
  primary_type public.rider_type not null,
  type_overridden boolean not null default false,
  type_probs jsonb not null check (jsonb_typeof(type_probs) = 'object'),
  -- Null until PA can run (e.g. no date of birth or training age).
  pa_p10 numeric check (pa_p10 between 1 and 20),
  pa_p50 numeric check (pa_p50 between 1 and 20),
  pa_p90 numeric check (pa_p90 between 1 and 20),
  -- One year ahead without the max(…, CA) floor, so declines show (KB §8).
  ca_12m_p50 numeric check (ca_12m_p50 between 1 and 20),
  model_version text not null,
  seed bigint, -- hash(athlete_id, as_of) used for the PA draws (KB §8)
  computed_at timestamptz not null default now(),

  primary key (athlete_id, as_of),
  constraint rider_ca_pa_pa_complete check (
    (pa_p10 is null) = (pa_p50 is null)
    and (pa_p50 is null) = (pa_p90 is null)
    and (pa_p50 is null) = (seed is null)
  ),
  constraint rider_ca_pa_pa_ordered check (pa_p10 <= pa_p50 and pa_p50 <= pa_p90)
);

comment on table public.rider_ca_pa is
  'Rider type probabilities, CA and PA band per rider and day.';

-- forecasts -----------------------------------------------------------------
-- Load projection and capacity trend forecasts (KB §9). Kept after their
-- horizon passes, for the model audit (TODO 7.7).

create table public.forecasts (
  athlete_id text not null references public.athletes (id) on delete cascade,
  created_at timestamptz not null default now(), -- one value per job run
  metric text not null, -- e.g. tsb, ctl, atl, eftp, p5m_wkg, p20m_wkg
  -- Planned-load multiplier for the load projection (0.8, 1.0, 1.2); 1 otherwise.
  scenario numeric not null default 1 check (scenario > 0),
  horizon_date date not null,
  p10 numeric,
  p50 numeric not null,
  p90 numeric,
  model text not null,
  -- Capacity trend only: the slope's interval contains zero (KB §9).
  plateau boolean,

  primary key (athlete_id, created_at, metric, scenario, horizon_date),
  constraint forecasts_interval_complete check ((p10 is null) = (p90 is null)),
  constraint forecasts_interval_ordered check (p10 <= p50 and p50 <= p90)
);

comment on table public.forecasts is
  'Forecasts with P10/P50/P90 per rider, metric, scenario and horizon date.';

create index forecasts_athlete_metric_horizon_idx
  on public.forecasts (athlete_id, metric, horizon_date);

-- saved_layouts and saved_filters -------------------------------------------
-- UI state per staff user (KB §5); the jsonb matches the app's types.

create table public.saved_layouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  view text not null default 'squad_table',
  name text not null check (btrim(name) <> ''),
  layout jsonb not null check (jsonb_typeof(layout) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saved_layouts_unique_name unique (user_id, view, name)
);

comment on table public.saved_layouts is
  'Saved table layouts (column groups, visibility, sorting) per staff user.';

create trigger saved_layouts_set_updated_at
  before update on public.saved_layouts
  for each row execute function public.set_updated_at();

create table public.saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (btrim(name) <> ''),
  conditions jsonb not null check (jsonb_typeof(conditions) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint saved_filters_unique_name unique (user_id, name)
);

comment on table public.saved_filters is
  'Saved filter-builder conditions per staff user.';

create trigger saved_filters_set_updated_at
  before update on public.saved_filters
  for each row execute function public.set_updated_at();

-- RLS -----------------------------------------------------------------------

alter table public.rider_ratings enable row level security;
alter table public.rider_ca_pa enable row level security;
alter table public.forecasts enable row level security;
alter table public.saved_layouts enable row level security;
alter table public.saved_filters enable row level security;

-- Model outputs: staff read, service role writes (no write policies).

create policy "Staff read rider ratings"
  on public.rider_ratings for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read rider CA and PA"
  on public.rider_ca_pa for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read forecasts"
  on public.forecasts for select to authenticated
  using ((select public.is_staff()));

-- UI state: each staff user reads and writes only their own rows.

create policy "Staff manage own saved layouts"
  on public.saved_layouts for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_staff()))
  with check (user_id = (select auth.uid()) and (select public.is_staff()));

create policy "Staff manage own saved filters"
  on public.saved_filters for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_staff()))
  with check (user_id = (select auth.uid()) and (select public.is_staff()));
