-- rider_profiles: manually entered rider details (KB §5, §7, §8, §10).
-- Recruitment-ready via cohort and data_source; no recruitment UI in v1.
-- RLS: all staff read, coach writes.

-- enums ---------------------------------------------------------------------

-- The five rider types of KB §7; reused by ca_weights in 2.7.
create type public.rider_type as enum
  ('sprinter', 'puncheur', 'climber', 'rouleur_tt', 'all_rounder');

create type public.rider_cohort as enum ('squad', 'prospect', 'alumni');

create type public.rider_data_source as enum ('intervals', 'manual_upload');

-- updated_at ----------------------------------------------------------------

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- table ---------------------------------------------------------------------

create table public.rider_profiles (
  athlete_id text primary key references public.athletes (id) on delete cascade,
  date_of_birth date,
  -- Training age at entry; current training age = this + years since entry (KB §8).
  training_age_years numeric check (training_age_years >= 0),
  training_age_entered_on date,
  background text,
  -- Replaces the computed rider type when set (KB §7).
  primary_type_override public.rider_type,
  -- HRV app and strap the rider measures with (KB §10).
  hrv_source text,
  cohort public.rider_cohort not null default 'squad',
  data_source public.rider_data_source not null default 'intervals',
  contract_end date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint rider_profiles_training_age_pair check (
    (training_age_years is null) = (training_age_entered_on is null)
  )
);

comment on table public.rider_profiles is
  'Manually entered rider details; coach writes, staff read.';

create trigger rider_profiles_set_updated_at
  before update on public.rider_profiles
  for each row execute function public.set_updated_at();

-- RLS -----------------------------------------------------------------------

alter table public.rider_profiles enable row level security;

create policy "Staff read rider profiles"
  on public.rider_profiles for select to authenticated
  using ((select public.is_staff()));

create policy "Coach inserts rider profiles"
  on public.rider_profiles for insert to authenticated
  with check ((select public.has_role('coach')));

create policy "Coach updates rider profiles"
  on public.rider_profiles for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));

create policy "Coach deletes rider profiles"
  on public.rider_profiles for delete to authenticated
  using ((select public.has_role('coach')));
