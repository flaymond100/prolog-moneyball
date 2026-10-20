-- Special-category data (KB §11): the consents ledger, cycle_data and
-- medical_markers. Cycle data and medical markers are visible only to the
-- medical role, and only while the rider has an active consent for that scope.

-- consents ------------------------------------------------------------------

create type public.consent_scope as enum
  ('cycle_data', 'medical_markers', 'recruitment_assessment');

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null references public.athletes (id) on delete cascade,
  scope public.consent_scope not null,
  policy_version text not null check (btrim(policy_version) <> ''),
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  withdrawn_by uuid references auth.users (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),

  constraint consents_withdrawn_after_granted check (withdrawn_at >= granted_at)
);

comment on table public.consents is
  'Consent ledger for voluntary data (KB §11); a row is active until withdrawn.';

-- At most one active consent per rider and scope.
create unique index consents_one_active_idx
  on public.consents (athlete_id, scope) where withdrawn_at is null;

-- The ledger is append-only: an update may only record a withdrawal, once.
create function public.guard_consent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.withdrawn_at is not null then
    raise exception using
      errcode = 'check_violation',
      message = 'This consent is already withdrawn; record a new consent instead.';
  end if;
  if (new.id, new.athlete_id, new.scope, new.policy_version, new.granted_at, new.recorded_by, new.created_at)
     is distinct from
     (old.id, old.athlete_id, old.scope, old.policy_version, old.granted_at, old.recorded_by, old.created_at) then
    raise exception using
      errcode = 'check_violation',
      message = 'A consent can only be withdrawn; record a new consent to change it.';
  end if;
  new.withdrawn_by := coalesce(new.withdrawn_by, auth.uid());
  return new;
end;
$$;

create trigger consents_guard_update
  before update on public.consents
  for each row execute function public.guard_consent_update();

-- security definer so RLS policies on other tables can check consent
-- whatever the caller can see of the ledger.
create function public.has_active_consent(p_athlete_id text, p_scope public.consent_scope)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.consents
     where athlete_id = p_athlete_id
       and scope = p_scope
       and granted_at <= now()
       and withdrawn_at is null
  );
$$;

comment on function public.has_active_consent(text, public.consent_scope) is
  'True when the rider has an active, unwithdrawn consent for the scope.';

revoke execute on function public.has_active_consent(text, public.consent_scope) from public, anon;
grant execute on function public.has_active_consent(text, public.consent_scope) to authenticated, service_role;

-- cycle_data ----------------------------------------------------------------
-- menstrualPhase* fields routed here by the sync, only while a cycle_data
-- consent is active (KB §4, §11).

create table public.cycle_data (
  athlete_id text not null references public.athletes (id) on delete cascade,
  date date not null, -- local date of the wellness record
  raw jsonb not null, -- only the menstrualPhase* fields
  synced_at timestamptz not null default now(),

  phase text generated always as (raw->>'menstrualPhase') stored,
  phase_predicted text generated always as (raw->>'menstrualPhasePredicted') stored,

  primary key (athlete_id, date)
);

comment on table public.cycle_data is
  'Cycle phase by day; medical role with active consent only (KB §11).';

-- Defence in depth: cycle fields never land in wellness.raw (KB §11).
alter table public.wellness
  add constraint wellness_no_cycle_fields
  check (not (raw ?| array['menstrualPhase', 'menstrualPhasePredicted']));

-- medical_markers -----------------------------------------------------------
-- Blood markers such as ferritin and haemoglobin, entered by medical staff.
-- No edit_history trigger: that log is readable by the coach.

create table public.medical_markers (
  id uuid primary key default gen_random_uuid(),
  athlete_id text not null references public.athletes (id) on delete cascade,
  measured_on date not null check (public.assert_not_future(measured_on, 'Measurement date')),
  marker text not null check (btrim(marker) <> ''),
  value numeric not null,
  unit text not null,
  notes text,
  entered_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint medical_markers_one_per_day unique (athlete_id, measured_on, marker)
);

comment on table public.medical_markers is
  'Medical markers; medical role with active consent only (KB §11).';

create trigger medical_markers_set_updated_at
  before update on public.medical_markers
  for each row execute function public.set_updated_at();

-- RLS -----------------------------------------------------------------------

alter table public.consents enable row level security;
alter table public.cycle_data enable row level security;
alter table public.medical_markers enable row level security;

-- Consents are managed by medical staff (KB §12); no deletes, it is a ledger.
create policy "Medical reads consents"
  on public.consents for select to authenticated
  using ((select public.has_role('medical')));

create policy "Medical records consents"
  on public.consents for insert to authenticated
  with check ((select public.has_role('medical')));

create policy "Medical withdraws consents"
  on public.consents for update to authenticated
  using ((select public.has_role('medical')))
  with check ((select public.has_role('medical')));

-- Cycle data: medical reads with consent; only the sync writes.
create policy "Medical reads consented cycle data"
  on public.cycle_data for select to authenticated
  using ((select public.has_role('medical')) and public.has_active_consent(athlete_id, 'cycle_data'));

-- Medical markers: medical reads and writes with consent.
create policy "Medical reads consented medical markers"
  on public.medical_markers for select to authenticated
  using ((select public.has_role('medical')) and public.has_active_consent(athlete_id, 'medical_markers'));

create policy "Medical inserts consented medical markers"
  on public.medical_markers for insert to authenticated
  with check ((select public.has_role('medical')) and public.has_active_consent(athlete_id, 'medical_markers'));

create policy "Medical updates consented medical markers"
  on public.medical_markers for update to authenticated
  using ((select public.has_role('medical')) and public.has_active_consent(athlete_id, 'medical_markers'))
  with check ((select public.has_role('medical')) and public.has_active_consent(athlete_id, 'medical_markers'));

create policy "Medical deletes consented medical markers"
  on public.medical_markers for delete to authenticated
  using ((select public.has_role('medical')) and public.has_active_consent(athlete_id, 'medical_markers'));
