-- Synthetic seed data (TODO 9.1): 12 FICTIONAL riders for the local stack.
--
-- Loaded by `supabase db reset` (local) and by CI. Never load it into the live
-- project: no `supabase db push --include-seed`, no pasting into the SQL editor.
-- Every name, number and note below is invented.
--
-- Dates are relative to the day of the reset, so the data is always current:
-- six months of rides, power curves, training load, durability efforts, two
-- INSCYD tests per rider, planned races for 2027 and Roster 2027 rows. Ratings,
-- rider type, CA and PA are not seeded; run the jobs over this data with
--   pnpm seed:derive
-- (supabase/functions/scripts/derive-seed.ts), as the nightly refresh would.
--
-- Two local logins (magic link via Mailpit at http://127.0.0.1:54324):
--   coach@example.com (coach), viewer@example.com (viewer).

-- Deterministic noise ------------------------------------------------------------
-- A uniform number in [0, 1) from a text key, so every reset gives the same data.

create function pg_temp.u(key text) returns double precision
language sql immutable as $$
  select ('x' || substr(md5(key), 1, 8))::bit(32)::bigint / 4294967296.0
$$;

create function pg_temp.r(key text, lo double precision, hi double precision)
returns double precision language sql immutable as $$
  select lo + (hi - lo) * pg_temp.u(key)
$$;

-- Power profile ------------------------------------------------------------------
-- Best W/kg at any duration from the six rated ones (5 s, 30 s, 1, 5, 20, 60 min),
-- interpolated in log-log space and extended below 5 s and beyond 60 min.

create function pg_temp.profile(p double precision[], secs integer)
returns double precision language plpgsql immutable as $$
declare
  anchors integer[] := array[5, 30, 60, 300, 1200, 3600];
  i integer;
begin
  if secs <= 5 then
    return p[1] * (1 + 0.06 * ln(5.0 / secs) / ln(5.0));
  end if;
  if secs >= 3600 then
    return p[6] * (1 - 0.08 * ln(secs / 3600.0) / ln(2.0));
  end if;
  for i in 1..5 loop
    if secs <= anchors[i + 1] then
      return exp(
        ln(p[i]) + (ln(p[i + 1]) - ln(p[i]))
          * (ln(secs::double precision) - ln(anchors[i]::double precision))
          / (ln(anchors[i + 1]::double precision) - ln(anchors[i]::double precision))
      );
    end if;
  end loop;
end;
$$;

-- Riders -------------------------------------------------------------------------
-- Best W/kg per rated duration at peak form (early August), durability as the
-- share of 5/20-min power kept after 20 kJ/kg, and lab values.

create temporary table seed_riders (
  n integer primary key,
  id text not null,
  name text not null,
  dob date not null,
  training_age numeric not null,
  mass numeric not null,
  height numeric not null,
  body_fat numeric not null,
  p double precision[] not null, -- W/kg: 5 s, 30 s, 1 min, 5 min, 20 min, 60 min
  retain double precision not null,
  vo2max numeric not null,
  vlamax numeric not null,
  indoor double precision not null, -- share of rides indoors
  climbing double precision not null, -- metres per hour outdoors
  tier public.roster_tier not null,
  base text not null,
  background text not null
);

insert into seed_riders values
  (1, 'seed-01', 'Alma Kessler', '2001-04-12', 6, 63, 168, 19, array[17.8, 11.9, 9.0, 5.0, 4.05, 3.65], 0.92, 55, 0.72, 0.25, 250, 'core', 'Leipzig', 'Track sprinter, road since 2021'),
  (2, 'seed-02', 'Bea Lindqvist', '2006-09-03', 2, 60, 165, 20, array[16.9, 11.4, 8.9, 5.2, 4.10, 3.70], 0.89, 56, 0.64, 0.30, 280, 'development', 'Halle', 'Former BMX racer'),
  (3, 'seed-03', 'Clara Novák', '1999-02-20', 8, 58, 166, 17, array[15.8, 11.0, 9.2, 5.8, 4.45, 4.00], 0.94, 61, 0.52, 0.20, 400, 'core', 'Dresden', 'Junior national team, then U23'),
  (4, 'seed-04', 'Dana Ferreira', '2004-06-30', 4, 56, 163, 18, array[15.2, 10.7, 8.9, 5.6, 4.30, 3.90], 0.91, 59, 0.50, 0.35, 380, 'core', 'Leipzig', 'Cyclocross in winter'),
  (5, 'seed-05', 'Elin Haugen', '2008-01-15', 1, 54, 162, 19, array[14.6, 10.3, 8.6, 5.4, 4.15, 3.75], 0.88, 57, 0.48, 0.40, 350, 'development', 'Leipzig', 'Cross-country skier, first road season'),
  (6, 'seed-06', 'Frida Moreau', '1997-11-08', 10, 51, 160, 15, array[12.8, 9.0, 7.5, 5.9, 4.95, 4.55], 0.96, 66, 0.33, 0.15, 650, 'core', 'Chemnitz', 'Mountain runner, road since 2016'),
  (7, 'seed-07', 'Greta Vos', '2003-03-25', 5, 52, 161, 17, array[13.2, 9.2, 7.7, 5.7, 4.70, 4.30], 0.93, 63, 0.36, 0.25, 600, 'core', 'Jena', 'Climbing specialist from the U23 ranks'),
  (8, 'seed-08', 'Hanna Brandt', '2007-07-19', 1.5, 50, 158, 18, array[12.6, 8.8, 7.3, 5.5, 4.50, 4.10], 0.90, 62, 0.35, 0.30, 550, 'development', 'Leipzig', 'Triathlete, switched to road in 2025'),
  (9, 'seed-09', 'Ines Kowalski', '1994-05-02', 12, 68, 176, 18, array[13.8, 9.5, 7.7, 5.1, 4.55, 4.30], 0.97, 60, 0.40, 0.20, 300, 'ambassador', 'Leipzig', 'Time trial specialist, road captain'),
  (10, 'seed-10', 'Jule Ambrosi', '2002-10-11', 5, 66, 174, 19, array[14.0, 9.6, 7.8, 5.2, 4.50, 4.20], 0.94, 59, 0.42, 0.30, 320, 'core', 'Magdeburg', 'Rower until 2021'),
  (11, 'seed-11', 'Kaja Petersen', '2000-12-05', 7, 58, 167, 18, array[15.0, 10.3, 8.4, 5.5, 4.40, 4.05], 0.93, 60, 0.45, 0.25, 420, 'ambassador', 'Leipzig', 'All-round racer, strong in crosswinds'),
  (12, 'seed-12', 'Lotte Engel', '2005-08-22', 3, 57, 165, 20, array[14.8, 10.1, 8.2, 5.4, 4.30, 3.95], 0.91, 58, 0.46, 0.35, 400, 'development', 'Erfurt', 'Club racer, first team contract');

insert into public.athletes (id, name, raw)
select id, name, jsonb_build_object('seed', true) from seed_riders;

insert into public.rider_profiles
  (athlete_id, date_of_birth, training_age_years, training_age_entered_on, background, hrv_source, cohort)
select id, dob, training_age, date '2026-01-01', background, 'HRV4Training, Polar H10', 'squad'
  from seed_riders;

-- Lab tests and body measurements --------------------------------------------------
-- A lab test about five months ago and a field test about five weeks ago.

insert into public.lab_tests
  (athlete_id, test_date, method, vo2max_ml_kg_min, vo2max_l_min, vlamax_mmol_l_s, fatmax_w,
   fatmax_g_h, carbmax_g_h, at_w, weight_kg, height_cm, body_fat_pct, tester, notes)
select r.id,
       current_date - t.days_ago,
       t.method::public.lab_test_method,
       round((r.vo2max * t.level)::numeric, 1),
       round((r.vo2max * t.level * (r.mass + t.mass_delta) / 1000)::numeric, 2),
       round((r.vlamax * (2 - t.level))::numeric, 2),
       round((r.p[6] * r.mass * 0.62 * t.level)::numeric),
       round((40 + 30 * (1 - r.vlamax))::numeric),
       round((70 + 80 * r.vlamax)::numeric),
       round((r.p[6] * r.mass * 0.97 * t.level)::numeric),
       r.mass + t.mass_delta,
       r.height,
       r.body_fat + t.mass_delta,
       'Seed Lab',
       t.note
  from seed_riders r
 cross join (values
   (150, 'inscyd_lab', 0.97, 1.0, 'Start of the build phase'),
   (35, 'inscyd_ppd_field', 1.0, 0.0, 'Field test after the race season')
 ) as t (days_ago, method, level, mass_delta, note);

insert into public.anthropometrics (athlete_id, date, height_cm, weight_kg, body_fat_pct, notes)
select id, current_date - 7, height, mass, body_fat, 'Weekly weigh-in'
  from seed_riders;

-- Rides, power curves, durability efforts and training load --------------------------
-- A weekly pattern (Tuesday VO2max, Thursday threshold or sprints, a long Saturday,
-- a group ride on Sunday), races on summer weekends, form peaking in early August
-- and dipping in the off-season, young riders improving through the period.

do $$
declare
  grid integer[] := array[1, 2, 5, 10, 15, 30, 60, 120, 180, 300, 600, 1200, 1800, 3600, 5400, 7200];
  r record;
  d integer;
  day date;
  dow integer;
  kind text;
  key text;
  hours double precision;
  form double precision;
  ftp double precision;
  intensity double precision;
  vi double precision;
  np double precision;
  avg double precision;
  load double precision;
  joules double precision;
  moving integer;
  trainer boolean;
  is_race boolean;
  in_season boolean;
  h_short double precision;
  h_mid double precision;
  h_long double precision;
  secs integer[];
  watts double precision[];
  i integer;
  activity text;
  b integer;
  kjkg double precision;
  ctl double precision;
  atl double precision;
  ctl_hist double precision[];
  day_load double precision;
begin
  for r in select * from seed_riders order by n loop
    ctl := 40 + 2 * r.training_age;
    atl := ctl;
    ctl_hist := array[]::double precision[];

    for d in reverse 182..0 loop
      day := current_date - d;
      dow := extract(dow from day);
      key := r.id || ':' || day;
      in_season := extract(month from day) between 5 and 9;
      day_load := 0;
      kind := null;
      is_race := false;

      -- Today has no ride yet; 8% of days are lost to travel or illness.
      if d > 0 and pg_temp.u(key || ':skip') >= 0.08 then
        kind := case dow
          when 1 then case when pg_temp.u(key || ':mon') < 0.1 then 'recovery' end
          when 2 then 'vo2'
          when 3 then 'endurance'
          when 4 then case when (extract(week from day)::integer % 2) = 0 then 'threshold' else 'sprint' end
          when 5 then case when pg_temp.u(key || ':fri') < 0.5 then 'recovery' end
          when 6 then 'long'
          else 'group'
        end;
        if kind in ('long', 'group') and in_season
           and pg_temp.u(key || ':race') < (case when kind = 'long' then 0.5 else 0.3 end) then
          kind := 'race';
          is_race := true;
        end if;
      end if;

      if kind is not null then
        -- Form: 1.0 at the August peak, about 0.96 now; young riders gain over the period.
        form := (1 - 0.04 * ((d - 100) / 100.0) ^ 2)
          * (1 + 0.06 / (1 + r.training_age) * (1 - d / 182.0));
        ftp := r.p[6] * r.mass * form;

        hours := case kind
          when 'recovery' then pg_temp.r(key || ':h', 0.8, 1.2)
          when 'vo2' then pg_temp.r(key || ':h', 1.5, 2.0)
          when 'endurance' then pg_temp.r(key || ':h', 2.0, 2.6)
          when 'threshold' then pg_temp.r(key || ':h', 1.5, 2.0)
          when 'sprint' then pg_temp.r(key || ':h', 1.5, 2.0)
          when 'long' then pg_temp.r(key || ':h', 3.5, 5.0)
          when 'group' then pg_temp.r(key || ':h', 2.5, 3.5)
          else pg_temp.r(key || ':h', 2.5, 4.0)
        end;
        -- Less volume for riders new to the sport, and in the off-season (October on).
        hours := hours * (0.75 + 0.03 * least(r.training_age, 8))
          * case when day >= date '2026-10-01' then 0.85 else 1 end;
        moving := round(hours * 3600);
        trainer := kind not in ('race', 'long')
          and pg_temp.u(key || ':in') < r.indoor * case when d < 45 then 1.6 else 0.8 end;

        intensity := pg_temp.r(key || ':if', -0.03, 0.03) + case kind
          when 'recovery' then 0.55 when 'endurance' then 0.66 when 'vo2' then 0.78
          when 'threshold' then 0.82 when 'sprint' then 0.70 when 'long' then 0.72
          when 'group' then 0.76 else 0.88 end;
        vi := case when trainer then 1.03 when kind = 'race' then 1.12 else 1.06 end;
        np := intensity * ftp;
        avg := np / vi;
        load := hours * intensity ^ 2 * 100;
        joules := avg * moving;
        day_load := load;

        -- How close to her best each duration band gets on this kind of day.
        select lo_s + (hi_s - lo_s) * pg_temp.u(key || ':s'),
               lo_m + (hi_m - lo_m) * pg_temp.u(key || ':m'),
               lo_l + (hi_l - lo_l) * pg_temp.u(key || ':l')
          into h_short, h_mid, h_long
          from (values
            ('recovery', 0.50, 0.58, 0.50, 0.58, 0.50, 0.58),
            ('endurance', 0.80, 0.90, 0.75, 0.85, 0.72, 0.80),
            ('vo2', 0.80, 0.90, 0.95, 1.00, 0.85, 0.92),
            ('threshold', 0.80, 0.88, 0.90, 0.96, 0.95, 1.00),
            ('sprint', 0.95, 1.00, 0.80, 0.88, 0.75, 0.82),
            ('long', 0.85, 0.95, 0.92, 0.99, 0.88, 0.96),
            ('group', 0.90, 0.98, 0.88, 0.95, 0.82, 0.90),
            ('race', 0.94, 1.00, 0.95, 1.00, 0.94, 1.00)
          ) as h (k, lo_s, hi_s, lo_m, hi_m, lo_l, hi_l)
         where h.k = kind;

        -- The two newest riders skip threshold work: long efforts only count in races,
        -- so their 20/60-min bests rest on few days (low confidence, KB §6).
        if r.training_age < 2 and kind <> 'race' then
          h_long := h_long * 0.9;
        end if;

        secs := array[]::integer[];
        watts := array[]::double precision[];
        foreach i in array grid loop
          exit when i > moving;
          secs := secs || i;
          watts := watts || (
            pg_temp.profile(r.p, i) * r.mass * form
              * case when i <= 60 then h_short when i <= 600 then h_mid else h_long end
          );
        end loop;
        -- A best-power curve never rises with duration.
        for i in reverse (cardinality(watts) - 1)..1 loop
          watts[i] := greatest(watts[i], watts[i + 1]);
        end loop;

        activity := r.id || '-' || to_char(day, 'YYYYMMDD');
        insert into public.activities (id, athlete_id, start_date_local, raw)
        values (
          activity,
          r.id,
          day + time '08:30' + make_interval(mins => floor(pg_temp.r(key || ':t', 0, 150))::integer),
          jsonb_build_object(
            'id', activity,
            'name', case kind
              when 'recovery' then 'Recovery Spin' when 'endurance' then 'Endurance'
              when 'vo2' then 'VO2max 5×4 min' when 'threshold' then 'Threshold 3×12 min'
              when 'sprint' then 'Sprints' when 'long' then 'Long Ride'
              when 'group' then 'Group Ride' else 'Race' end,
            'type', case when trainer then 'VirtualRide' else 'Ride' end,
            'trainer', trainer,
            'race', is_race,
            'source', case when trainer then 'ZWIFT' else 'GARMIN_CONNECT' end,
            'moving_time', moving,
            'elapsed_time', round(moving * case when trainer then 1.0 else 1.08 end),
            'icu_distance', round(moving * case when trainer then 8.9 else 8.1 end * (0.9 + 0.2 * intensity)),
            'total_elevation_gain', case when trainer then 0 else round(r.climbing * hours * pg_temp.r(key || ':e', 0.6, 1.4)) end,
            'icu_training_load', round(load),
            'icu_intensity', round((intensity * 100)::numeric, 1),
            'icu_weighted_avg_watts', round(np),
            'icu_average_watts', round(avg),
            'icu_variability_index', round(vi::numeric, 2),
            'icu_efficiency_factor', round((np / (100 + 70 * intensity))::numeric, 2),
            'icu_joules', round(joules),
            'icu_joules_above_ftp', round(joules * greatest(intensity - 0.6, 0) * 0.3),
            'icu_ftp', round(ftp),
            'average_heartrate', round(100 + 70 * intensity),
            'max_heartrate', round(150 + 40 * intensity),
            'decoupling', round(pg_temp.r(key || ':dc', 1, 6)::numeric, 1)
          )
        );

        insert into public.activity_power_curves (activity_id, athlete_id, start_date_local, secs, watts)
        values (
          activity,
          r.id,
          day + time '08:30',
          secs,
          (select array_agg(round(w::numeric) order by o) from unnest(watts) with ordinality as x (w, o))
        );

        -- Long rides: best 1, 5 and 20 min after 10, 20 and 30 kJ/kg of work (KB §6).
        kjkg := joules / 1000 / r.mass;
        if moving >= 7200 and kind in ('long', 'group', 'race') then
          foreach b in array array[10, 20, 30] loop
            continue when kjkg < b + 4;
            insert into public.durability_efforts (activity_id, kj_kg_bucket, duration_s, watts, wkg)
            select activity, b, x.s,
                   round((x.w * r.retain ^ (b / 20.0) * pg_temp.r(key || ':du' || b || x.s, 0.97, 1.0))::numeric),
                   round((x.w * r.retain ^ (b / 20.0) * pg_temp.r(key || ':du' || b || x.s, 0.97, 1.0) / r.mass)::numeric, 2)
              from unnest(secs, watts) as x (s, w)
             where x.s in (60, 300, 1200);
          end loop;
        end if;
      end if;

      -- Training load as intervals.icu reports it: 42- and 7-day exponential averages.
      ctl := ctl + (day_load - ctl) / 42;
      atl := atl + (day_load - atl) / 7;
      ctl_hist := ctl_hist || ctl;
      insert into public.wellness (athlete_id, date, raw)
      values (
        r.id,
        day,
        jsonb_build_object(
          'id', day,
          'ctl', round(ctl::numeric, 1),
          'atl', round(atl::numeric, 1),
          'rampRate', case when cardinality(ctl_hist) > 7
            then round((ctl - ctl_hist[cardinality(ctl_hist) - 7])::numeric, 1) end,
          -- intervals.icu's power-model estimate, as the live sync stores it.
          'sportInfo', jsonb_build_array(jsonb_build_object(
            'type', 'Ride',
            'eftp', round(r.p[6] * r.mass * (1 - 0.04 * ((d - 100) / 100.0) ^ 2)
                          * (1 + 0.06 / (1 + r.training_age) * (1 - d / 182.0))
                          * pg_temp.r(key || ':eftp', 0.98, 1.02))
          ))
        )
      );
    end loop;
  end loop;
end;
$$;

-- Season, 84-day and 42-day best-power curves as of today, from the rides.

insert into public.power_curves (athlete_id, as_of, time_window, secs, watts, wkg)
select c.athlete_id,
       current_date,
       w.time_window::public.power_curve_window,
       array_agg(c.s order by c.s),
       array_agg(c.best order by c.s),
       array_agg(round(c.best / r.mass, 2) order by c.s)
  from (values
    ('42d', current_date - 41),
    ('84d', current_date - 83),
    ('season', (select (value #>> '{}')::date from public.app_settings where key = 'season_start'))
  ) as w (time_window, from_day)
 cross join lateral (
   select a.athlete_id, x.s, max(x.w) as best
     from public.activity_power_curves a
    cross join unnest(a.secs, a.watts) as x (s, w)
    where a.start_date_local::date >= w.from_day
    group by a.athlete_id, x.s
 ) c
  join seed_riders r on r.id = c.athlete_id
 group by c.athlete_id, w.time_window;

-- Power tests (KB §10) ---------------------------------------------------------------
-- A 20-min FTP test in late August and early November, and a CP test in mid-October
-- (3, 7 and 12 min; every third rider adds a 20-min effort).

insert into public.power_tests (athlete_id, test_date, method, durations_s, watts, notes)
select r.id, current_date - t.days_ago, 'ftp_20min', '{1200}',
       array[round((pg_temp.profile(r.p, 1200) * r.mass * t.level)::numeric)],
       t.note
  from seed_riders r
 cross join (values
   (88, 0.99, 'Outdoor climb, dry'),
   (17, 0.96, 'Indoor on the smart trainer')
 ) as t (days_ago, level, note);

insert into public.power_tests (athlete_id, test_date, method, durations_s, watts, notes)
select r.id, current_date - 38, 'cp', d.durations,
       (select array_agg(
                 round((pg_temp.profile(r.p, s) * r.mass * 0.98
                        * pg_temp.r(r.id || ':cp' || s, 0.97, 1.03))::numeric)
                 order by s)
          from unnest(d.durations) as s),
       'Track session, full recovery between efforts'
  from seed_riders r
 cross join lateral (
   select case when r.n % 3 = 0 then '{180,420,720,1200}'::integer[] else '{180,420,720}'::integer[] end
 ) as d (durations);

-- Planned races and workouts ----------------------------------------------------------

insert into public.planned_events (id, athlete_id, start_date_local, raw)
select r.id || '-race-' || e.n,
       r.id,
       e.day + time '10:00',
       jsonb_build_object(
         'category', e.category, 'type', 'Ride', 'name', e.name,
         'icu_training_load', e.load, 'moving_time', e.moving
       )
  from seed_riders r
 cross join (values
   (1, date '2027-02-27', 'RACE_C', 'Season Opener (Synthetic)', 180, 10800),
   (2, date '2027-03-21', 'RACE_B', 'Spring Classic (Synthetic)', 240, 13500),
   (3, date '2027-04-18', 'RACE_A', 'Stage Race Stage 1 (Synthetic)', 220, 12600)
 ) as e (n, day, category, name, load, moving)
 -- Development riders skip the A race.
 where not (r.tier = 'development' and e.category = 'RACE_A');

insert into public.planned_events (id, athlete_id, start_date_local, raw)
select r.id || '-plan-' || to_char(day, 'YYYYMMDD'),
       r.id,
       day + time '09:00',
       jsonb_build_object(
         'category', 'WORKOUT', 'type', 'Ride',
         'name', case extract(dow from day) when 2 then 'VO2max 5×4 min' when 4 then 'Threshold 3×12 min' else 'Long Ride' end,
         'icu_training_load', case extract(dow from day) when 6 then 210 else 95 end,
         'moving_time', case extract(dow from day) when 6 then 14400 else 6300 end
       )
  from seed_riders r
 cross join generate_series(current_date + 1, current_date + 28, interval '1 day') as g (ts)
 cross join lateral (select g.ts::date as day) d
 where extract(dow from day) in (2, 4, 6);

-- Roster 2027 ---------------------------------------------------------------------------

insert into public.roster_entries
  (season, rider_name, athlete_id, tier, base, weight_kg, p20m_w, p20m_wkg, p5m_w, p5m_wkg,
   p1m_w, p1m_wkg, data_quality, race_score, team_score, scouting_notes, staff_notes)
select 2027, r.name, r.id, r.tier, r.base, r.mass,
       round((r.p[5] * r.mass)::numeric), round(r.p[5]::numeric, 2),
       round((r.p[4] * r.mass)::numeric), round(r.p[4]::numeric, 2),
       round((r.p[3] * r.mass)::numeric), round(r.p[3]::numeric, 2),
       (array['modelled', 'sub_maximal', 'garmin_estimate'])[1 + r.n % 3]::public.roster_data_quality,
       1 + (2 * r.n) % 5,
       1 + (r.n * r.n) % 5,
       'Synthetic rider for local testing. ' || r.background || '.',
       'Synthetic call note: keen to race abroad.'
  from seed_riders r;

-- Sync log --------------------------------------------------------------------------------
-- Last night's sync for every rider, so the sync banner shows a healthy state.

insert into public.sync_runs (job, status, started_at, finished_at, athlete_ids, counts, api_calls, rate_limit_remaining)
select 'sync-nightly', 'succeeded',
       current_date + time '02:30', current_date + time '02:34',
       array_agg(id order by n),
       '{"activities": 12, "wellness": 12, "power_curves": 36}'::jsonb, 60, 940
  from seed_riders;

-- Local logins ------------------------------------------------------------------------------

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       '', now(), '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', ''
  from (values
    ('00000000-0000-4000-8000-00000000c0ac'::uuid, 'coach@example.com'),
    ('00000000-0000-4000-8000-0000000071e3'::uuid, 'viewer@example.com')
  ) as u (id, email);

insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
select gen_random_uuid(), id, id::text, 'email',
       jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true), now(), now(), now()
  from auth.users
 where email in ('coach@example.com', 'viewer@example.com');

insert into public.staff (user_id, display_name, role)
values
  ('00000000-0000-4000-8000-00000000c0ac', 'Local Coach', 'coach'),
  ('00000000-0000-4000-8000-0000000071e3', 'Local Viewer', 'viewer');
