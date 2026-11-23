-- v_eftp_weekly (TODO 4.3, KB §9): intervals.icu's estimated FTP per rider and
-- week for the Form board's eFTP sparkline, in W and W/kg.
--
-- eFTP sits in wellness raw (sportInfo[].eftp for type Ride), which client roles
-- cannot read: raw and weight are not granted (CLAUDE.md, KB §11). So the view
-- reads a wrapper that runs with its owner's rights, carries the staff check and
-- returns no kg (as v_power_profile, v_durability and v_power_tests do).

create function public.staff_eftp_weekly()
returns table (
  athlete_id text,
  week_start date,
  as_of date,
  eftp_w numeric,
  eftp_wkg numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with daily as (
    select w.athlete_id, w.date, (e->>'eftp')::numeric as eftp_w
      from public.wellness w
     cross join lateral jsonb_array_elements(
       case when jsonb_typeof(w.raw->'sportInfo') = 'array' then w.raw->'sportInfo' else '[]'::jsonb end
     ) e
     where e->>'type' = 'Ride'
       and (e->>'eftp')::numeric > 0
       and w.date > current_date - 182
  ),
  -- The latest eFTP of each week (Monday start).
  weekly as (
    select distinct on (d.athlete_id, date_trunc('week', d.date))
           d.athlete_id, date_trunc('week', d.date)::date as week_start, d.date, d.eftp_w
      from daily d
     order by d.athlete_id, date_trunc('week', d.date), d.date desc
  )
  select k.athlete_id, k.week_start, k.date, round(k.eftp_w),
         round(k.eftp_w / m.weight_kg, 2)
    from weekly k
    left join lateral (
      select b.weight_kg from public.body_mass_as_of(k.date) b where b.athlete_id = k.athlete_id
    ) m on true
   where (select public.is_staff());
$$;

comment on function public.staff_eftp_weekly() is
  'Latest Ride eFTP per rider and week over 26 weeks, with W/kg from the body mass that day; staff only, no kg.';

revoke execute on function public.staff_eftp_weekly() from public, anon;
grant execute on function public.staff_eftp_weekly() to authenticated, service_role;

create view public.v_eftp_weekly
with (security_barrier)
as
select athlete_id, week_start, as_of, eftp_w, eftp_wkg
  from public.staff_eftp_weekly();

comment on view public.v_eftp_weekly is
  'intervals.icu eFTP per rider and week (W and W/kg); staff only.';

revoke all on public.v_eftp_weekly from public, anon, authenticated;
grant select on public.v_eftp_weekly to authenticated;
