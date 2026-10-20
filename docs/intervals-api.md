# intervals.icu API: Confirmed Endpoints

Findings for TODO 3.3. Each endpoint in KB §4 was checked in two ways:

- **Spec:** against the OpenAPI spec at `https://intervals.icu/api/v1/docs` (v1.0.0, 117 paths), downloaded on 20 October 2026.
- **Live:** with the coach key, using `supabase/functions/scripts/check-endpoints.ts`.

To re-run the live check:

```bash
# INTERVALS_API_KEY in supabase/functions/.env (gitignored; see .env.example)
node --experimental-strip-types --env-file=supabase/functions/.env \
  supabase/functions/scripts/check-endpoints.ts
```

The script prints only statuses, counts, field names, curve ids and header names. It never prints rider values, names, ids or the key.

## Auth

- **Method:** HTTP Basic auth, username `API_KEY`, password = the coach key from **Settings → Developer Settings**. The spec states this, and it is confirmed live.
- **OAuth:** the spec also allows OAuth bearer tokens. KB §4 still applies: they don't reach coached athletes, so the sync uses the key.

## Endpoints

| Purpose                               | Endpoint                                                                              | Spec                                                                                 | Live (20 October 2026)                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| Coached athletes                      | `GET /athlete/0/athlete-summary.json`                                                 | Array of `SummaryWithCats`                                                           | ✔ 2 athletes                                                            |
| Activities in range                   | `GET /athlete/{id}/activities?oldest=&newest=`                                        | `oldest` required; `newest` optional, defaults to now; descending date order         | ✔                                                                       |
| One activity with intervals           | `GET /activity/{id}?intervals=true`                                                   | `Activity`, `ActivityWithIntervals` or `Hidden`                                      | Not checked: no direct-sync activity yet                                |
| **Several activities with intervals** | `GET /athlete/{id}/activities/{ids}?intervals=true`                                   | Comma-separated ids; missing ones ignored; includes `icu_intervals` and `icu_groups` | Not checked: same reason                                                |
| Per-second streams                    | `GET /activity/{id}/streams.json?types=watts,heartrate,cadence,altitude,time`         | Array of `ActivityStream` (`type`, `data`)                                           | Not checked: same reason                                                |
| Wellness by day                       | `GET /athlete/{id}/wellness.json?oldest=&newest=`                                     | Array of `Wellness`; `newest` inclusive                                              | ✔                                                                       |
| Athlete power curves                  | `GET /athlete/{id}/power-curves.json?type=Ride&curves=42d,84d,s0`                     | `{ list: PowerCurve[] }`; `type` required                                            | ✔ (window syntax below)                                                 |
| Power model                           | `GET /athlete/{id}/mmp-model?type=Ride`                                               | `PowerModel`                                                                         | ✔ `criticalPower`, `ftp`, `wPrime`, `pMax`, `type`, `inputPointIndexes` |
| eFTP                                  | Wellness `sportInfo[].eftp`                                                           | `SportInfo` (`type`, `eftp`, `wPrime`, `pMax`)                                       | ✔ `sportInfo` present                                                   |
| Planned workouts and races            | `GET /athlete/{id}/events.json?oldest=&newest=&category=WORKOUT,RACE_A,RACE_B,RACE_C` | `category` is comma-separated; `newest` inclusive and defaults to oldest + 6 days    | ✔ 200, but no events in ±56 days                                        |
| Original file (optional)              | `GET /activity/{id}/file`                                                             | Strava activities not supported                                                      | Not used in v1                                                          |

The `.json` suffix is part of the path for `athlete-summary`, `wellness`, `power-curves`, `events` and `streams` (`{ext}` in the spec). The activities endpoints take no suffix.

## Findings That Change the Plan

1. **Athlete summary is keyed by `athlete_id` and `athlete_name`**, not `id` and `name`. The 3.2 client schema was wrong and is fixed in this PR.
2. **Athlete summary includes `email` and `weight`.** Both stay in `athletes.raw`, which client roles can't read (2.10). `docs/privacy.md` (8.6) should list `email`.
3. **Every activity of both coached athletes comes from Strava.** Each returns only 5 fields, so detail, intervals and streams are empty (KB §4 gotcha). Each rider must connect Garmin, Wahoo or Hammerhead **directly** before the sync can do anything useful. The rows for activity detail, batch detail and streams need a live re-run once one rider has done that.
4. **There are no rate-limit headers.** No response carried one, so `sync_runs.rate_limit_remaining` can't come from headers. The sync should count its own calls against the 5,000-a-day budget (KB §4); `IcuClient.calls` already does that.
5. **Power-curve windows:** `42d`, `84d`, `1y` and `s0` all work. They are inclusive of today, so `42d` spans 43 days and `84d` spans 85.
   - **`s0` is not "this season".** It spanned 2,273 days, which looks like all history, probably because no season start is set. **Open question for Kosta:** what does "season" mean (calendar year, a fixed date, or a season start set in intervals.icu)?
6. **Races are events too.** The categories are `WORKOUT`, `RACE_A`, `RACE_B`, `RACE_C`, `NOTE`, `PLAN`, `HOLIDAY`, `SICK`, `INJURED`, `SET_EFTP`, `FITNESS_DAYS`, `SEASON_START`, `TARGET` and `SET_FITNESS`. The sync should fetch `WORKOUT,RACE_A,RACE_B,RACE_C`; KB §4 and TODO 3.4 list only `WORKOUT`, which would miss the Form board's "next race".
7. **Wellness carries `menstrualPhase` and `menstrualPhasePredicted`.** This confirms the strip-and-route rule in KB §11. The `wellness` table rejects them since 2.9.
8. **Batch detail saves calls.** `activities/{ids}?intervals=true` fetches several activities with their intervals in one call, which helps keep the nightly sync under 400 calls (3.4).
9. **Ids:** activity ids are strings, while event ids and interval ids are integers. The tables store all of them as `text`.
10. **Every generated column exists in the spec.** All 70 `raw->>'field'` columns across `activities`, `activity_intervals`, `wellness`, `planned_events` and `cycle_data` match a property of the corresponding spec schema.
11. **Fatigued curves (outside the KB):** `activity-power-curves` accepts `fatigue=kj0|kj1`. The live call returned 422, probably because no fatigued curves are defined for these athletes. Durability stays with `compute-durability` (5.6).
