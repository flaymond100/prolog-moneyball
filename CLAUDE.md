# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repository.

## Purpose

PROLOG Moneyball is a staff-only dashboard for PROLOG Cycling Team (a women's road team near Leipzig, launching in the 2027 season). Staff use it to evaluate and compare riders in the style of a Football Manager scouting tool: rider profile, compare, form and readiness, and development (Current Ability / Potential Ability).

**Read [`docs/knowledge-base.md`](docs/knowledge-base.md) before starting each phase.** It is the source of truth for domain rules, formulas, priors, data sources and privacy constraints. Work is tracked in [`docs/TODO.md`](docs/TODO.md). If a task and the knowledge base disagree, the knowledge base wins — stop and ask Kosta.

## Stack

- **Front end:** Vite, React 18, TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind + shadcn/ui, TanStack Query / Table / Router (hash history), ECharts via `echarts-for-react`, zod.
- **Back end:** Supabase Postgres, Edge Functions (Deno), pg_cron + pg_net, Vault. Training data comes from the intervals.icu API.
- **Tests:** Vitest, Testing Library, Playwright, pgTAP (`supabase test db`).
- **Hosting:** static SPA on GitHub Pages; Supabase deploys via GitHub Actions.
- **Package manager:** pnpm workspaces.

## Folder Map

```
apps/web            React app (Vite)
packages/metrics    pure TS formulas, no IO — shared by the app and Edge Functions
packages/types      generated DB types + zod schemas
supabase/           migrations, Edge Functions, seed.sql, pgTAP tests
docs/               knowledge-base.md, TODO.md, privacy.md, dpia.md, runbook.md
```

## Commands

```bash
pnpm install              # install all workspaces
pnpm dev                  # run apps/web dev server
pnpm build                # build every workspace (pnpm -r build)
pnpm typecheck            # tsc --noEmit across workspaces
pnpm lint                 # ESLint, zero warnings allowed
pnpm format               # Prettier write
pnpm test                 # Vitest across workspaces
pnpm test:e2e             # Playwright tests against a production build served from /prolog-moneyball/
```

Routing uses TanStack Router with hash history (`src/router.ts`), so deep links survive a refresh on GitHub Pages. The Vite `base` comes from `VITE_BASE_PATH` (`/prolog-moneyball/` on GitHub Pages, `/` for a custom domain). See `apps/web/.env.example`.

Supabase commands (from Phase 2): `supabase start`, `supabase db diff`, `supabase test db`, `pnpm gen:types`.

`pnpm gen:types` writes `packages/types/src/db.ts` from the **local** database (run `supabase db reset` first), then formats it with Prettier. CI regenerates it and fails if the committed file differs. The output depends on the Supabase CLI version, so CI pins it (`2.121.0` in `.github/workflows/supabase.yml`); upgrade the local CLI and the pin together.

## Rules

- **Never commit secrets.** Not in the repo, the client bundle or `cron.job` SQL. The client only ever gets `VITE_SUPABASE_URL` and the publishable key. The service role key never leaves Supabase and CI secrets.
- **Schema changes only via migrations** in `supabase/migrations`. Never edit the remote database by hand. Regenerate DB types after every migration; CI fails on stale types.
- **Formulas only in `packages/metrics`**, as pure functions on plain arrays/values, with unit tests at 100% branch coverage.
- **Priors only in seed tables.** Every number marked `[prior]` in the knowledge base goes into a seed table (`benchmark_points`, `ca_weights`, `model_priors`, …), never hard-coded. Never invent a formula or threshold — if something is missing, stop and ask.
- **British spelling in UI copy** (organisation, colour, analyse, programme, normalise). Title Case for headings, buttons and navigation labels; sentence case for body text. Dates as 19 October 2026.
- **Privacy:** cycle data and medical markers are `medical`-only with active consent and never appear in squad tables, scatter, compare or exports (knowledge base §11).
- **Body weight:** kg and body fat are coach/medical only (KB §11). Client roles get column-level grants on `athletes`, `activities`, `activity_intervals`, `wellness`, `power_curves`, `planned_events` and `lab_tests` that exclude kg, body fat and `raw`, so never `select *` (or `return=representation`) on them; coach and medical read kg from `v_body_mass`. A new column on these tables needs its own `grant select (col)` in the same migration.
- **Workflow:** one TODO task = one branch and one PR. A task is done only when its acceptance criteria pass and CI is green. Ask before anything that touches the remote database outside a migration, rotates secrets or deletes data.
- **shadcn/ui on React 18:** add components with `pnpm dlx shadcn@latest add <name>` from `apps/web`. Current shadcn templates assume React 19 (`ref` as a prop). Wrap a component in `React.forwardRef` when it is used as a Radix `asChild` target (e.g. a Button inside a TooltipTrigger). Check the generated `cn` import points at `@/lib/utils`.
- **Rating colours:** use `RatingChip` and the `--rating-band-*` tokens. Never hard-code band colours. The colour-blind-safe palette is switched with `data-palette="colour-blind"` on any ancestor.
- **Out of v1:** Banister impulse-response model, recruitment UI, rider logins. Keep schema and scoring recruitment-ready (`cohort`, `data_source`, scoring on plain arrays).
