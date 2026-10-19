# PROLOG Moneyball – Agent Knowledge Base

Oct 19, 2026 · @Kosta

## 1. Purpose and how to use this

This is the source of truth for domain rules, formulas, data sources and constraints of the PROLOG Moneyball dashboard. The implementation TODO is a separate document; when a task and this knowledge base disagree, this knowledge base wins and the conflict is flagged to Kosta.

- Save it in the repo as `docs/knowledge-base.md` and reference it from `CLAUDE.md`.
- Every number marked **\[prior\]** is an assumption chosen by the coach. Store it in a seed table, never hard-code it.
- Every number marked **\[source\]** comes from published research (references in section 13).
- Never invent a formula or threshold. If something is missing, stop and ask.
- UI copy uses British spelling (organisation, colour, analyse, programme).

## 2. Project context

PROLOG Cycling Team is a women's road team near Leipzig, launching in the 2027 season, run by Kosta (Team Principal and coach). The dashboard lets staff evaluate and compare riders in the style of a Football Manager scouting tool.

| Item | Value |
| --- | --- |
| Squad | 12 female riders, aged 18–32, average FTP about 4.1 W/kg |
| Employment | Riders are employed by PROLOG (affects privacy, section 11) |
| Users | Staff only (coach, analyst, medical, viewer). No rider logins in v1 |
| Coaching tools | Planning in TrainingPeaks; data for the dashboard from intervals.icu |
| Lab data | INSCYD only (lab and field tests), entered manually |

**Scope v1:** current squad only — profile, comparison, form, readiness, development (CA/PA).

**Not in v1:** recruitment UI, Banister impulse-response model, rider-facing views. Keep the schema and scoring code recruitment-ready (`cohort`, `data_source`, scoring functions on plain arrays), but build no recruitment screens.

## 3. Tech stack and conventions

The app is a static Vite + React SPA on GitHub Pages, with all data, auth and jobs in the existing Supabase project.

| Layer | Choice |
| --- | --- |
| Front end | Vite, React 18, TypeScript (strict, `noUncheckedIndexedAccess`), pnpm workspaces |
| UI | Tailwind, shadcn/ui, dark mode default, tabular numerals |
| Data fetching | TanStack Query; tables with TanStack Table; routing with TanStack Router (hash history) |
| Charts | ECharts via `echarts-for-react` (radar, scatter with mark lines, heatmaps, fan charts) |
| Validation | zod for forms and API responses |
| Backend | Supabase Postgres, Edge Functions (Deno), pg\_cron + pg\_net, Vault |
| Tests | Vitest, Testing Library, Playwright, pgTAP (`supabase test db`) |
| Hosting | GitHub Pages via GitHub Actions; Supabase deploys via Actions |

**Data flow:**

1. pg\_cron calls the `sync-nightly` Edge Function at 02:30 UTC.
2. The function reads intervals.icu with the coach API key and upserts raw JSON into Postgres.
3. At 03:15 UTC `refresh-derived` refreshes materialised views and runs the rating, CA/PA and forecast jobs.
4. The React app reads tables and views with the publishable key; RLS decides what each staff role sees.

**Repo layout:**

```
apps/web            React app
packages/metrics    pure TS formulas (no IO), shared by app and Edge Functions
packages/types      generated DB types + zod schemas
supabase/           migrations, functions, seed.sql, tests
docs/               knowledge-base.md, TODO.md, privacy.md, dpia.md, runbook.md
```

**Rules:**

- Schema changes only through migrations. Never edit the remote database by hand.
- Every metric formula lives in `packages/metrics` with unit tests (100% branch coverage).
- Secrets never in the repo, the client bundle or `cron.job` SQL. The client only ever gets `VITE_SUPABASE_URL` and the publishable key.
- Regenerate DB types after every migration; CI fails on stale types.
- A task is done only when CI is green.

## 4. Data source: intervals.icu API

All training data comes from the official intervals.icu REST API, read with the coach's personal API key. Confirm every endpoint and parameter against the live Swagger docs (`https://intervals.icu/api-docs.html`) before coding.

**Access**

- Base URL `https://intervals.icu/api/v1`. Basic auth: username `API_KEY`, password = coach key (secret `INTERVALS_API_KEY`).
- The coach key can read every athlete who added Kosta as coach. OAuth tokens do **not** give access to coached athletes, so use the key.
- Rider onboarding: free intervals.icu account → connect Garmin/Wahoo/Hammerhead **directly** (not via Strava) → add the coach in settings.

