-- Power profile (TODO 5.3, KB §6, §9): each ride's best-power curve, and
-- v_power_profile with the six rated durations per rider over 14 days,
-- 42 days, 84 days and the season.

-- activity_power_curves -------------------------------------------------------
-- One curve per ride from intervals.icu activity-power-curves, written by the
-- sync with the service role. `watts[i]` is the ride's best for `secs[i]`.
-- `raw` carries intervals.icu's body weight, so it stays server-side.

create table public.activity_power_curves (
  activity_id text primary key, -- intervals.icu activity id
  athlete_id text not null references public.athletes (id) on delete cascade,
  start_date_local timestamp not null,
  secs integer[] not null,
  watts numeric[] not null,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),

  constraint activity_power_curves_not_empty check (cardinality(secs) > 0),
  constraint activity_power_curves_watts_match_secs check (cardinality(watts) = cardinality(secs))
);

comment on table public.activity_power_curves is
  'Best-power curve per ride, for windowed bests and rating confidence.';

create index activity_power_curves_athlete_date
  on public.activity_power_curves (athlete_id, start_date_local);

alter table public.activity_power_curves enable row level security;

create policy "Staff read activity power curves"
  on public.activity_power_curves for select to authenticated
  using ((select public.is_staff()));

revoke select on public.activity_power_curves from anon, authenticated;
grant select (activity_id, athlete_id, start_date_local, secs, watts, synced_at)
  on public.activity_power_curves to anon, authenticated;

-- v_power_profile -------------------------------------------------------------
-- One row per rider and rated duration, as of today. Windows are the N days
-- ending today, like intervals.icu's `Nd` curves; the season runs from
-- app_settings.season_start.
--
-- W/kg divides each ride's watts by the body weight nearest the ride's date;
-- on equally near days, lab beats anthropometrics beats wellness (KB §6,
-- agreed with Kosta, 10 November 2026).
-- Freshness: 14-day best ÷ 84-day best in watts, % (KB §9).
-- Confidence: high when at least 3 different days in the 84-day window reach
-- 95% of that window's best W/kg (watts without a known weight), KB §6.
--
-- Runs with its owner's rights, as it must read the revoked weight columns;
-- it returns W/kg only, and the staff check is part of the view.

create view public.v_power_profile
with (security_barrier)
as
with settings as (
  select current_date as as_of,
         (select (value #>> '{}')::date from public.app_settings where key = 'season_start') as season_start
),
durations (attribute, duration_s) as (
  values ('p5s'::public.rating_attribute, 5), ('p30s', 30), ('p1m', 60),
         ('p5m', 300), ('p20m', 1200), ('p60m', 3600)
),
weights as (
  select athlete_id, test_date as date, 1 as source_rank, weight_kg
    from public.lab_tests where weight_kg is not null
  union all
  select athlete_id, date, 2, weight_kg
    from public.anthropometrics where weight_kg is not null
  union all
  select athlete_id, date, 3, weight
    from public.wellness where weight is not null
),
rides as (
  select c.athlete_id, c.start_date_local::date as date, c.secs, c.watts, w.weight_kg
    from public.activity_power_curves c
   cross join settings s
    left join lateral (
      select w.weight_kg
        from weights w
       where w.athlete_id = c.athlete_id
       order by abs(w.date - c.start_date_local::date), w.source_rank, w.date
       limit 1
    ) w on true
   where c.start_date_local::date <= s.as_of
     and c.start_date_local::date > least(s.as_of - 84, coalesce(s.season_start, s.as_of) - 1)
),
efforts as (
  select r.athlete_id, r.date, d.attribute, d.duration_s,
         r.watts[array_position(r.secs, d.duration_s)] as watts,
         r.watts[array_position(r.secs, d.duration_s)] / r.weight_kg as wkg
    from rides r
    join durations d on d.duration_s = any (r.secs)
),
bests as (
  select e.athlete_id, e.attribute, e.duration_s,
         max(e.watts) filter (where e.date > s.as_of - 14) as best_14d_w,
         max(e.wkg) filter (where e.date > s.as_of - 14) as best_14d_wkg,
         max(e.watts) filter (where e.date > s.as_of - 42) as best_42d_w,
         max(e.wkg) filter (where e.date > s.as_of - 42) as best_42d_wkg,
         max(e.watts) filter (where e.date > s.as_of - 84) as best_84d_w,
         max(e.wkg) filter (where e.date > s.as_of - 84) as best_84d_wkg,
         max(e.watts) filter (where e.date >= s.season_start) as best_season_w,
         max(e.wkg) filter (where e.date >= s.season_start) as best_season_wkg
    from efforts e
   cross join settings s
   group by e.athlete_id, e.attribute, e.duration_s
),
near_best as (
  select b.athlete_id, b.attribute,
         count(distinct e.date) filter (
           where coalesce(e.wkg >= 0.95 * b.best_84d_wkg, e.watts >= 0.95 * b.best_84d_w)
         )::int as days_near_best_84d
    from bests b
    join efforts e on e.athlete_id = b.athlete_id and e.attribute = b.attribute
   cross join settings s
   where e.date > s.as_of - 84
   group by b.athlete_id, b.attribute
)
select b.athlete_id,
       s.as_of,
       b.attribute,
       b.duration_s,
       b.best_14d_w, b.best_14d_wkg,
       b.best_42d_w, b.best_42d_wkg,
       b.best_84d_w, b.best_84d_wkg,
       b.best_season_w, b.best_season_wkg,
       100 * b.best_14d_w / nullif(b.best_84d_w, 0) as freshness_pct,
       coalesce(n.days_near_best_84d, 0) as days_near_best_84d,
       case
         when b.best_84d_w is null then null
         when n.days_near_best_84d >= 3 then 'high'
         else 'low'
       end::public.rating_confidence as confidence
  from bests b
 cross join settings s
  left join near_best n on n.athlete_id = b.athlete_id and n.attribute = b.attribute
 where (select public.is_staff());

comment on view public.v_power_profile is
  'Best power per rider and rated duration over 14 d, 42 d, 84 d and season, with W/kg, freshness and confidence.';

revoke all on public.v_power_profile from public, anon, authenticated;
grant select on public.v_power_profile to authenticated;
