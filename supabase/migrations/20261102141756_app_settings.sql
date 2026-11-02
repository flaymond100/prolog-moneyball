-- app_settings: team-wide settings the coach changes from Settings, kept out
-- of code. First setting: the season start that bounds the "season"
-- power-curve window (KB §4, §6; agreed with Kosta, 2 November 2026).

create table public.app_settings (
  key text primary key,
  value jsonb not null,
  label text not null,
  updated_by uuid default auth.uid() references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Team-wide settings as jsonb; staff read, coach updates.';

-- Records who changed a setting; the column default only covers inserts.
create function public.set_app_settings_editor()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger app_settings_set_editor
  before update on public.app_settings
  for each row execute function public.set_app_settings_editor();

-- A date the sync can pass to intervals.icu as r.{season_start}.{today}.
alter table public.app_settings
  add constraint app_settings_season_start_is_date check (
    key <> 'season_start'
    or (jsonb_typeof(value) = 'string' and (value #>> '{}') ~ '^\d{4}-\d{2}-\d{2}$')
  );

insert into public.app_settings (key, value, label)
values ('season_start', '"2026-10-01"', 'Season Start')
on conflict (key) do nothing;

-- RLS -----------------------------------------------------------------------

alter table public.app_settings enable row level security;

create policy "Staff read app settings"
  on public.app_settings for select to authenticated
  using ((select public.is_staff()));

create policy "Coach updates app settings"
  on public.app_settings for update to authenticated
  using ((select public.has_role('coach')))
  with check ((select public.has_role('coach')));