**Rate limits \[source: intervals.icu forum\]:** 5,000 calls/day, 2,500 per rolling 15 min, 10 calls/s per IP. A 429 response carries `Retry-After`; honour it with back-off. Throttle to ≤5 calls/s.

| Purpose | Endpoint |
| --- | --- |
| Coached athletes | `GET /athlete/0/athlete-summary.json` |
| Activities in range | `GET /athlete/{id}/activities?oldest=YYYY-MM-DD&newest=YYYY-MM-DD` |
| One activity with intervals | `GET /activity/{id}?intervals=true` |
| Per-second streams | `GET /activity/{id}/streams.json?types=watts,heartrate,cadence,altitude,time` |
| Wellness by day | `GET /athlete/{id}/wellness?oldest=…&newest=…` |
| Athlete power curves | `GET /athlete/{id}/power-curves.json?type=Ride&curves=…` (confirm window syntax: 42d, 84d, season) |
| Power model / eFTP | `GET /athlete/{id}/mmp-model` and wellness `sportInfo[].eftp` |
| Planned workouts | `GET /athlete/{id}/events?category=WORKOUT&oldest=…&newest=…` |
| Original file (optional) | `GET /activity/{id}/file` (gzip FIT/TCX/GPX) |

**Key activity fields** (all metric; seconds, m/s, °C):

- Load and intensity: `icu_training_load`, `icu_intensity` (IF × 100), `icu_weighted_avg_watts` (NP), `icu_average_watts`, `icu_variability_index`, `icu_efficiency_factor`, `icu_joules`, `icu_joules_above_ftp`, `icu_max_wbal_depletion`, `power_load`, `hr_load`, `trimp`, `icu_rpe`, `feel`.
- Volume: `moving_time`, `elapsed_time`, `icu_recording_time`, `icu_distance` (use this, not `distance`), `total_elevation_gain`, `coasting_time`.
- Fitness snapshot: `icu_ctl`, `icu_atl`, `icu_ftp`, `icu_weight`, `icu_rolling_ftp`, `icu_rolling_cp`, `icu_rolling_w_prime`, `icu_rolling_p_max`, `icu_pm_*` (per-ride model).
- HR: `average_heartrate`, `max_heartrate`, `decoupling`, `icu_power_hr`, `icu_power_hr_z2`, `icu_hrr`.
- Zones: `icu_zone_times` (power, list of `{id, secs}`), `icu_hr_zone_times` (int array), `icu_power_zones`, `icu_hr_zones`.
- Context: `type`, `trainer`, `race`, `source`, `device_name`, `paired_event_id`, `compliance`, `stream_types`, `icu_achievements`.

**Key interval fields:** `type` (WORK/RECOVERY), `label`, `group_id`, `moving_time`, `average_watts`, `weighted_average_watts`, `average_watts_kg`, `max_watts`, `intensity`, `training_load`, `zone`, `decoupling`, `wbal_start`, `wbal_end`, `average_heartrate`, `average_cadence`.

**Key wellness fields:** `id` (local date), `ctl`, `atl`, `rampRate`, `sportInfo[].eftp`, `weight`, `restingHR`, `hrv` (rMSSD), `hrvSDNN`, `readiness`, `sleepSecs`, `sleepScore`, `sleepQuality`, `avgSleepingHR`, `soreness`, `fatigue`, `stress`, `mood`, `motivation`, `injury`, `spO2`, `vo2max`, `comments`, `menstrualPhase`, `menstrualPhasePredicted`.

**Gotchas**

- Strava-sourced activities come back mostly empty and their files cannot be downloaded. Skip and log them.
- Wellness scales differ: `sleepQuality`, `mood`, `motivation` run 1 = excellent … 4 = poor; `soreness`, `fatigue`, `stress` run 0 = none … 4 = extreme; `injury` 1 = excellent … 4 = injured. Normalise with `normaliseWellness()` so higher always means better.
- Heart rate above the athlete's max HR is replaced by interpolation at import (`fixed_heartrate`).
- `icu_zone_times` is power, not generic (legacy name).
- `menstrualPhase*` fields are stripped at sync unless an active consent exists (section 11).
- Types are available as the npm package `@intervals-icu/js-data-model`.

