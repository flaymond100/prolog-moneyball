-- sync_excluded_athletes (requested by Kosta, 25 November 2026): intervals.icu
-- athletes the coach account follows who are not on the team (staff and test
-- accounts). The nightly sync and the backfill skip them entirely, so deleting
-- such an athlete from the dashboard sticks.
--
-- The list starts empty: athlete ids are entered on the live database only,
-- never in this public repo.

alter table public.app_settings
  add constraint app_settings_sync_excluded_athletes_valid check (
    key <> 'sync_excluded_athletes'
    or (
      jsonb_typeof(value) = 'array'
      and not jsonb_path_exists(value, '$[*] ? (@.type() != "string")')
    )
  );

insert into public.app_settings (key, value, label)
values ('sync_excluded_athletes', '[]', 'Athletes Excluded From Sync')
on conflict (key) do nothing;
