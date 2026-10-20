-- Model reference tables and their seeds (KB §5–9): benchmark_sets,
-- benchmark_points, ca_weights and model_priors with a history table.
-- Every [prior] lives here, never in code (KB §1).
--
-- RLS: all staff read. The coach edits CA weights, PA priors and the active
-- benchmark set from Settings (KB §12); new benchmark sets arrive by migration.

-- shared types and helpers --------------------------------------------------

-- Whether a value is published research or a coach-chosen assumption (KB §1).
create type public.evidence_status as enum ('source', 'prior');

-- Rated attributes (KB §6); ids match the app's AttributeId.
create type public.rating_attribute as enum
  ('p5s', 'p30s', 'p1m', 'p5m', 'p20m', 'p60m', 'durability', 'vo2max');

create function public.is_strictly_increasing(vals numeric[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(a < b), true)
    from (
      select v as a, lead(v) over (order by i) as b
        from unnest(vals) with ordinality as t (v, i)
    ) pairs
   where b is not null;
$$;

-- benchmark_sets ------------------------------------------------------------

create table public.benchmark_sets (
  id text primary key,
  name text not null,
  version integer not null check (version > 0),
  description text,
  -- The set ratings are computed with; exactly one is active (KB §6).
  is_active boolean not null default false,
  created_at timestamptz not null default now(),

  -- Deferred so switching sets can clear one row and set another.
  constraint benchmark_sets_one_active
    exclude using btree (is_active with =) where (is_active)
    deferrable initially deferred
);

comment on table public.benchmark_sets is
  'Benchmark sets for 1–20 ratings; ratings never mix sets (KB §6).';

-- benchmark_points ----------------------------------------------------------
-- One row per set and attribute: a z-score (mean, SD) or anchor points
-- (value → rating), interpolated piecewise-linearly (KB §6).

create type public.benchmark_method as enum ('z_score', 'anchors');

create table public.benchmark_points (
  set_id text not null references public.benchmark_sets (id) on delete cascade,
  attribute public.rating_attribute not null,
  method public.benchmark_method not null,
  unit text not null,
  mean numeric,
  sd numeric,
  anchor_values numeric[],
  anchor_ratings numeric[],
  status public.evidence_status not null,
  citation text not null,

  primary key (set_id, attribute),
  constraint benchmark_points_method_fields check (coalesce(
    (method = 'z_score'
      and mean is not null and sd is not null and sd > 0
      and anchor_values is null and anchor_ratings is null)
    or (method = 'anchors'
      and mean is null and sd is null
      and anchor_values is not null and anchor_ratings is not null
      and cardinality(anchor_values) >= 2
      and cardinality(anchor_ratings) = cardinality(anchor_values)
      and array_position(anchor_values, null) is null
      and array_position(anchor_ratings, null) is null
      and public.is_strictly_increasing(anchor_values)
      and 1 <= all (anchor_ratings) and 20 >= all (anchor_ratings)),
    false))
);

comment on table public.benchmark_points is
  'Per-attribute benchmark: z-score (mean, SD) or anchors, with citation.';

-- ca_weights ----------------------------------------------------------------
-- CA weight matrix in per cent (KB §7, [prior] agreed with Kosta).

create table public.ca_weights (
  rider_type public.rider_type not null,
  attribute public.rating_attribute not null,
  weight numeric not null check (weight between 0 and 100),
  -- Rouleur/TT rates 20 and 60 min on absolute watts, not W/kg (KB §7).
  absolute_watts boolean not null default false,
  updated_at timestamptz not null default now(),

  primary key (rider_type, attribute),
  constraint ca_weights_durability_fixed check (attribute <> 'durability' or weight = 25)
);

comment on table public.ca_weights is
  'CA weights in per cent by rider type; each type sums to 100 (KB §7).';

create trigger ca_weights_set_updated_at
  before update on public.ca_weights
  for each row execute function public.set_updated_at();

-- Checked at commit, so an editor can move weight between rows in one
-- transaction. A type with no rows is not checked.
create function public.check_ca_weights_sum()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_type public.rider_type;
  v_sum numeric;
begin
  foreach v_type in array array_remove(array[
    case when tg_op <> 'INSERT' then old.rider_type end,
    case when tg_op <> 'DELETE' then new.rider_type end
  ], null) loop
    select sum(weight) into v_sum from public.ca_weights where rider_type = v_type;
    if v_sum is not null and v_sum <> 100 then
      raise exception using
        errcode = 'check_violation',
        message = format('CA weights for %s must sum to 100 (got %s).', v_type, v_sum);
    end if;
  end loop;
  return null;
end;
$$;

create constraint trigger ca_weights_sum_to_100
  after insert or update or delete on public.ca_weights
  deferrable initially deferred
  for each row execute function public.check_ca_weights_sum();

-- model_priors --------------------------------------------------------------
-- One prior per key as jsonb, grouped by the model that reads it: rider type
-- (KB §7), PA (KB §8) and readiness (KB §9).

create table public.model_priors (
  key text primary key,
  model text not null check (model in ('rider_type', 'pa', 'readiness')),
  value jsonb not null,
  unit text not null default '',
  label text not null,
  status public.evidence_status not null,
  citation text not null,
  note text, -- e.g. why a recalibration changed the value
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.model_priors is
  'Model priors as jsonb; every change is logged in model_priors_history (KB §8).';

create trigger model_priors_set_updated_at
  before update on public.model_priors
  for each row execute function public.set_updated_at();

create table public.model_priors_history (
  id bigint generated always as identity primary key,
  key text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid, -- auth.uid() of the editor; null for migrations and jobs
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

comment on table public.model_priors_history is
  'Append-only log of model_priors changes, written by trigger.';

create index model_priors_history_key_idx
  on public.model_priors_history (key, changed_at desc);

create function public.log_model_priors_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.model_priors_history (key, operation, changed_by, old_row, new_row)
  values (
    case when tg_op = 'DELETE' then old.key else new.key end,
    tg_op,
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

create trigger model_priors_log_history
  after insert or update or delete on public.model_priors
  for each row execute function public.log_model_priors_history();

-- RLS -----------------------------------------------------------------------

alter table public.benchmark_sets enable row level security;
alter table public.benchmark_points enable row level security;
alter table public.ca_weights enable row level security;
alter table public.model_priors enable row level security;
alter table public.model_priors_history enable row level security;

create policy "Staff read benchmark sets"
  on public.benchmark_sets for select to authenticated
  using ((select public.is_staff()));

create policy "Coach updates benchmark sets"
  on public.benchmark_sets for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));

create policy "Staff read benchmark points"
  on public.benchmark_points for select to authenticated
  using ((select public.is_staff()));

create policy "Staff read CA weights"
  on public.ca_weights for select to authenticated
  using ((select public.is_staff()));

create policy "Coach updates CA weights"
  on public.ca_weights for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));

