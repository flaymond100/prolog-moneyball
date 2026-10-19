# PROLOG Moneyball – Implementation TODO

Oct 19, 2026 · @Kosta

## How to work through this list

Work phase by phase, top to bottom; every task names its acceptance criteria (AC), and a task is ticked only when its AC pass and CI is green. Domain rules, formulas and priors are in **PROLOG Moneyball – Agent Knowledge Base** (`docs/knowledge-base.md`, referenced below as KB §n).

- One task = one branch and one PR, unless tasks are marked as grouped.
- If a task conflicts with the KB, the KB wins; stop and ask Kosta.
- Never invent a threshold or formula. Seed priors in tables, never in code.
- Ask before anything that touches the remote database outside a migration, rotates secrets or deletes data.
- Stack: Vite + React 18 + TypeScript (strict), pnpm, Supabase, TanStack Query/Table/Router, ECharts, Tailwind + shadcn/ui, zod, Vitest, Playwright, pgTAP. British spelling in UI copy.
- Out of v1: Banister model, recruitment UI, rider logins.

## Phase 0 – Repository and conventions

- [ ] **0.1 Create the repo.** `gh repo create prolog-moneyball --private` (GitHub Pages on a private repo needs GitHub Pro or higher; if not available, ask Kosta before making it public). Add `README.md`, proprietary `LICENSE`, `.gitignore` (node, `.env*`, `supabase/.temp`, `supabase/.branches`). AC: `main` is protected (PR required, CI must pass).
- [ ] **0.2 Add the docs.** Save the KB as `docs/knowledge-base.md` and this list as `docs/TODO.md`. AC: both files in `main`.
- [ ] **0.3 Write `CLAUDE.md`.** Purpose, stack, folder map, commands, and these rules: never commit secrets; schema only via migrations; formulas only in `packages/metrics` with tests; priors only in seed tables; British spelling; read the KB before each phase. AC: README links to it.
- [ ] **0.4 Set up the pnpm monorepo.** Workspaces `apps/web`, `packages/metrics` (pure TS, no IO), `packages/types`, plus `supabase/`. AC: `pnpm -r build` passes on an empty skeleton.

## Phase 1 – Scaffold and tooling

- [ ] **1.1 Scaffold the web app.** `pnpm create vite apps/web --template react-ts`; TS `strict` and `noUncheckedIndexedAccess`; path aliases (`@/`). AC: `pnpm dev` serves a blank page.
- [ ] **1.2 Lint and format.** ESLint flat config (typescript-eslint, react-hooks, jsx-a11y), Prettier, husky + lint-staged pre-commit. AC: `pnpm lint` passes with zero warnings.
- [ ] **1.3 Tests.** Vitest + Testing Library in `apps/web`, Vitest in `packages/metrics`, Playwright smoke test. AC: one sample test of each kind passes.
- [ ] **1.4 CI.** GitHub Actions on PR: install → typecheck → lint → unit tests → build. Second workflow: `supabase db lint` and migration dry-run against a local stack. AC: a PR shows green checks.
- [ ] **1.5 UI foundation.** Tailwind + shadcn/ui; dark theme from the PROLOG palette (KB §12); rating colour tokens 1–5 red, 6–10 amber, 11–15 green, 16–20 teal, plus a colour-blind-safe alternative; tabular numerals. AC: a `/dev/palette` route renders rating chips 1–20 in both palettes.
- [ ] **1.6 Routing for GitHub Pages.** TanStack Router with hash history (or browser history + `404.html` fallback); Vite `base` from an env var (`/prolog-moneyball/` or `/` for a custom domain). AC: a deep link survives a hard refresh on a production build served from a sub-path.

## Phase 2 – Supabase link and schema

