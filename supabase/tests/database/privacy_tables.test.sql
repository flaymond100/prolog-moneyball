begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

-- Fixtures (as postgres) ------------------------------------------------------

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'coach@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'analyst@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'medical@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'viewer@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'outsider@test.local');

insert into public.staff (user_id, role) values
  ('00000000-0000-0000-0000-000000000001', 'coach'),
  ('00000000-0000-0000-0000-000000000002', 'analyst'),
  ('00000000-0000-0000-0000-000000000003', 'medical'),
  ('00000000-0000-0000-0000-000000000004', 'viewer');

-- i1 consents to both scopes; i2 consented to cycle data and withdrew; i3 never did.
insert into public.athletes (id, name) values ('i1', 'Rider One'), ('i2', 'Rider Two'), ('i3', 'Rider Three');
insert into public.consents (athlete_id, scope, policy_version, granted_at) values
  ('i1', 'cycle_data', 'v1', now() - interval '30 days'),
  ('i1', 'medical_markers', 'v1', now() - interval '30 days');
insert into public.consents (athlete_id, scope, policy_version, granted_at, withdrawn_at) values
  ('i2', 'cycle_data', 'v1', now() - interval '30 days', now() - interval '1 day');

insert into public.cycle_data (athlete_id, date, raw) values
  ('i1', '2026-10-18', '{"menstrualPhase": "FOLLICULAR", "menstrualPhasePredicted": "FOLLICULAR"}'),
  ('i2', '2026-10-18', '{"menstrualPhase": "LUTEAL"}'),
  ('i3', '2026-10-18', '{"menstrualPhase": "LUTEAL"}');
insert into public.medical_markers (athlete_id, measured_on, marker, value, unit) values
  ('i1', '2026-10-01', 'ferritin', 42, 'µg/L'),
  ('i3', '2026-10-01', 'ferritin', 18, 'µg/L');

-- Schema ----------------------------------------------------------------------

select has_table('public', 'consents', 'consents exists');
select has_table('public', 'cycle_data', 'cycle_data exists');
select has_table('public', 'medical_markers', 'medical_markers exists');
select is(
  (select count(*)::int from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('consents', 'cycle_data', 'medical_markers')
      and c.relrowsecurity),
  3,
  'RLS is enabled on every privacy table'
);
select enum_has_labels('public', 'consent_scope',
  array['cycle_data', 'medical_markers', 'recruitment_assessment'], 'consent_scope labels (KB §11)');
select is((select phase from public.cycle_data where athlete_id = 'i1'), 'FOLLICULAR',
  'cycle_data.phase from raw menstrualPhase');

-- Wellness never holds cycle fields --------------------------------------------

select throws_ok(
  $$insert into public.wellness (athlete_id, date, raw) values ('i1', '2026-10-18', '{"hrv": 80, "menstrualPhase": "LUTEAL"}')$$,
  '23514', null, 'wellness rejects menstrualPhase');
select throws_ok(
  $$insert into public.wellness (athlete_id, date, raw) values ('i1', '2026-10-18', '{"menstrualPhasePredicted": "LUTEAL"}')$$,
  '23514', null, 'wellness rejects menstrualPhasePredicted');
select lives_ok(
  $$insert into public.wellness (athlete_id, date, raw) values ('i1', '2026-10-18', '{"hrv": 80}')$$,
  'wellness accepts records without cycle fields');

-- Consent helper ----------------------------------------------------------------

select ok(public.has_active_consent('i1', 'cycle_data'), 'i1 has active cycle consent');
select ok(not public.has_active_consent('i2', 'cycle_data'), 'a withdrawn consent is not active');
select ok(not public.has_active_consent('i3', 'medical_markers'), 'no consent is not active');
select throws_ok(
  $$insert into public.consents (athlete_id, scope, policy_version) values ('i1', 'cycle_data', 'v2')$$,
  '23505', null, 'one active consent per rider and scope');
select throws_ok(
  $$insert into public.consents (athlete_id, scope, policy_version) values ('i3', 'cycle_data', ' ')$$,
  '23514', null, 'policy version is required');

