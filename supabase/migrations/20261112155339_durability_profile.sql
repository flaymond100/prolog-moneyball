-- Durability (TODO 5.6, KB §6): which rides the compute-durability job still
-- has to work on, and each rider's retained % of fresh power after
-- accumulated work.

-- durability_candidates(p_after, p_limit) ----------------------------------------
-- Rides over 2 h with a power curve that started after p_after and have no
-- durability_efforts yet, oldest first, so p_after also works as a cursor.
-- Each comes with the ride's stored best-power curve, to check the job's own
-- stream arithmetic against, and the body weight nearest the ride's date (lab
-- beats anthropometrics beats wellness on equally near days, as for W/kg,
-- KB §6). Weight is null when the rider has none: kJ/kg cannot be worked out.
-- Service role only: it returns kg (KB §11).

create function public.durability_candidates(p_after timestamp, p_limit integer)
returns table (
  activity_id text,
  athlete_id text,
  start_date_local timestamp,
  weight_kg numeric,
  curve_secs integer[],
  curve_watts numeric[]
)
language sql
stable
set search_path = ''
as $$
  select a.id, a.athlete_id, a.start_date_local, w.weight_kg, c.secs, c.watts
    from public.activities a
    join public.activity_power_curves c on c.activity_id = a.id
    left join lateral (
      select w.weight_kg
        from (
          select l.athlete_id, l.test_date as date, 1 as source_rank, l.weight_kg
            from public.lab_tests l where l.weight_kg is not null
          union all
          select n.athlete_id, n.date, 2, n.weight_kg
            from public.anthropometrics n where n.weight_kg is not null
          union all
          select s.athlete_id, s.date, 3, s.weight
            from public.wellness s where s.weight is not null
        ) w
       where w.athlete_id = a.athlete_id
       order by abs(w.date - a.start_date_local::date), w.source_rank, w.date
       limit 1
    ) w on true
   where a.moving_time > 7200
     and a.start_date_local > p_after
     and not exists (select 1 from public.durability_efforts d where d.activity_id = a.id)
   order by a.start_date_local, a.id
   limit p_limit;
$$;

comment on function public.durability_candidates(timestamp, integer) is
  'Rides over 2 h without durability efforts yet, with their power curve and the nearest body weight; service role only.';

revoke execute on function public.durability_candidates(timestamp, integer) from public, anon, authenticated;
grant execute on function public.durability_candidates(timestamp, integer) to service_role;

-- durability_profile(p_as_of) ------------------------------------------------------
-- One row per rider, work bucket (10/20/30 kJ/kg) and duration (1/5/20 min):
-- the best power after that much work in the 84 days ending on p_as_of, the
-- fresh 84-day best for the same duration (power_profile), and the retained
-- %, never above 100 (KB §6; fresh = 84-day best, agreed with Kosta,
-- 12 November 2026).
-- Service role only, like power_profile. Staff read v_durability.

create function public.durability_profile(p_as_of date)
returns table (
  athlete_id text,
  as_of date,
  kj_kg_bucket smallint,
  duration_s integer,
  best_84d_w numeric,
  fresh_84d_w numeric,
  retained_pct numeric
)
language sql
stable
set search_path = ''
as $$
  with post as (
    select a.athlete_id, d.kj_kg_bucket, d.duration_s, max(d.watts) as best_84d_w
      from public.durability_efforts d
      join public.activities a on a.id = d.activity_id
     where a.start_date_local::date <= p_as_of
       and a.start_date_local::date > p_as_of - 84
     group by a.athlete_id, d.kj_kg_bucket, d.duration_s
  )
  select p.athlete_id,
         p_as_of,
         p.kj_kg_bucket,
         p.duration_s,
         p.best_84d_w,
         f.best_84d_w,
         least(100 * p.best_84d_w / nullif(f.best_84d_w, 0), 100)
    from post p
    left join public.power_profile(p_as_of) f
      on f.athlete_id = p.athlete_id and f.duration_s = p.duration_s;
$$;

comment on function public.durability_profile(date) is
  'Best power after 10/20/30 kJ/kg over 84 days and retained % of the fresh 84-day best; service role only.';

revoke execute on function public.durability_profile(date) from public, anon, authenticated;
grant execute on function public.durability_profile(date) to service_role;

-- v_durability ---------------------------------------------------------------------
-- The same rows for staff, as of today. A view runs its functions with the
-- caller's rights, so it reads a wrapper that runs with its owner's rights and
-- carries the staff check (as v_power_profile does).

create function public.staff_durability_profile(p_as_of date)
returns table (
  athlete_id text,
  as_of date,
  kj_kg_bucket smallint,
  duration_s integer,
  best_84d_w numeric,
  fresh_84d_w numeric,
  retained_pct numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.* from public.durability_profile(p_as_of) p where (select public.is_staff());
$$;

comment on function public.staff_durability_profile(date) is
  'durability_profile for staff; empty for anyone else.';

revoke execute on function public.staff_durability_profile(date) from public, anon;
grant execute on function public.staff_durability_profile(date) to authenticated, service_role;

create view public.v_durability
with (security_barrier)
as
select p.athlete_id,
       p.as_of,
       p.kj_kg_bucket,
       p.duration_s,
       p.best_84d_w,
       p.fresh_84d_w,
       p.retained_pct
  from public.staff_durability_profile(current_date) p;

comment on view public.v_durability is
  'Best power per rider after 10/20/30 kJ/kg over 84 days, with retained % of the fresh 84-day best.';

revoke all on public.v_durability from public, anon, authenticated;
grant select on public.v_durability to authenticated;
