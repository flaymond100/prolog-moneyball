-- lab_tests (INSCYD) and anthropometrics, with range checks from KB §10 and
-- an edit history. Coach writes (KB §5). Reads follow KB §11: lab tests for
-- coach, analyst and medical; body measurements for coach and medical only.

-- readable validation -------------------------------------------------------
-- Used inside check constraints so out-of-range values fail with a message a
-- coach can act on instead of a constraint name.

create function public.assert_in_range(val numeric, lo numeric, hi numeric, label text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if val is null or val between lo and hi then
    return true;
  end if;
  raise exception using
    errcode = 'check_violation',
    message = format('%s must be between %s and %s (got %s).', label, lo, hi, val);
end;
$$;

create function public.assert_not_future(val date, label text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if val is null or val <= current_date then
    return true;
  end if;
  raise exception using
    errcode = 'check_violation',
    message = format('%s cannot be in the future (got %s).', label, val);
end;
$$;

-- edit history --------------------------------------------------------------

create table public.edit_history (
  id bigint generated always as identity primary key,
  table_name text not null,
  athlete_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid, -- auth.uid() of the editor; null for service-role writes
  changed_at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

comment on table public.edit_history is
  'Append-only edit log for manually entered tables, written by trigger.';

create index edit_history_lookup_idx
  on public.edit_history (table_name, athlete_id, changed_at desc);

-- security definer so the log is written whatever the editor can see.
create function public.log_edit_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete_id text;
begin
  if tg_op = 'DELETE' then
    v_athlete_id := old.athlete_id;
  else
    v_athlete_id := new.athlete_id;
  end if;

  insert into public.edit_history (table_name, athlete_id, operation, changed_by, old_row, new_row)
  values (
    tg_table_name,
    v_athlete_id,
    tg_op,
    auth.uid(),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

-- lab_tests -----------------------------------------------------------------

create type public.lab_test_method as enum ('inscyd_lab', 'inscyd_ppd_field');

create table public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null references public.athletes (id) on delete cascade,
  test_date date not null check (public.assert_not_future(test_date, 'Test date')),
  -- inscyd_ppd_field results are modelled estimates (KB §10).
  method public.lab_test_method not null,
  vo2max_ml_kg_min numeric check (public.assert_in_range(vo2max_ml_kg_min, 30, 90, 'VO2max (mL/kg/min)')),
  vo2max_l_min numeric check (public.assert_in_range(vo2max_l_min, 1.5, 6.0, 'VO2max (L/min)')),
  vlamax_mmol_l_s numeric check (public.assert_in_range(vlamax_mmol_l_s, 0.1, 1.5, 'VLamax (mmol/L/s)')),
  fatmax_w numeric check (public.assert_in_range(fatmax_w, 50, 400, 'FatMax (W)')),
  fatmax_g_h numeric check (public.assert_in_range(fatmax_g_h, 10, 120, 'FatMax (g/h)')),
  carbmax_g_h numeric check (public.assert_in_range(carbmax_g_h, 20, 200, 'CarbMax (g/h)')),
  at_w numeric check (public.assert_in_range(at_w, 100, 450, 'Anaerobic threshold (W)')),
  weight_kg numeric check (public.assert_in_range(weight_kg, 35, 100, 'Weight (kg)')),
  height_cm numeric check (public.assert_in_range(height_cm, 140, 200, 'Height (cm)')),
  body_fat_pct numeric check (public.assert_in_range(body_fat_pct, 5, 40, 'Body fat (%)')),
  tester text,
  notes text,
  entered_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lab_tests_one_per_athlete_date_method unique (athlete_id, test_date, method)
);

comment on table public.lab_tests is
  'INSCYD lab and field test results, entered manually (KB §10).';

create trigger lab_tests_set_updated_at
  before update on public.lab_tests
  for each row execute function public.set_updated_at();

create trigger lab_tests_log_edit_history
  after insert or update or delete on public.lab_tests
  for each row execute function public.log_edit_history();

-- anthropometrics -----------------------------------------------------------

create table public.anthropometrics (
  athlete_id text not null references public.athletes (id) on delete cascade,
  date date not null check (public.assert_not_future(date, 'Date')),
  height_cm numeric check (public.assert_in_range(height_cm, 140, 200, 'Height (cm)')),
  weight_kg numeric check (public.assert_in_range(weight_kg, 35, 100, 'Weight (kg)')),
  body_fat_pct numeric check (public.assert_in_range(body_fat_pct, 5, 40, 'Body fat (%)')),
  notes text,
  entered_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (athlete_id, date)
);

comment on table public.anthropometrics is
  'Height, weight and body fat measured outside lab tests.';

create trigger anthropometrics_set_updated_at
  before update on public.anthropometrics
  for each row execute function public.set_updated_at();

create trigger anthropometrics_log_edit_history
  after insert or update or delete on public.anthropometrics
  for each row execute function public.log_edit_history();

-- RLS -----------------------------------------------------------------------

alter table public.lab_tests enable row level security;
alter table public.anthropometrics enable row level security;
alter table public.edit_history enable row level security;

create policy "Coach, analyst and medical read lab tests"
  on public.lab_tests for select to authenticated
  using (
    (select public.has_role('coach'))
    or (select public.has_role('analyst'))
    or (select public.has_role('medical'))
  );

create policy "Coach inserts lab tests"
  on public.lab_tests for insert to authenticated
  with check ((select public.has_role('coach')));

create policy "Coach updates lab tests"
  on public.lab_tests for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));

create policy "Coach deletes lab tests"
  on public.lab_tests for delete to authenticated
  using ((select public.has_role('coach')));

-- Body measurements in kg are coach and medical only (KB §11).
create policy "Coach and medical read anthropometrics"
  on public.anthropometrics for select to authenticated
  using ((select public.has_role('coach')) or (select public.has_role('medical')));

create policy "Coach inserts anthropometrics"
  on public.anthropometrics for insert to authenticated
  with check ((select public.has_role('coach')));

create policy "Coach updates anthropometrics"
  on public.anthropometrics for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));

create policy "Coach deletes anthropometrics"
  on public.anthropometrics for delete to authenticated
  using ((select public.has_role('coach')));

-- History rows hold weights, so the same coach-and-medical rule applies.
-- No write policies: only the trigger writes.
create policy "Coach and medical read edit history"
  on public.edit_history for select to authenticated
  using ((select public.has_role('coach')) or (select public.has_role('medical')));