- [ ] **2.1 Link the project and create the baseline.** `supabase init`, `supabase link --project-ref <ref>`. The project started empty, so a baseline migration creates `athletes`, `activities`, `activity_intervals`, `wellness` and `staff` per KB §4–5 (raw jsonb + generated columns, RLS on). Confirm the project region is in the EU and report it. AC: migrations apply to a fresh local database and `supabase db diff` is empty.
- [ ] **2.2 Generated types.** `supabase gen types typescript --local > packages/types/src/db.ts` (from the migrations, so CI needs no remote credentials); npm script `gen:types`; CI fails on stale types.
- [ ] **2.3 Extend `staff`.** Add `role` enum (`coach`, `analyst`, `medical`, `viewer`) and helper functions `is_staff()`, `has_role(text)` (security definer, stable). AC: pgTAP tests for each role.
- [ ] **2.4 `rider_profiles`.** Columns per KB §5 incl. `date_of_birth`, `training_age_years`, `training_age_entered_on`, `background`, `primary_type_override`, `hrv_source`, `cohort` (`squad`/`prospect`/`alumni`, default `squad`), `data_source` (`intervals`/`manual_upload`, default `intervals`), `contract_end`. AC: coach writes, staff read.
- [ ] **2.5 `lab_tests` and `anthropometrics`.** Fields and range checks exactly as KB §10; unique (`athlete_id`, `test_date`, `method`); audit table or trigger for edit history. AC: out-of-range inserts fail with a readable error.
- [ ] **2.6 Sync target tables.** `power_curves`, `planned_events`, `durability_efforts`, `sync_runs` per KB §5; raw jsonb + generated columns where useful.
- [ ] **2.7 Model tables and seeds.** `benchmark_sets`, `benchmark_points`, `ca_weights`, `model_priors` (with a history table). Seed exactly the values in KB §6 (benchmarks), §7 (CA weight matrix) and §8 (PA priors), each with citation or `[prior]` note. AC: seeds are idempotent; every weight row per type sums to 100.
- [ ] **2.8 Output tables.** `rider_ratings`, `rider_ca_pa` (incl. `pa_p10/p50/p90`, `ca_12m_p50`, `type_probs`, `model_version`, `seed`), `forecasts`, `saved_layouts`, `saved_filters`. AC: service role writes, staff read.
- [ ] **2.9 Privacy tables.** `consents`, `cycle_data`, `medical_markers` per KB §11; RLS: `medical` role **and** active consent. AC: pgTAP proves `coach` and `analyst` cannot select them.
- [ ] **2.10 Weight visibility.** View or column privileges so only `coach`/`medical` see kg; other roles see W/kg only. AC: pgTAP test.
- [ ] **2.11 RLS test suite.** pgTAP test for every table's policies, run in CI with `supabase test db`.

## Phase 3 – Nightly sync

- [ ] **3.1 Secrets.** `supabase secrets set INTERVALS_API_KEY=… CRON_SECRET=…`; store `project_url` and `cron_secret` in Vault. AC: `select * from cron.job` shows no plaintext secret.
- [ ] **3.2 intervals.icu client** (`supabase/functions/_shared/icu.ts`). Basic auth (`API_KEY:<key>`), throttle ≤5 req/s, honour 429 `Retry-After` with exponential back-off, log remaining rate limit, zod-validate known fields but keep the full JSON. AC: unit tests with mocked fetch cover 200, 429 and 5xx.
- [ ] **3.3 Confirm endpoints.** Check every endpoint in KB §4 against the live Swagger, especially power-curve window syntax and the events filter; record findings in `docs/intervals-api.md`. AC: a test script hits each endpoint once for one rider.
- [ ] **3.4 `sync-nightly` Edge Function.** Verifies `x-cron-secret`, then for each coached athlete (from `athlete-summary`):
  1. Upsert `athletes`.
  2. Activities from today − 4 days; detail with intervals for new or changed ones; strip `icu_intervals`/`icu_groups` into `activity_intervals`; skip and log Strava-sourced ones.
  3. Wellness for the last 4 days; strip `menstrualPhase*` unless active `cycle_data` consent (then write to `cycle_data`).
  4. Power curves for 42 d, 84 d and season into `power_curves`.
  5. Planned workouts for the next 56 days into `planned_events`.
  6. Write a `sync_runs` row.

  AC: re-running is idempotent; fewer than 400 API calls per night for 12 riders.