## 5. Database model

Every synced object stores the full API response in `raw jsonb`; dashboard columns are Postgres generated columns derived from it. To promote a new field, add one generated column — Postgres backfills existing rows, no re-sync.

```sql
alter table activities add column trimp numeric
  generated always as ((raw->>'trimp')::numeric) stored;
```

Rules for this pattern:

- Only immutable casts (`::int`, `::numeric`, `::boolean`, `->>`) in generated columns. Dates/timestamps are set by the sync, not generated.
- Strip `icu_intervals` and `icu_groups` from activity JSON before insert; they go to `activity_intervals`.
- Upsert on primary keys so re-runs are idempotent.

| Table | Status | Key | Holds |
| --- | --- | --- | --- |
| `athletes` | existing | `id` (intervals.icu id) | name, active |
| `activities` | existing | `id` | raw + \~25 generated columns, `start_date_local` |
| `activity_intervals` | existing | (`activity_id`, `interval_id`) | raw + generated interval metrics |
| `wellness` | existing | (`athlete_id`, `date`) | raw + generated wellness and CTL/ATL |
| `staff` | existing, extend | `user_id` | add `role` enum: coach, analyst, medical, viewer |
| `rider_profiles` | new | `athlete_id` | DOB, training age, background, type override, `cohort`, `data_source` |
| `lab_tests` | new | id; unique (`athlete_id`, `test_date`, `method`) | INSCYD results (section 10) |
| `anthropometrics` | new | (`athlete_id`, `date`) | height, weight, body fat outside lab tests |
| `power_curves` | new | (`athlete_id`, `as_of`, `window`) | `secs[]`, `watts[]`, `wkg[]` |
| `planned_events` | new | event id | planned workouts with `icu_training_load` |
| `durability_efforts` | new | (`activity_id`, `kj_kg_bucket`, `duration_s`) | best power after 10/20/30 kJ/kg |
| `benchmark_sets`, `benchmark_points` | new | set id | benchmark anchors with citations |
| `ca_weights` | new | (`rider_type`, `attribute`) | CA weight matrix (section 7) |
| `model_priors` | new | `key` | PA priors as jsonb (section 8) |
| `rider_ratings` | new | (`athlete_id`, `as_of`, `set_id`, `attribute`) | rating 1–20, confidence |
| `rider_ca_pa` | new | (`athlete_id`, `as_of`) | CA, PA P10/P50/P90, type probabilities, model version |
| `forecasts` | new | (`athlete_id`, `created_at`, `metric`, `horizon_date`) | P10/P50/P90, model |
| `consents`, `cycle_data`, `medical_markers` | new | — | special-category data (section 11) |
| `saved_layouts`, `saved_filters` | new | per staff user | UI state |
| `sync_runs` | new | run id | start, end, counts, errors, rate-limit remaining |

**RLS**

- RLS on every table. Default: staff read (`is_staff()`), service role writes (sync and jobs bypass RLS).
- Manual-entry tables (`rider_profiles`, `lab_tests`, `anthropometrics`): `coach` writes.
- `cycle_data` and `medical_markers`: `medical` role only **and** an active consent row.
- Raw body weight in kg is visible only to `coach` and `medical`; other roles see W/kg.
- Every policy has a pgTAP test.

## 6. Attributes, rating scale and benchmarks

Every attribute is rated 1–20, with the female-pro mean set at 15. Ratings come from benchmark data stored in `benchmark_sets` / `benchmark_points`, never from constants in code.

**Attribute groups**

| Group | Attributes | Source | In CA? |
| --- | --- | --- | --- |
| Power profile | Sprint 5 s, Anaerobic 30 s, Punch 1 min, VO2 5 min, Threshold 20 min, Endurance 60 min (W/kg); absolute 20/60 min W for rouleurs | `power_curves` (84-day window; season shown alongside) | Yes |
| Durability | Retained % of fresh 5 min and 20 min power after 20 and 30 kJ/kg | `durability_efforts` (84 days) | Yes, 25% |
| Physiology | VO2max (rated); VLamax, FatMax, CarbMax, AT (shown, not rated) | `lab_tests` | VO2max only, 5% |
| Training and consistency | 12-week compliance, CTL level, ramp-rate stability, intensity distribution, indoor/outdoor ratio | activities, `planned_events`, zone views | No |
| Efficiency | EF trend on Z2 rides, decoupling on rides over 2 h, VI in races | activities | No |
| Readiness | ln rMSSD vs baseline, HRV CV, resting HR deviation, sleep, wellness composite | wellness | No (Form board only) |