create policy "Staff read model priors"
  on public.model_priors for select to authenticated
  using ((select public.is_staff()));

create policy "Coach updates model priors"
  on public.model_priors for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));

create policy "Staff read model priors history"
  on public.model_priors_history for select to authenticated
  using ((select public.is_staff()));

-- seeds ---------------------------------------------------------------------
-- Idempotent: inserts only missing rows, so re-running never overwrites a
-- coach's edits. Change a seeded value with a new migration (an update).

create function public.seed_model_reference()
returns void
language plpgsql
set search_path = ''
as $$
begin
  -- Benchmark set v1 (KB §6).
  insert into public.benchmark_sets (id, name, version, description, is_active)
  values (
    'female-pro-coggan-v1',
    'Female Pro + Coggan Provisional',
    1,
    'Female pro record power profile (Mateo-March 2022) where published; Coggan-based provisional anchors elsewhere.',
    true
  )
  on conflict (id) do nothing;

  insert into public.benchmark_points
    (set_id, attribute, method, unit, mean, sd, anchor_values, anchor_ratings, status, citation)
  values
    ('female-pro-coggan-v1', 'p5s', 'z_score', 'W/kg', 15.3, 1.8, null, null, 'source',
      'Mateo-March et al. 2022, IJSPP 17(5):682–686'),
    ('female-pro-coggan-v1', 'p30s', 'z_score', 'W/kg', 10.3, 1.1, null, null, 'prior',
      'Provisional: log-interpolated between 5 s and 60 s'),
    ('female-pro-coggan-v1', 'p1m', 'z_score', 'W/kg', 8.4, 0.8, null, null, 'source',
      'Mateo-March et al. 2022, IJSPP 17(5):682–686'),
    ('female-pro-coggan-v1', 'p5m', 'anchors', 'W/kg', null, null, '{4.65,5.20,5.80}', '{9,12,15}', 'prior',
      'Provisional: Coggan Very good / Excellent / Exceptional band mids'),
    ('female-pro-coggan-v1', 'p20m', 'anchors', 'W/kg', null, null, '{4.11,4.63,5.11}', '{9,12,15}', 'prior',
      'Provisional: Coggan FTP band mids ÷ 0.95'),
    ('female-pro-coggan-v1', 'p60m', 'z_score', 'W/kg', 4.2, 0.4, null, null, 'source',
      'Mateo-March et al. 2022, IJSPP 17(5):682–686'),
    ('female-pro-coggan-v1', 'durability', 'anchors', '%', null, null, '{85,90,95,100}', '{9,12,15,18}', 'prior',
      'Coach prior (KB §6)'),
    ('female-pro-coggan-v1', 'vo2max', 'anchors', 'mL/kg/min', null, null, '{50,57,63,70}', '{9,12,15,18}', 'prior',
      'Coach prior (KB §6)')
  on conflict (set_id, attribute) do nothing;

  -- CA weights (KB §7). Rouleur/TT 20 and 60 min use absolute watts.
  insert into public.ca_weights (rider_type, attribute, weight, absolute_watts)
  select t.rider_type::public.rider_type, w.attribute::public.rating_attribute, w.weight,
         t.rider_type = 'rouleur_tt' and w.attribute in ('p20m', 'p60m')
    from (values
      ('sprinter', 1), ('puncheur', 2), ('climber', 3), ('rouleur_tt', 4), ('all_rounder', 5)
    ) as t (rider_type, col)
    cross join lateral (values
      ('p5s',        (array[25, 10,  0,  5,  8])[t.col]),
      ('p30s',       (array[15, 10,  5,  5,  8])[t.col]),
      ('p1m',        (array[15, 20,  5,  5, 12])[t.col]),
      ('p5m',        (array[ 5, 20, 20, 10, 15])[t.col]),
      ('p20m',       (array[ 5,  5, 25, 25, 15])[t.col]),
      ('p60m',       (array[ 5,  5, 15, 20, 12])[t.col]),
      ('durability', (array[25, 25, 25, 25, 25])[t.col]),
      ('vo2max',     (array[ 5,  5,  5,  5,  5])[t.col])
    ) as w (attribute, weight)
  on conflict (rider_type, attribute) do nothing;

  -- Model priors.
  insert into public.model_priors (key, model, value, unit, label, status, citation)
  values
    -- Rider type classification (KB §7). Prototype order: 5 s, 30 s, 1 min, 5 min, 20 min, 60 min.
    ('type.prototype.sprinter', 'rider_type', '[3, 2, 1, -1, -2, -3]', 'rating', 'Shape Prototype: Sprinter', 'prior', 'Coach prior (KB §7)'),
    ('type.prototype.puncheur', 'rider_type', '[0, 1, 2, 1, -1, -2]', 'rating', 'Shape Prototype: Puncheur', 'prior', 'Coach prior (KB §7)'),
    ('type.prototype.climber', 'rider_type', '[-3, -2, -1, 1, 2.5, 2]', 'rating', 'Shape Prototype: Climber', 'prior', 'Coach prior (KB §7)'),
    ('type.prototype.rouleur_tt', 'rider_type', '[-1, -1, -1, 0, 1.5, 2]', 'rating', 'Shape Prototype: Rouleur/TT', 'prior', 'Coach prior (KB §7)'),
    ('type.prototype.all_rounder', 'rider_type', '[0, 0, 0, 0, 0, 0]', 'rating', 'Shape Prototype: All-Rounder', 'prior', 'Coach prior (KB §7)'),
    ('type.bonus.sprinter_vlamax_min', 'rider_type', '0.6', 'mmol/L/s', 'Sprinter Bonus: Minimum VLamax', 'prior', 'Coach prior (KB §7)'),
    ('type.bonus.sprinter', 'rider_type', '0.5', 'score', 'Sprinter Bonus', 'prior', 'Coach prior (KB §7)'),
    ('type.bonus.climber_mass_max', 'rider_type', '55', 'kg', 'Climber Bonus: Maximum Body Mass', 'prior', 'Coach prior (KB §7)'),
    ('type.bonus.climber', 'rider_type', '0.5', 'score', 'Climber Bonus', 'prior', 'Coach prior (KB §7)'),
    ('type.bonus.rouleur_tt_abs20_percentile_min', 'rider_type', '60', 'percentile', 'Rouleur/TT Bonus: Minimum Squad Percentile of Absolute 20-Min Power', 'prior', 'Coach prior (KB §7)'),
    ('type.bonus.rouleur_tt', 'rider_type', '0.5', 'score', 'Rouleur/TT Bonus', 'prior', 'Coach prior (KB §7)'),
    ('type.softmax_tau', 'rider_type', '4', '', 'Softmax Temperature (τ)', 'prior', 'Coach prior (KB §7)'),

    -- PA (KB §8, v1 agreed with Kosta).
    ('peak_age.sprinter', 'pa', '28.7', 'years', 'Peak Age: Sprinter', 'source', 'Published value (KB §8)'),
    ('peak_age.all_rounder', 'pa', '27.0', 'years', 'Peak Age: All-Rounder', 'source', 'Published value (KB §8)'),
    ('peak_age.climber', 'pa', '27.0', 'years', 'Peak Age: Climber', 'prior', 'Coach prior (KB §8)'),
    ('peak_age.puncheur', 'pa', '27.5', 'years', 'Peak Age: Puncheur', 'prior', 'Coach prior (KB §8)'),
    ('peak_age.rouleur_tt', 'pa', '28.5', 'years', 'Peak Age: Rouleur/TT', 'prior', 'Coach prior (KB §8)'),
    ('peak_age.noise_sd', 'pa', '1.5', 'years', 'Peak Age Noise (SD)', 'prior', 'Coach prior (KB §8): normal, per draw'),
    ('gain.g0_median', 'pa', '0.10', 'fraction', 'Annual Gain g0 (Median)', 'prior', 'Coach prior (KB §8)'),
    ('gain.g0_sigma_factor', 'pa', '1.5', '×', 'g0 Lognormal Spread (×)', 'prior', 'Coach prior (KB §8): lognormal σ = ln 1.5'),
    ('gain.decay', 'pa', '0.35', 'per training year', 'Gain Decay per Training Year', 'prior', 'Coach prior (KB §8): g(t) = g0 · e^(−0.35·t)'),
    ('multiplier.p5s', 'pa', '0.3', '×', 'Duration Multiplier: 5 s', 'prior', 'Coach prior (KB §8)'),
    ('multiplier.p30s', 'pa', '0.5', '×', 'Duration Multiplier: 30 s', 'prior', 'Coach prior (KB §8)'),
    ('multiplier.p1m', 'pa', '0.7', '×', 'Duration Multiplier: 1 min', 'prior', 'Coach prior (KB §8)'),
    ('multiplier.p5m', 'pa', '1.0', '×', 'Duration Multiplier: 5 min', 'prior', 'Coach prior (KB §8)'),
    ('multiplier.p20m', 'pa', '1.0', '×', 'Duration Multiplier: 20 min', 'prior', 'Coach prior (KB §8)'),
    ('multiplier.p60m', 'pa', '1.1', '×', 'Duration Multiplier: 60 min', 'prior', 'Coach prior (KB §8)'),
    ('multiplier.post_fatigue', 'pa', '1.3', '×', 'Duration Multiplier: Post-Fatigue Power', 'prior', 'Coach prior (KB §8)'),
    ('multiplier.vo2max', 'pa', '0.8', '×', 'Duration Multiplier: VO2max', 'prior', 'Coach prior (KB §8)'),
    ('taper.full_years_before_peak', 'pa', '3', 'years', 'Age Taper: Full Gain Until Peak Minus', 'prior', 'Coach prior (KB §8): factor 1.0 up to peak − 3'),
    ('taper.factor_at_peak', 'pa', '0.3', '×', 'Age Taper: Factor at Peak', 'prior', 'Coach prior (KB §8): linear from 1.0 to 0.3 at peak'),
    ('taper.zero_years_after_peak', 'pa', '2', 'years', 'Age Taper: Zero Gain From Peak Plus', 'prior', 'Coach prior (KB §8): linear to 0 at peak + 2'),
    ('taper.decline_from_age', 'pa', '31', 'years', 'Age Taper: Decline From Age', 'prior', 'Coach prior (KB §8): 0 until 31'),
    ('taper.decline_pct_per_year', 'pa', '0.75', '%', 'Age Taper: Decline per Year', 'prior', 'Coach prior (KB §8): −0.75% per year from 31'),
    ('cap.p5m_p60m', 'pa', '20', '%', 'Gain Cap: 5–60 min and Post-Fatigue Power', 'prior', 'Coach prior (KB §8)'),
    ('cap.p30s_p1m', 'pa', '12', '%', 'Gain Cap: 30 s and 1 min', 'prior', 'Coach prior (KB §8)'),
    ('cap.p5s', 'pa', '8', '%', 'Gain Cap: 5 s', 'prior', 'Coach prior (KB §8)'),
    ('cap.vo2max', 'pa', '10', '%', 'Gain Cap: VO2max', 'prior', 'Coach prior (KB §8)'),
    ('cap.durability_retained_max', 'pa', '100', '%', 'Cap: Durability Retained', 'prior', 'Coach prior (KB §8): retained % never above 100%'),
    ('modifier.vo2max_rating_gap', 'pa', '2', 'rating', 'Modifier: Lab VO2max Rating Above 5-Min Rating By', 'prior', 'Coach prior (KB §8)'),
    ('modifier.vo2max_bonus', 'pa', '0.5', 'rating', 'Modifier: Lab VO2max Bonus', 'prior', 'Coach prior (KB §8)'),
    ('modifier.young_training_age_below', 'pa', '3', 'years', 'Modifier: Training Age Below', 'prior', 'Coach prior (KB §8)'),
    ('modifier.young_ca_min', 'pa', '13', 'rating', 'Modifier: Minimum CA', 'prior', 'Coach prior (KB §8)'),
    ('modifier.young_bonus', 'pa', '0.5', 'rating', 'Modifier: Young High-CA Bonus', 'prior', 'Coach prior (KB §8)'),
    ('pa.draws', 'pa', '1000', 'draws', 'Monte Carlo Draws', 'prior', 'Coach prior (KB §8)'),
    ('recalibration.shrinkage_n', 'pa', '20', 'rider-seasons', 'Recalibration Shrinkage Constant', 'prior', 'Coach prior (KB §8): weight n ÷ (n + 20)'),

    -- Readiness traffic light (KB §9).
    ('readiness.ln_rmssd_band_sd', 'readiness', '0.5', 'SD', 'ln rMSSD Band (± SD)', 'prior', 'Coach prior (KB §9)'),
    ('readiness.resting_hr_rise_max', 'readiness', '5', 'bpm', 'Resting HR Band (+ bpm)', 'prior', 'Coach prior (KB §9)'),
    ('readiness.wellness_band_sd', 'readiness', '1', 'SD', 'Wellness Composite Band (− SD)', 'prior', 'Coach prior (KB §9)'),
    ('readiness.sleep_min_hours', 'readiness', '6.5', 'h', 'Minimum Sleep', 'prior', 'Coach prior (KB §9)'),
    ('readiness.red_min_markers', 'readiness', '2', 'markers', 'Red: Minimum Markers Out', 'prior', 'Coach prior (KB §9)'),
    ('readiness.red_min_days', 'readiness', '2', 'days', 'Red: Minimum Consecutive Days', 'prior', 'Coach prior (KB §9)'),
    ('readiness.min_hrv_readings_7d', 'readiness', '3', 'readings', 'Minimum HRV Readings in 7 Days', 'prior', 'Coach prior (KB §9)')
  on conflict (key) do nothing;
end;
$$;

comment on function public.seed_model_reference() is
  'Inserts missing KB §6–9 reference rows; never overwrites edits.';

revoke execute on function public.seed_model_reference() from public, anon, authenticated;

select public.seed_model_reference();