- [ ] **3.5 `backfill` Edge Function.** Same logic with `{athlete_id?, from, to}` in 30-day chunks. AC: 365 days for 12 riders stays under 5,000 calls/day (split across nights if needed).
- [ ] **3.6 Schedule.** Migration enabling `pg_cron` + `pg_net`; `sync-nightly` at 02:30 UTC and `refresh-derived` at 03:15 UTC via `net.http_post` with Vault values. AC: `cron.job_run_details` shows success the next morning.
- [ ] **3.7 Sync health.** View `v_sync_health` (last success per rider, stale > 48 h); banner in the app when the last run failed.
- [ ] **3.8 Wellness normalisation.** Implement `normaliseWellness()` in `packages/metrics` per KB §4 gotchas, after checking scale directions against real raw JSON. AC: unit test that higher always means better.

## Phase 4 – Auth and app shell

- [ ] **4.1 Supabase Auth.** Magic link login; after login check `staff` membership and role; non-staff see a "no access" page. Add the GitHub Pages URL and `localhost` to Auth redirect URLs. AC: Playwright covers staff and non-staff paths.
- [ ] **4.2 App shell.** Sidebar (Squad, Form, Compare, Scatter, Tests, Settings), rider switcher, global "as of" date picker, role-aware navigation (Settings sections hidden by role).
- [ ] **4.3 Data layer.** TanStack Query hooks per view using generated types; error boundary; skeleton loaders; a metric registry (`id`, label, unit, format, source column, higher-is-better) used by table, scatter and filters. AC: adding a metric to the registry makes it available in all three views.

## Phase 5 – Derived metrics

- [ ] **5.1 `packages/metrics` core.** Pure functions: `ratingFromZ`, `ratingFromAnchors`, `normaliseWellness`, `lnRmssdStats`, `projectLoad` (CTL/ATL), `retainedPct`. AC: 100% branch coverage; fixtures from KB worked examples (e.g. 5 s 15.3 W/kg → 15, 60 min 4.1 W/kg → ≈14.4).
- [ ] **5.2 `v_form_daily` (materialised).** All metrics in KB §9 table: CTL/ATL/TSB, ramp rate, ln rMSSD 7-day mean, 60-day baseline mean/SD, 7-day CV, readings count, resting HR deviation, wellness composite, sleep. Refreshed by `refresh-derived`. AC: pgTAP compares with hand-calculated fixtures.
- [ ] **5.3 `v_power_profile`.** Best 5/30/60/300/1200/3600 s in W and W/kg (weight nearest the date: lab → anthropometrics → wellness) for 42 d, 84 d, season; 14-day best ÷ 84-day best; confidence per KB §6 (≥3 days at ≥95% of best).
- [ ] **5.4 `v_efficiency_trends`.** EF on Z2 rides (>60 min, >70% in Z1–2), 7-ride rolling; decoupling on rides over 2 h.
- [ ] **5.5 `v_consistency`.** Weekly planned vs completed load from `planned_events` and activities; 12-week compliance %; indoor/outdoor ratio; intensity distribution from zone views.
- [ ] **5.6 `compute-durability` Edge Function.** For new rides over 2 h: fetch power streams, compute cumulative kJ/kg, store best 1/5/20 min after 10/20/30 kJ/kg in `durability_efforts`; rider-level 84-day retained % view. AC: unit tests with synthetic streams; nightly run under 60 s.
- [ ] **5.7 `refresh-derived` Edge Function.** Refresh materialised views, then trigger Phase 7 jobs in order (ratings → type → CA → PA → forecasts). AC: one `sync_runs`-style log row per run.

## Phase 6 – Dashboard views

Build views against seeded synthetic data (task 9.2) first, so the UI does not wait for Phase 7. Requirements per view are in KB §12.