**Rating from z-score** (sets with mean and SD):

```latex
\text{rating} = \operatorname{clamp}\left(15 + 2.5 \cdot \frac{x - \mu}{\sigma},\ 1,\ 20\right)
```

So the pro mean rates 15, +2 SD rates 20, −2 SD rates 10.

**Rating from anchors** (sets without SD): piecewise-linear interpolation between anchor points, extrapolated below the lowest pair and above the highest pair with the nearest slope, clamped 1–20.

**Benchmark seed: "Female Pro + Coggan provisional" (v1)**

| Attribute | Method | Values (W/kg) | Status |
| --- | --- | --- | --- |
| 5 s | z-score | μ 15.3, σ 1.8 | \[source\] Mateo-March 2022 |
| 30 s | z-score | μ 10.3, σ 1.1 (log-interpolated between 5 s and 60 s) | \[prior\] provisional |
| 1 min | z-score | μ 8.4, σ 0.8 | \[source\] Mateo-March 2022 |
| 5 min | anchors | 4.65 → 9, 5.20 → 12, 5.80 → 15 (Coggan Very good / Excellent / Exceptional mids) | \[prior\] provisional |
| 20 min | anchors | 4.11 → 9, 4.63 → 12, 5.11 → 15 (Coggan FTP band mids ÷ 0.95) | \[prior\] provisional |
| 60 min | z-score | μ 4.2, σ 0.4 | \[source\] Mateo-March 2022 |
| Durability (retained %) | anchors | 85% → 9, 90% → 12, 95% → 15, 100% → 18 | \[prior\] |
| VO2max (mL/kg/min) | anchors | 50 → 9, 57 → 12, 63 → 15, 70 → 18 | \[prior\] |

Rouleur absolute 20/60 min W uses squad-relative percentiles until a watt-based benchmark is chosen.

**Squad-relative mode:** a toggle that maps each rider's percentile within the squad linearly to 1–20.

**Confidence:** a power attribute is *high* confidence when at least 3 different days in the 84-day window reach ≥95% of that window's best for the duration; otherwise *low*. Low-confidence attributes render hatched and count at 50% weight in CA.

**Rules**

- Never mix benchmark sets on one scale; each rating row stores its `benchmark_set_id`.
- Compare MMP with MMP. Never rate intervals.icu eFTP against the 60-min MMP benchmark.
- W/kg uses the weight nearest the effort date (lab test, anthropometrics, then wellness).
- Colours: 1–5 red, 6–10 amber, 11–15 green, 16–20 teal; offer a colour-blind-safe palette.
- Show a 28-day change arrow (↑/↓) for every attribute.

## 7. Rider type and Current Ability (CA)

Rider type is a probability over five types computed from the shape of the power profile; CA is the type-weighted mean of the attribute ratings, with durability fixed at 25%.

**Rider type classification \[prior\]**

1. Take the six power ratings (5 s, 30 s, 1 min, 5 min, 20 min, 60 min) and subtract the rider's own mean rating to get a shape vector.
2. Compare it with these prototypes (same order):

| Type | Shape prototype | Extra rule |
| --- | --- | --- |
| Sprinter | +3, +2, +1, −1, −2, −3 | VLamax ≥ 0.6 mmol/L/s adds +0.5 to its score |
| Puncheur | 0, +1, +2, +1, −1, −2 | — |
| Climber | −3, −2, −1, +1, +2.5, +2 | body mass ≤ 55 kg adds +0.5 |
| Rouleur/TT | −1, −1, −1, 0, +1.5, +2 | absolute 20-min W ≥ squad 60th percentile adds +0.5 |
| All-rounder | 0, 0, 0, 0, 0, 0 | — |

3. Score = −(Euclidean distance)², plus any extra rule bonus. Probabilities = softmax(score / τ) with τ = 4.
4. `rider_profiles.primary_type_override` replaces the computed result when set.
5. Store `type_probs` as jsonb on `rider_ca_pa`.

**CA weights (per cent, rows sum to 100) \[prior, agreed with Kosta\]**

