-- power_tests (KB §10, agreed with Kosta, 23 November 2026): classic 20-min FTP
-- tests and Critical Power tests, entered manually by the coach. Results are shown
-- and tracked only; ratings and CA keep using the power curves.
--
-- The table stores the efforts (duration and mean power); FTP, CP and W′ are
-- worked out from them in packages/metrics. v_power_tests adds W/kg from the body
-- mass on the test day, so client roles never read kg (CLAUDE.md, KB §11).
-- RLS: performance data, so all staff read; the coach writes.

create type public.power_test_method as enum ('ftp_20min', 'cp');

create table public.power_tests (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null references public.athletes (id) on delete cascade,
  test_date date not null check (public.assert_not_future(test_date, 'Test date')),
  method public.power_test_method not null,
  -- Maximal efforts, shortest first: duration in seconds and mean power in watts.
  durations_s integer[] not null,
  watts numeric[] not null,
  -- The intervals.icu ride the test was done in, when known.
  activity_id text references public.activities (id) on delete set null,
  notes text,
  entered_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint power_tests_one_per_athlete_date_method unique (athlete_id, test_date, method),
  constraint power_tests_efforts_match check (cardinality(watts) = cardinality(durations_s)),
  constraint power_tests_watts_valid check (0 < all (watts) and 2500 >= all (watts)),
  -- The classic FTP test is one 20-min effort.
  constraint power_tests_ftp_20min_effort check (method <> 'ftp_20min' or durations_s = '{1200}'),
  -- CP: 2–4 maximal efforts between 2 and 20 min, each a different length.
  constraint power_tests_cp_efforts check (
    method <> 'cp' or (
      cardinality(durations_s) between 2 and 4
      and 120 <= all (durations_s) and 1200 >= all (durations_s)
      and public.is_strictly_increasing(durations_s::numeric[])
    )
  )
);

comment on table public.power_tests is
  'FTP (20-min) and Critical Power field tests: efforts per test, entered by the coach (KB §10).';

create index power_tests_athlete_date_idx on public.power_tests (athlete_id, test_date);

create trigger power_tests_set_updated_at
  before update on public.power_tests
  for each row execute function public.set_updated_at();

create trigger power_tests_log_edit_history
  after insert or update or delete on public.power_tests
  for each row execute function public.log_edit_history();

alter table public.power_tests enable row level security;

create policy "Staff read power tests"
  on public.power_tests for select to authenticated
  using ((select public.is_staff()));

create policy "Coach inserts power tests"
  on public.power_tests for insert to authenticated
  with check ((select public.has_role('coach')));

create policy "Coach updates power tests"
  on public.power_tests for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));

create policy "Coach deletes power tests"
  on public.power_tests for delete to authenticated
  using ((select public.has_role('coach')));

revoke all on public.power_tests from anon;

-- v_power_tests ----------------------------------------------------------------
-- Each test with the W/kg of every effort, from the body mass on or before the
-- test day (body_mass_as_of). A view runs its functions with the caller's
-- rights, so it reads a wrapper that runs with its owner's rights and carries
-- the staff check (as v_power_profile and v_durability do). No kg leaves it.

create function public.staff_power_tests()
returns table (
  id uuid,
  athlete_id text,
  test_date date,
  method public.power_test_method,
  durations_s integer[],
  watts numeric[],
  wkg numeric[],
  activity_id text,
  notes text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.athlete_id, t.test_date, t.method, t.durations_s, t.watts,
         case when m.weight_kg is not null then
           (select array_agg(round(w / m.weight_kg, 2) order by i)
              from unnest(t.watts) with ordinality as e (w, i))
         end,
         t.activity_id, t.notes, t.created_at
    from public.power_tests t
    left join lateral (
      select b.weight_kg from public.body_mass_as_of(t.test_date) b where b.athlete_id = t.athlete_id
    ) m on true
   where (select public.is_staff());
$$;

comment on function public.staff_power_tests() is
  'Power tests with W/kg per effort for staff; runs as owner so no kg column is exposed.';

revoke execute on function public.staff_power_tests() from public, anon;
grant execute on function public.staff_power_tests() to authenticated, service_role;

create view public.v_power_tests
with (security_barrier)
as
select id, athlete_id, test_date, method, durations_s, watts, wkg, activity_id, notes, created_at
  from public.staff_power_tests();

comment on view public.v_power_tests is
  'Power tests with W/kg per effort from the body mass on the test day; staff only.';

revoke all on public.v_power_tests from public, anon, authenticated;
grant select on public.v_power_tests to authenticated;

-- Prior: the 20-min FTP factor --------------------------------------------------

alter table public.model_priors drop constraint model_priors_model_check;
alter table public.model_priors add constraint model_priors_model_check
  check (model in ('rider_type', 'pa', 'readiness', 'power_test'));

insert into public.model_priors (key, model, value, unit, label, status, citation)
values (
  'ftp.factor_20min', 'power_test', '0.95', '×', 'FTP Factor: 20-Min Test', 'source',
  'Allen & Coggan, Training and Racing with a Power Meter (KB §10): FTP = 95% of 20-min power'
)
on conflict (key) do nothing;