- [ ] **6.1 Squad table.** TanStack Table; column-group tabs (General, Power, Durability, Physiology, Training, Readiness); heatmap cells by rating or squad percentile; sort; pinned name column; min-data filter; column chooser; saved layouts; CSV export of visible columns. AC: export matches visible columns; renders 12 rows in under 100 ms.
- [ ] **6.2 Rider profile.** Header with CA stars and PA band; three attribute panels with 1–20 chips and 28-day arrows; low-confidence chips hatched; terrain position map; power-duration curve (season/84 d/42 d) with benchmark overlay; durability funnel; lab timeline; notes. AC: Playwright snapshot of a synthetic rider.
- [ ] **6.3 Compare.** Two rider pickers; ECharts radar (A, B, squad mean, squad best, optional pro mean); difference table; durability bubbles; selection in URL. AC: a copied URL reopens the same comparison.
- [ ] **6.4 Filter builder.** AND conditions from the metric registry; chips; saved filters; shared by table and scatter.
- [ ] **6.5 Scatter explorer.** X/Y from the registry; min/max sliders; squad-mean quadrant lines (`markLine`); size = CTL, colour = rider type; tooltip; click opens profile.
- [ ] **6.6 Form board.** Rider cards with TSB, readiness light and reasons, ln rMSSD band chart, eFTP sparkline, next race with projected TSB; grey state when fewer than 3 HRV readings in 7 days.
- [ ] **6.7 Tests.** zod forms for `lab_tests` and `anthropometrics` with range messages in British English; per-rider timeline; slope chart; delta table against coach-set typical error; VO2max × VLamax quadrant; "modelled" badge for field tests.
- [ ] **6.8 Settings.** Rider profiles; benchmark set selector and squad-relative toggle; CA weight editor (rows must sum to 100); PA priors editor (coach only, writes history); typical error per lab metric; consent management (medical only); sync health.

## Phase 7 – Models

All model code lives in `packages/metrics` and runs inside Edge Functions triggered by `refresh-derived`. No Banister model in v1.

- [ ] **7.1 Ratings job (`compute-ratings`).** Per rider and attribute: rating with the active benchmark set (KB §6) and squad-relative mode, plus confidence; write `rider_ratings`. AC: worked examples from KB §6 reproduce.
- [ ] **7.2 Rider type.** Shape-vector prototypes, bonuses, softmax τ = 4, manual override (KB §7). AC: synthetic sprinter, climber and rouleur fixtures classify correctly; override wins.
- [ ] **7.3 CA.** Type-blended weights × confidence, renormalised over available attributes (KB §7); write `rider_ca_pa`. AC: a rider with no lab test still gets CA; weights sum check.
- [ ] **7.4 PA Monte Carlo.** 1,000 draws, deterministic seed = hash(athlete\_id, as\_of), priors read from `model_priors` (KB §8); outputs P10/P50/P90 and `ca_12m_p50`. AC property tests: PA ≥ CA; band widens as training age falls; rider older than peak + 2 gets PA ≈ CA; same seed → same output.
- [ ] **7.5 Load projection.** CTL/ATL from `planned_events` over 56 days, scenarios × 0.8 / 1.0 / 1.2; write `forecasts` (`metric = 'tsb'`). AC: matches a hand-calculated 14-day fixture.
- [ ] **7.6 Capacity forecast.** Robust local-linear trend (or Kalman local-level) on weekly eFTP and 5/20-min W/kg; 8-week forecast with 80% interval; plateau flag. AC: synthetic rising, flat and noisy series behave as expected.
- [ ] **7.7 Model audit page.** Past PA and forecasts vs realised values: MAE and 80%-interval coverage per metric; staff only.
- [ ] **7.8 Season recalibration script.** Shrinkage update of g0 (KB §8), run manually by the coach; writes `model_priors` history. AC: dry-run mode prints the proposed change without writing.

## Phase 8 – Privacy and health

Riders are employees; the legal basis rules are in KB §11. The agent drafts documents and builds controls; Kosta's lawyer signs off before launch.