| Attribute | Sprinter | Puncheur | Climber | Rouleur/TT | All-rounder |
| --- | --- | --- | --- | --- | --- |
| 5 s | 25 | 10 | 0 | 5 | 8 |
| 30 s | 15 | 10 | 5 | 5 | 8 |
| 1 min | 15 | 20 | 5 | 5 | 12 |
| 5 min | 5 | 20 | 20 | 10 | 15 |
| 20 min | 5 | 5 | 25 | 25 (absolute W) | 15 |
| 60 min | 5 | 5 | 15 | 20 (absolute W) | 12 |
| Durability | 25 | 25 | 25 | 25 | 25 |
| VO2max (lab) | 5 | 5 | 5 | 5 | 5 |

**CA formula**

```latex
w_i = \sum_{t} p_t \cdot W_{t,i} \qquad CA = \frac{\sum_i w_i \, c_i \, r_i}{\sum_i w_i \, c_i}
```

Here p is the type probability, W the weight matrix above, r the attribute rating and c the confidence factor (1.0 high, 0.5 low). A missing attribute (e.g. no lab test) drops out and the remaining weights renormalise.

- Display CA as 1–20 with one decimal, and as an FM-style 0–200 number (CA × 10) with stars (CA ÷ 4, rounded to half stars).
- Recompute nightly; keep history in `rider_ca_pa`.

## 8. Potential Ability (PA) model

PA is the CA a rider is projected to reach at her peak age, shown as a median with a P10–P90 band from 1,000 Monte Carlo draws. No published model gives women's annual gains by training age, so every number here is a \[prior\] seeded in `model_priors` and recalibrated on squad data after each season.

**Inputs:** current attribute values (W/kg, retained %, VO2max), age from `date_of_birth`, training age (`training_age_years` at entry + years since entry), rider type probabilities.

**Priors (v1, agreed with Kosta)**

| Prior | Value |
| --- | --- |
| Peak age by type | Sprinter 28.7 \[source\], All-rounder 27.0 \[source\], Climber 27.0, Puncheur 27.5, Rouleur/TT 28.5; per-draw noise ±1.5 years (normal, SD) |
| Annual gain curve | g(t) = g0 · e^(−0.35·t), g0 median 0.10, lognormal σ = ln 1.5 (≈ ±50%) |
| Duration multipliers | 5 s 0.3, 30 s 0.5, 1 min 0.7, 5 min 1.0, 20 min 1.0, 60 min 1.1, post-fatigue power 1.3, VO2max 0.8 |
| Age taper | factor 1.0 up to peak − 3; linear to 0.3 at peak; linear to 0 at peak + 2; 0 until 31; −0.75% per year from 31 |
| Caps on total gain | +20% for 5–60 min and post-fatigue power, +12% for 30 s and 1 min, +8% for 5 s, +10% VO2max; durability retained % never above 100% |
| Modifiers (rating, applied to each draw) | +0.5 if lab VO2max rating ≥ 5-min rating + 2; +0.5 if training age < 3 years and CA ≥ 13 |

Resulting expected annual gain for 5–20 min power: training age 1 → 7%, 2 → 5%, 3 → 3.5%, 4 → 2.5%, 6 → 1.2%, 8+ → ≤0.6%.

**Algorithm per rider and draw**

1. Sample g0 and the peak age.
2. For each year from now to peak age (at least one year), multiply each attribute value by 1 + g(training age that year) × duration multiplier × age factor.
3. Durability: grow fresh power by the fresh multiplier and post-fatigue power by 1.3×; retained % = post ÷ fresh, capped at 100%.
4. Apply caps, convert values to ratings with the active benchmark set, add modifiers, compute CA with the current type weights.
5. PA for the draw = max(that value, current CA).

**Outputs to `rider_ca_pa`:** `pa_p10`, `pa_p50`, `pa_p90`, plus `ca_12m_p50` — the same simulation one year ahead **without** the max(…, CA) floor, so declines for riders over 31 stay visible. Store `model_version` and the seed.

**Rules**

- Deterministic seed = hash(athlete\_id, as\_of) so results reproduce.
- Property tests: PA ≥ CA always; the band widens as training age falls; a rider over peak + 2 gets PA ≈ CA.
- Display as "PA 15.5 (13.8–17.2)" with a band bar, never a single number.
- After each season, compare observed vs predicted annual change per rider; update g0 by shrinkage (weight n ÷ (n + 20), n = rider-seasons) and log the change in `model_priors` history.

