-- Body mass as of a day (TODO 7.3, KB §7): the CA job gives the climber
-- bonus to riders at or under a body mass, and may run for a past day.
--
-- One row per rider with a stored weight: the latest on or before p_as_of;
-- on one day lab beats anthropometrics beats wellness, as for W/kg (KB §6).
-- Service role only: it returns kg (KB §11). Coach and medical read
-- v_body_mass.

create function public.body_mass_as_of(p_as_of date)
returns table (
  athlete_id text,
  weight_kg numeric
)
language sql
stable
set search_path = ''
as $$
  select distinct on (w.athlete_id) w.athlete_id, w.weight_kg
    from (
      select l.athlete_id, l.test_date as date, 1 as source_rank, l.weight_kg
        from public.lab_tests l where l.weight_kg is not null
      union all
      select a.athlete_id, a.date, 2, a.weight_kg
        from public.anthropometrics a where a.weight_kg is not null
      union all
      select s.athlete_id, s.date, 3, s.weight
        from public.wellness s where s.weight is not null
    ) w
   where w.date <= p_as_of
   order by w.athlete_id, w.date desc, w.source_rank;
$$;

comment on function public.body_mass_as_of(date) is
  'Latest body weight per rider on or before a day; service role only.';

revoke execute on function public.body_mass_as_of(date) from public, anon, authenticated;
grant execute on function public.body_mass_as_of(date) to service_role;