-- Coach, analyst and viewer see nothing ---------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.cycle_data', 'coach: cannot read cycle data');
select is_empty('select * from public.medical_markers', 'coach: cannot read medical markers');
select is_empty('select * from public.consents', 'coach: cannot read consents');
select throws_ok(
  $$insert into public.consents (athlete_id, scope, policy_version) values ('i3', 'cycle_data', 'v1')$$,
  '42501', null, 'coach: cannot record consents');
select throws_ok(
  $$insert into public.medical_markers (athlete_id, measured_on, marker, value, unit)
    values ('i1', '2026-10-02', 'ferritin', 40, 'µg/L')$$,
  '42501', null, 'coach: cannot enter medical markers');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.cycle_data', 'analyst: cannot read cycle data');
select is_empty('select * from public.medical_markers', 'analyst: cannot read medical markers');
select is_empty('select * from public.consents', 'analyst: cannot read consents');
reset role;

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000004", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.cycle_data', 'viewer: cannot read cycle data');
select is_empty('select * from public.medical_markers', 'viewer: cannot read medical markers');
reset role;

-- Medical: only riders with an active consent ----------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
set local role authenticated;
select results_eq('select athlete_id from public.cycle_data', $$values ('i1')$$,
  'medical: reads cycle data only with active consent');
select results_eq('select athlete_id from public.medical_markers', $$values ('i1')$$,
  'medical: reads medical markers only with active consent');
select is((select count(*)::int from public.consents), 3, 'medical: reads the consent ledger');
select lives_ok(
  $$insert into public.medical_markers (athlete_id, measured_on, marker, value, unit)
    values ('i1', '2026-10-02', 'haemoglobin', 13.1, 'g/dL')$$,
  'medical: enters a marker with consent');
select throws_ok(
  $$insert into public.medical_markers (athlete_id, measured_on, marker, value, unit)
    values ('i3', '2026-10-02', 'haemoglobin', 12.5, 'g/dL')$$,
  '42501', null, 'medical: cannot enter a marker without consent');
select throws_ok(
  $$insert into public.medical_markers (athlete_id, measured_on, marker, value, unit)
    values ('i1', current_date + 1, 'ferritin', 40, 'µg/L')$$,
  '23514', 'Measurement date cannot be in the future (got ' || (current_date + 1) || ').',
  'medical: measurement date cannot be in the future');

select lives_ok(
  $$update public.consents set withdrawn_at = now() where athlete_id = 'i1' and scope = 'cycle_data'$$,
  'medical: records a withdrawal');
select is_empty('select * from public.cycle_data', 'medical: cycle data hidden after withdrawal');
select is((select withdrawn_by from public.consents where athlete_id = 'i1' and scope = 'cycle_data'),
  '00000000-0000-0000-0000-000000000003'::uuid, 'medical: withdrawal records who withdrew');
select throws_ok(
  $$update public.consents set withdrawn_at = now() where athlete_id = 'i1' and scope = 'cycle_data'$$,
  '23514', 'This consent is already withdrawn; record a new consent instead.',
  'medical: a withdrawal cannot be changed');
select throws_ok(
  $$update public.consents set policy_version = 'v2' where athlete_id = 'i1' and scope = 'medical_markers'$$,
  '23514', 'A consent can only be withdrawn; record a new consent to change it.',
  'medical: other consent fields cannot be edited');
select lives_ok(
  $$insert into public.consents (athlete_id, scope, policy_version) values ('i1', 'cycle_data', 'v2')$$,
  'medical: records a new consent after withdrawal');
select results_eq('select athlete_id from public.cycle_data', $$values ('i1')$$,
  'medical: cycle data visible again under the new consent');
select lives_ok($$delete from public.consents$$, 'medical: delete runs');
reset role;
select is((select count(*)::int from public.consents), 4, 'medical: the ledger keeps every row');

-- Signed in, but not staff, and anonymous ---------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000005", "role": "authenticated"}', true);
set local role authenticated;
select is_empty('select * from public.medical_markers', 'outsider: cannot read medical markers');
reset role;

select set_config('request.jwt.claims', '{"role": "anon"}', true);
set local role anon;
select is_empty('select * from public.cycle_data', 'anon: cannot read cycle data');
reset role;

select * from finish();
rollback;