## 9. Form, readiness and forecasting

Current form combines load (CTL/ATL/TSB), recent capacity versus the 84-day best and HRV-based readiness; predicted form is a projection of planned load plus a trend forecast of capacity. The Banister impulse-response model is **out of v1**.

**Current form metrics (`v_form_daily`, materialised)**

| Metric | Definition |
| --- | --- |
| CTL, ATL, TSB | From wellness `ctl`, `atl`; TSB = CTL − ATL |
| Ramp rate | Wellness `rampRate` |
| Capacity freshness | Best 5 s / 1 min / 5 min / 20 min in last 14 days ÷ 84-day best, % |
| eFTP slope | Linear slope of eFTP (W/kg) over 28 days, per week |
| EF trend | Efficiency factor on Z2 rides (>60 min, >70% time in Z1–2), 7-ride rolling |
| Decoupling | On rides > 2 h; < 5% is good |
| HRV | ln(rMSSD); 7-day rolling mean; 60-day baseline mean and SD; 7-day CV |
| Resting HR | Deviation from 60-day baseline, bpm |
| Wellness composite | Mean of normalised sleep quality, mood, motivation, soreness, fatigue, stress (higher = better) |

**Readiness traffic light \[prior\]**

- Each marker has a band: ln rMSSD 7-day within baseline ± 0.5 SD; resting HR within baseline + 5 bpm; wellness composite within its 60-day mean − 1 SD; sleep ≥ 6.5 h.
- Green: all markers in band. Amber: one marker out. Red: two or more markers out for two or more consecutive days.
- Show the reasons on the card (e.g. "HRV low 3 days, soreness high").
- Grey "insufficient HRV data" when fewer than 3 HRV readings in the last 7 days. Never infer readiness from missing data.
- ACWR is shown as information only, never as an alert.

**Predicted form**

1. **Load projection:** take `planned_events` for the next 56 days and propagate CTL and ATL with time constants 42 and 7 days from today's values. Run three scenarios: planned load × 0.8, × 1.0, × 1.2. Show projected TSB as a fan chart and the value on each race day.
2. **Capacity trend:** fit a robust local-linear trend (or Kalman local-level) model to weekly eFTP and weekly best 5-min and 20-min W/kg. Forecast 8 weeks with an 80% interval. Flag "plateau" when the slope's interval contains zero.
3. Write forecasts to `forecasts` (`metric`, `horizon_date`, `p10`, `p50`, `p90`, `model`).
4. **Model audit:** compare past forecasts with realised values; report MAE and 80%-interval coverage per metric.

**Rules**

- No black-box ML with 12 riders. Any regression must be regularised and validated leave-one-rider-out.
- Always show uncertainty: bands, fans or intervals; never a single forecast line.

## 10. Lab tests (INSCYD) and HRV standardisation

Lab data comes only from INSCYD and is entered manually; HRV is comparable between riders only as deviation from each rider's own baseline.

**`lab_tests` fields**

| Field | Unit | Valid range |
| --- | --- | --- |
| `test_date` | date | not in the future |
| `method` | enum: `inscyd_lab`, `inscyd_ppd_field` | required |
| `vo2max_ml_kg_min` | mL/kg/min | 30–90 |
| `vo2max_l_min` | L/min | 1.5–6.0 |
| `vlamax_mmol_l_s` | mmol/L/s | 0.1–1.5 |
| `fatmax_w` / `fatmax_g_h` | W / g/h | 50–400 / 10–120 |
| `carbmax_g_h` | g/h | 20–200 |
| `at_w` (anaerobic threshold / MLSS) | W | 100–450 |
| `weight_kg`, `height_cm`, `body_fat_pct` | kg, cm, % | 35–100, 140–200, 5–40 |
| `tester`, `notes`, `entered_by` | text | — |

- Unique (`athlete_id`, `test_date`, `method`). Keep edit history.
- Field tests (`inscyd_ppd_field`) are modelled estimates: show a "modelled" badge.
- Only VO2max enters CA. VLamax, FatMax and CarbMax are shown and tracked, and VLamax nudges rider type (section 7).
- Change between tests is "meaningful" only when it exceeds the typical error the coach enters per metric in settings.
- Views: VO2max × VLamax squad quadrant, slope chart between tests, delta table, lab AT vs intervals.icu eFTP overlay.

