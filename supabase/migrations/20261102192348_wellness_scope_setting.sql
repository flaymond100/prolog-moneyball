-- wellness_scope (KB §11; agreed with Kosta, 2 November 2026): until the
-- lawyer has reviewed the privacy documents, the sync keeps only the training
-- load fields of a wellness record (CTL, ATL, ramp rate, eFTP, weight) and
-- drops health data such as HRV, resting HR and sleep. Switch to 'all' after
-- sign-off, then backfill wellness to fill in the history.

alter table public.app_settings
  add constraint app_settings_wellness_scope_valid check (
    key <> 'wellness_scope' or value in ('"training_load"'::jsonb, '"all"'::jsonb)
  );

insert into public.app_settings (key, value, label)
values ('wellness_scope', '"training_load"', 'Wellness Data Collected')
on conflict (key) do nothing;
