# PROLOG Moneyball

Rider evaluation and comparison dashboard for PROLOG Cycling Team, in the style of a Football Manager scouting tool. Staff use it to see each rider's profile, compare riders, track form and readiness, and follow development (Current and Potential Ability).

- **Front end:** Vite + React + TypeScript single-page app, hosted on GitHub Pages
- **Back end:** Supabase (Postgres, Edge Functions, pg_cron), with training data synced nightly from intervals.icu

The source of truth for domain rules, formulas and constraints is the [knowledge base](docs/knowledge-base.md). Work is tracked in the [implementation TODO](docs/TODO.md). Conventions for contributors and coding agents are in [CLAUDE.md](CLAUDE.md).

## Licence

Proprietary — see [LICENSE](LICENSE).