**HRV standardisation (rider rule)**

- One method for the whole squad: morning reading on waking, lying down, same app and chest strap, at least 3 times a week.
- Do not mix with overnight watch HRV; it measures something different.

**HRV in the app**

- Store `hrv_source` with every reading (from raw JSON or rider profile).
- Never compare raw rMSSD between riders. Cross-rider views use the z-score of 7-day ln rMSSD against the rider's own 60-day baseline.
- Exclude readings from a different source than the rider's baseline source.

## 11. Privacy, employment and women's health

Riders are PROLOG employees, so training and performance data are processed on the basis of the employment contract and legitimate interest, not consent; consent is used only for truly voluntary extras (cycle data, medical markers). A German employment or data protection lawyer must review this before launch — the agent implements the controls, not the legal judgement.

**Data classes**

| Class | Examples | Legal basis (to confirm) | Who sees it |
| --- | --- | --- | --- |
| Performance | power, load, intervals, ratings, CA/PA | Employment contract / legitimate interest, Art. 13 notice | All staff roles |
| Wellness and HRV | HRV, resting HR, sleep, subjective wellness | Health data: employment basis + Art. 9 condition, Art. 13 notice | coach, medical, analyst |
| Body weight (kg) | weight, body fat | Health-related | coach, medical only; others see W/kg |
| Cycle data | menstrual phase | Explicit voluntary consent, "no disadvantage" statement | medical only, rider's own charts only |
| Medical markers | ferritin, haemoglobin | Explicit voluntary consent | medical only |
| Lab tests | INSCYD results | Employment basis | coach, medical, analyst |

**Controls the app must have**

- Supabase project in an EU region (check Frankfurt); a DPA with Supabase on file.
- `consents` ledger: `athlete_id`, `scope` (`cycle_data`, `medical_markers`, later `recruitment_assessment`), `granted_at`, `withdrawn_at`, `policy_version`.
- Sync strips `menstrualPhase*` unless an active `cycle_data` consent exists; then it routes to `cycle_data`, never to `wellness.raw`.
- Withdrawal deletes the related rows within 24 hours (scheduled job) and logs the deletion.
- Cycle phases appear only as an overlay on that rider's own form chart; never in squad tables, scatter, compare or exports.
- Retention: delete or anonymise a rider's personal data a configurable period after her contract ends \[prior: 12 months\]; keep anonymised aggregates for model calibration.
- Rider data export (JSON/CSV) on request (Art. 15/20), run by staff.
- Docs in repo: `docs/privacy.md` (data inventory, basis per table, retention, records of processing), `docs/dpia.md` (data protection impact assessment draft), Art. 13 notice draft.

**Energy availability watch (not a diagnosis)**

- Private flag for `coach` and `medical` roles when ≥2 of these occur within 28 days: body mass down > 2%; CTL rising while 7-day ln rMSSD trends down; fatigue or mood worse than baseline for ≥ 7 days; recurring illness or injury notes; cycle irregularity (only with consent).
- The flag prompts a conversation or a referral (medical staff may use LEAF-Q). Record "conversation logged"; no scores or labels on squad screens.

## 12. Views (Football Manager concepts translated)

The app copies the information architecture of the FM scouting tool — profile, compare, filter, scatter, table — with cycling attributes in place of football ones. Navigation: Squad, Form, Compare, Scatter, Tests, Settings.

| FM concept | Cycling view | Must have |
| --- | --- | --- |
| Player profile | **Rider profile** | Header (name, age, training age, type badge, CA stars, PA band); three attribute panels (Power, Durability, Physiology) with 1–20 chips and 28-day arrows; Training and Readiness strips; terrain position map (flat sprint, rolling, punchy finish, long climb, TT) shaded by type probability; power-duration curve (season, 84 d, 42 d) with benchmark overlay; durability funnel; lab test timeline; notes |
| Head-to-head modal | **Compare** | Two rider pickers; radar of A vs B vs squad mean vs squad best (optional pro mean); attribute difference table; durability bubbles (fresh → 10 → 20 → 30 kJ/kg); selection encoded in URL |
| Advanced search | **Filter builder** | AND conditions (metric, operator, value) as chips; saved filters; reused by table and scatter |
| Scatter plot | **Scatter explorer** | Any two metrics on X/Y; min/max sliders; squad-mean quadrant lines; point size = CTL, colour = rider type; tooltip; click opens the profile |
| Stats table | **Squad table** | Column-group tabs (General, Power, Durability, Physiology, Training, Readiness); heatmap cells by rating or percentile; sort; pinned name column; min-data filter (rides in 84 days) instead of min minutes; column chooser; saved layouts; CSV export of visible columns |
| — | **Form board** | One card per rider: TSB, readiness light with reasons, ln rMSSD band chart, eFTP sparkline, next race with projected TSB |
| — | **Tests** | Entry forms, per-rider timeline, slope charts, delta table, VO2max × VLamax quadrant |
| — | **Settings** | Rider profiles, benchmark set, CA weights, PA priors (coach only), consents (medical only), typical error per lab metric, sync health |

