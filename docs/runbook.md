# PROLOG Moneyball – Runbook

Operating notes for staff and agents (TODO 10.4). Project: Supabase "Team Dashboard", ref `pweoamcptqpfelpcyxyp`, region `eu-central-1`. Commands run from the repo root with the Supabase CLI linked to that project.

## 1. Go-Live: Start Collecting Data

Goal of the MVP's first step: the nightly sync runs on the live project and stores every rider's workouts and training load. Nothing here needs the dashboard to be deployed.

**Before you start:** the wellness-scope PR (#41, training load only) and the cron-schedule PR (#42, TODO 3.6) are merged.

1. **Restore the project** (Kosta). Supabase dashboard → the project → **Restore project**. Wait until `supabase projects list` shows it as `ACTIVE_HEALTHY`.
2. **Push the pending migrations.**
   ```bash
   supabase db push --dry-run   # lists what will be applied
   supabase db push
   supabase migration list --linked   # local and remote columns match
   ```
3. **Check the function secrets** (set on 20 October 2026). `supabase secrets list` must show `INTERVALS_API_KEY` and `CRON_SECRET`. Vault must hold `project_url` and `cron_secret` (SQL editor: `select name from vault.secrets;`).
4. **Deploy the functions.** `verify_jwt = false` for both comes from `supabase/config.toml`.
   ```bash
   supabase functions deploy sync-nightly
   supabase functions deploy backfill
   ```
5. **Smoke test.** A call without the secret must be refused:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://pweoamcptqpfelpcyxyp.supabase.co/functions/v1/sync-nightly   # 401
   ```
   Then run the scheduled job once by hand (SQL editor), exactly as pg_cron will at 02:30 UTC:
   ```sql
   do $$ begin execute (select command from cron.job where jobname = 'sync-nightly'); end $$;
   -- a few seconds later:
   select status_code, error_msg from net._http_response order by id desc limit 1;   -- 200
   select * from public.v_sync_last_run;                                              -- succeeded
   ```
6. **Check that no secret is stored in cron (TODO 3.1 AC).** `select jobname, schedule, command from cron.job;` The command reads `vault.decrypted_secrets`; no key or token appears.
7. **Your staff account** (Kosta, a data edit). Dashboard → Authentication → Users → **Add user** with your email. Then in the SQL editor:
   ```sql
   insert into public.staff (user_id, role, display_name)
   select id, 'coach', 'Kosta' from auth.users where email = '<your email>';
   ```
8. **The next morning (TODO 3.6 AC).**
   ```sql
   select status, return_message, start_time from cron.job_run_details order by start_time desc limit 5;
   select * from public.v_sync_last_run;
   select * from public.v_sync_health;
   ```
9. **Backfill history** once riders are connected (section 3).

Sign-in URLs for the dashboard (Site URL `https://flaymond100.github.io/prolog-moneyball/`, plus the redirect URLs in `supabase/config.toml`) are set in **Authentication → URL Configuration** when the dashboard is deployed (TODO 10.1). Do not use `supabase config push` for this: it would also push the local `site_url`.

## 2. Add a Rider

Send the rider the guide in section 7, then:

1. Wait until the rider appears in your intervals.icu coach view. The next nightly sync adds them to `athletes` by itself.
2. Check their first activities are not Strava-only: `select source, count(*) from public.activities where athlete_id = '<id>' group by source;` Strava-sourced rides are skipped by design (KB §4).
3. Create their `rider_profiles` row (date of birth, training age, background, contract end) in Settings, or ask the agent.
4. Backfill their history (section 3) with their `athlete_id`.

## 3. Run a Backfill

The `backfill` function syncs activities, wellness and each ride's power curve for a date range in 30-day chunks. Each call stops within its call and time budget and returns `next`; the script keeps calling until the range is done. It keeps 500 calls a day free for the nightly sync and stops when the day's budget (5,000) is spent; run the printed command again the next day.

```bash
FUNCTIONS_URL=https://pweoamcptqpfelpcyxyp.supabase.co/functions/v1 \
CRON_SECRET=<the CRON_SECRET value> \
node --experimental-strip-types supabase/functions/scripts/backfill.ts 2025-11-01 2026-11-02 [athlete_id]
```

Re-running a range is safe: unchanged activities are skipped and every write is an upsert.

## 4. Recover a Failed Night

1. The app shows a banner when the last run failed or stalled. Details: `select * from public.v_sync_last_run;` (the `errors` column names the rider and step).
2. Check the job itself: `select status, return_message from cron.job_run_details order by start_time desc limit 3;`
3. Check the function logs in the dashboard (Edge Functions → `sync-nightly` → Logs).
4. Fix the cause, then run the job once by hand (section 1, step 5). For several missed nights, run a backfill over those days.

A run that stays `running` for over an hour shows as `stalled`: the function was stopped at its time limit before it could close the run.

## 5. Rotate the intervals.icu Key

1. intervals.icu → Settings → Developer Settings → generate a new API key.
2. `supabase secrets set INTERVALS_API_KEY=<new key>` (functions pick it up on the next call).
3. Update your local `supabase/functions/.env` if you use it.
4. Run the job once by hand (section 1, step 5) to confirm.

## 6. Keep the Free-Tier Project Awake

Free projects pause after about seven days with too little database activity. The nightly sync writes every night, which should count; open the dashboard at least once a week as a backstop. Supabase emails the owner about a week before pausing. If it pauses, restore it from the dashboard; data and settings are kept, and a backfill fills the missed nights.

## 7. Guide for Riders: Connect Your Training Data

Send this to each rider.

> We use intervals.icu to collect your training data for the team dashboard. It takes about ten minutes.
>
> 1. Create a free account at intervals.icu.
> 2. Connect your device account **directly**: Garmin Connect, Wahoo or Hammerhead, under Connections in your intervals.icu settings. Do **not** rely on Strava for this: activities that come in through Strava cannot be analysed.
> 3. When intervals.icu offers to import your past activities, accept it.
> 4. Add Kosta as your coach in the coach section of your intervals.icu settings, using the details the team sends you.
> 5. Keep your weight up to date (a connected scale or by hand): your power is compared in watts per kilogram.
>
> What the team collects for now: your workouts (power, heart rate, duration, load) and your training-load numbers (fitness, fatigue, eFTP, weight). Sleep, HRV and how-you-feel scores are **not** collected. You will receive a privacy notice that explains this in full.

## 8. After Legal Sign-Off: Collect All Wellness Data

Until the lawyer has reviewed the privacy documents, the sync keeps only training-load wellness fields (KB §11, `app_settings.wellness_scope = 'training_load'`). After sign-off and the updated privacy notice to riders:

```sql
update public.app_settings set value = '"all"' where key = 'wellness_scope';
```

Then run a backfill over the history you want (section 3) to fill in HRV, resting HR and sleep.

## 9. Compute Ratings, Rider Type and CA

Two functions run in order (KB §6–7):

1. `compute-ratings` rates every active rider 1–20 with the active benchmark set and within the squad, and writes `rider_ratings`.
2. `compute-ca` reads that day's ratings, works out each rider's type and Current Ability, and writes `rider_ca_pa`.

Until `refresh-derived` schedules them after the nightly sync (TODO 5.7), run them by hand.

Deploy both after `supabase db push`, as they read the `power_profile` and `body_mass_as_of` functions:

```bash
supabase functions deploy compute-ratings
supabase functions deploy compute-ca
```

Rate today:

```bash
curl -s -X POST https://pweoamcptqpfelpcyxyp.supabase.co/functions/v1/compute-ratings \
  -H "x-cron-secret: <the CRON_SECRET value>"
curl -s -X POST https://pweoamcptqpfelpcyxyp.supabase.co/functions/v1/compute-ca \
  -H "x-cron-secret: <the CRON_SECRET value>"
```

Rate a past day (one pair of calls per day, for example to fill the 28-day change arrows) by adding a body to both calls:

```bash
  -H "content-type: application/json" -d '{"as_of": "2026-10-14"}'
```

What the replies tell you:

- `compute-ratings`: the riders and ratings written. `without_weight` counts power bests left unrated because the rider has no body weight for W/kg; `without_benchmark` lists attributes the active set has no benchmark for.
- `compute-ca`: the riders given a type and CA. `without_power_profile` counts rated riders left out because they do not have all six power ratings yet.

Re-running a day is safe: each function replaces that day's rows.