- [ ] **8.1 Consent flow.** Staff-run form to record and withdraw `cycle_data` and `medical_markers` consent, with policy version and a "no disadvantage" statement; withdrawal job deletes related rows within 24 h and logs it. AC: e2e test grants, uses and withdraws a consent.
- [ ] **8.2 Energy availability watch.** Flag logic from KB §11 (≥2 criteria in 28 days), visible only to `coach` and `medical`; "conversation logged" action; nothing on squad screens. AC: fixtures trigger and do not trigger the flag correctly.
- [ ] **8.3 Cycle overlay.** Phase overlay only on that rider's own form chart, only for `medical`, only with active consent; excluded from tables, scatter, compare and exports. AC: pgTAP + Playwright checks.
- [ ] **8.4 Retention job.** Delete or anonymise personal data 12 months after `contract_end` \[prior, configurable\]; keep anonymised aggregates. AC: dry-run lists affected rows.
- [ ] **8.5 Rider data export.** Staff-triggered JSON/CSV export of one rider's data (Art. 15/20). AC: export contains every table with her `athlete_id`.
- [ ] **8.6 Documents.** Draft `docs/privacy.md` (data inventory, basis per table, retention, records of processing), `docs/dpia.md` (DPIA draft) and an Art. 13 notice draft for riders. Mark all three "for legal review".

## Phase 9 – Quality and performance

- [ ] **9.1 Synthetic seed data.** `supabase/seed.sql` with 12 fictional riders aged 18–32, FTP around 4.1 W/kg, mixed types, 6 months of activities, wellness and two INSCYD tests each. AC: every view renders meaningfully on seed data alone. *Do this early, before Phase 6.*

## Phase 10 – Deployment (GitHub Pages + Supabase)

- [ ] **10.1 Pages workflow.** GitHub Action on push to `main`: install → build `apps/web` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from repo secrets and the correct `base` → `actions/upload-pages-artifact` → `actions/deploy-pages`. Never the service role key. AC: the site loads at the Pages URL and login works.
- [ ] **10.2 Custom domain (optional).** `CNAME` for e.g. `dashboard.prolog-cycling.com`, Vite `base` = `/`, HTTPS enforced; add the domain to Supabase Auth redirect URLs. Ask Kosta before doing this.
- [ ] **10.3 Supabase deploy workflow.** On `main`: `supabase db push` and `supabase functions deploy`, gated by a manual approval environment. AC: a migration only reaches production after approval.
- [ ] **10.4 Runbook.** `docs/runbook.md`: rotate the intervals.icu key; re-run backfill; recover a failed cron; add a rider (free intervals.icu account → connect Garmin/Wahoo directly, not Strava → add the coach → create `rider_profiles` row → backfill); HRV measurement instructions for riders (KB §10).

## Phase 11 – Recruitment-ready hooks (no UI)

- [ ] **11.1 Schema check.** Confirm `cohort = 'prospect'` and `data_source = 'manual_upload'` work end to end: a prospect with only a `power_curves` row and a `rider_profiles` row gets ratings, type and CA without any activities. AC: one pgTAP + one unit test.
- [ ] **11.2 Scoring on plain arrays.** All scoring functions take `secs[]`, `watts[]`, mass and profile fields, not DB rows, so applicant uploads can reuse them. AC: scoring a hand-built array matches scoring the same data from the DB.
- [ ] **11.3 Prospect isolation.** RLS and default filters keep `prospect` rows out of squad views and averages; consent scope `recruitment_assessment` exists. AC: squad mean unchanged after inserting a prospect.

## Open items for Kosta

These do not block Phases 0–7; the agent should ask about each one when it reaches the task named.

| Item | Needed by | Question |
| --- | --- | --- |
| GitHub plan | 0.1 | GitHub Pro for Pages on a private repo, or a public repo? |
| Custom domain | 10.2 | Use e.g. `dashboard.prolog-cycling.com`? |
| Supabase region | 2.1 | Is the existing project in an EU region? If not, migrate before real rider data arrives |
| Rider data | 2.4 | Date of birth, training age, background and HRV method for all 12 riders |
| HRV method | 2.4 | Which app and chest strap will the squad standardise on? |
| Medical role | 2.3, 8.x | Who holds the `medical` role (team doctor, physio, nobody yet)? |
| Retention | 8.4 | Is 12 months after contract end the right period? |
| Rouleur benchmark | 7.1 | Watt-based benchmark for absolute 20/60-min power, or keep squad-relative? |
| Legal review | 8.6, before launch | German employment / data protection lawyer to review privacy docs and the DPIA |