**Look and feel:** dark theme, compact density, tabular numerals, PROLOG brand palette — Espresso #241A12 and Deep Blue #00284D for surfaces, Champagne Gold #E2BB7A for rider A and accents, Cream #F6F1E7 for rider B and text; rating colours from section 6.

## 13. Glossary and references

| Term | Meaning |
| --- | --- |
| CA | Current Ability: type-weighted mean of attribute ratings, 1–20 |
| PA | Potential Ability: projected CA at peak age, median with P10–P90 band |
| MMP | Mean maximal power for a duration in a time window |
| CTL / ATL / TSB | Fitness (42-day load average) / fatigue (7-day) / form (CTL − ATL) |
| eFTP | intervals.icu estimated FTP from its power model |
| CP, W′ | Critical power and work capacity above it |
| Durability | Power retained after accumulated work, measured at 10/20/30 kJ/kg |
| EF | Efficiency factor: NP ÷ average HR |
| Decoupling | Drift of power-to-HR ratio between first and second half of a ride |
| ln rMSSD | Natural log of the HRV measure rMSSD |
| VLamax | Maximal lactate production rate (INSCYD), mmol/L/s |
| FatMax | Power or rate at maximal fat oxidation |
| Training age | Years of structured training, entered per rider |
| \[prior\] / \[source\] | Coach-chosen assumption / published value |

**Sources**

- Mateo-March et al. 2022, record power profile of female pros, IJSPP 17(5):682–686 — [PubMed](https://pubmed.ncbi.nlm.nih.gov/35168197/)
- Mateo-March et al. 2025, sex differences in durability in pro cyclists, J Sci Med Sport 28(8):661–665
- Van Erp & Lamberts 2022, TOP5 vs NOT-TOP5 races in female pros, IJSPP — [Human Kinetics](https://journals.humankinetics.com/view/journals/ijspp/17/7/ijspp.2021-0488.xml)
- Leo et al. 2021, U23 vs pro power profiles, Tour of the Alps, IJSPP 16(8) — [ResearchGate](https://www.researchgate.net/publication/350545456_Power_Profiling_Workload_Characteristics_and_Race_Performance_of_U23_and_Professional_Cyclists_During_the_Multistage_Race_Tour_of_the_Alps)
- De Leeuw & Kholkine 2024, age and race performance in women's road cycling, IJPAS — [Taylor & Francis](https://www.tandfonline.com/doi/abs/10.1080/24748668.2023.2301208)
- Almquist et al., junior to senior development and durability, MSSE — [Ovid](https://www.ovid.com/jnls/acsm-msse/abstract/10.1249/mss.0000000000003232~development-of-cycling-performance-variables-and-durability?redirectionsource=fulltextview)
- Pastorio et al. 2026, sex differences in durability (lab), SJMSS — [Wiley](https://onlinelibrary.wiley.com/doi/10.1111/sms.70273)
- Plews et al., HRV monitoring with 7-day ln rMSSD — [Frontiers](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2015.00343/full)
- ICO, conditions for processing special-category data — [ico.org.uk](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-are-the-conditions-for-processing/)
- intervals.icu API access and integration cookbook — [forum](https://forum.intervals.icu/t/api-access-to-intervals-icu/609), [cookbook](https://forum.intervals.icu/t/intervals-icu-api-integration-cookbook/80090), [data model](https://forum.intervals.icu/t/server-side-data-model-for-scripts/25781)
- Supabase, scheduling Edge Functions with pg\_cron — [docs](https://supabase.com/docs/guides/functions/schedule-functions)
