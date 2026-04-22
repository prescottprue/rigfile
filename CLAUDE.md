# CLAUDE.md — Claude Code Context for Vehicle Work Log

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository. Read `AGENT.md` for full project context. This file
is a quick reference.

## Pit Lane crew (garage name → classic role)

| Pit Lane name | Classic role | Source |
|---------------|--------------|--------|
| **Service Writer** | Product Manager | `SERVICE_WRITER.md` |
| **Chief Mechanic** | Software Architect | `CHIEF_MECHANIC.md` |
| **Crew Chief** | DevOps / Platform | `CREW_CHIEF.md` |
| **Wrench** | Builder / feature implementer | `.github/workflows/build-next.yml` |
| **Test Driver** | QA / UX reviewer | `TEST_DRIVER.md` |

## Overview

Remix (v2) app tracking work and maintenance on vehicles. Originally
scaffolded from the Blues Stack (Remix + Postgres + Fly). Extended with MinIO
for avatar/file storage.

## Quick Reference

- TypeScript strict mode, Node.js 20+ (engines: `>=18`), Remix v2
- Package manager: **npm** (lockfile: `package-lock.json`)
- Test with `npm test` (vitest), type check with `npm run typecheck`, lint
  with `npm run lint`, e2e with `npm run test:e2e:dev` /
  `npm run test:e2e:run`
- Before anything runs locally: `npm run docker` (Postgres + MinIO) and
  `npm run setup` (Prisma generate + migrate deploy + seed)
- **Remix flat-file routes** in `app/routes/` — dot-delimited paths
  (`vehicles.$vehicleId.logs.$logId.tsx` = `/vehicles/:vehicleId/logs/:logId`)
- Path alias: `~/*` → `./app/*`
- **Prisma is only used from `app/models/*.server.ts`** — routes import
  from `~/models/...`, never `~/db.server` directly
- **`.server.ts` / `.server.tsx` suffix is load-bearing** — Remix uses it to
  keep modules out of the client bundle. Anything touching Prisma, secrets,
  or Node-only APIs must use it.
- Auth: `requireUserId(request)` / `requireUser(request)` from
  `app/session.server.ts` at the top of every protected loader/action.
  Don't roll your own auth check.
- ESLint enforces `import/order` with alphabetized groups and blank lines
  between groups. Run `npm run lint` before committing — CI will fail on
  violations.

## Common commands

Infrastructure (Postgres + MinIO) must be running in Docker before dev or
tests:

```sh
npm run docker        # start postgres (5432) + minio (9000/9001)
npm run setup         # prisma generate + migrate deploy + seed
npm run dev           # dev server on :3000 (rebuilds server + Remix on change)
npm run build         # full build (build:remix + build:server)
```

Seeded login: `rachel@remix.run` / `racheliscool`.

Tests / quality:

```sh
npm test                        # vitest (watch)
npm test -- --run               # vitest single pass
npm test -- app/utils.test.ts   # single file
npm test -- -t "name pattern"   # single test by name

npm run test:e2e:dev            # cypress UI against dev server on :3000
npm run test:e2e:run            # cypress headless against prod build on :8811 with MSW mocks

npm run typecheck               # tsc (app) + tsc -p cypress
npm run lint
npm run format                  # prettier write
npm run validate                # test + lint + typecheck + e2e (CI equivalent)
```

## Architecture

### Custom Express server (`server.ts`)

Remix is served from a hand-written Express app, not the default Remix CLI
server. Things to know:

- Built as CJS (`remix.config.js` → `serverModuleFormat: "cjs"`, esbuild
  targets node/cjs). Dev watches `build/server.js` and re-imports the Remix
  build via a cache-busted dynamic import.
- **Fly multi-region replay**: non-GET/HEAD/OPTIONS requests hitting a
  non-primary region return `409` with a `fly-replay: region=$PRIMARY_REGION`
  header so writes go to the primary. Mutations that bypass this (e.g.
  direct DB writes in custom endpoints) will fail on read replicas.
- Exposes a separate Prometheus metrics server on `METRICS_PORT`
  (default 3010).

### Prisma singleton with region-aware URL (`app/db.server.ts`)

`prisma` is wrapped with `singleton()` (from `app/singleton.server.ts`) so
it survives dev-time module reloads. In Fly, the client rewrites
`DATABASE_URL`:

- Prepends `${FLY_REGION}.` to internal hostnames.
- Switches port to `5433` (read replica) when the current region isn't
  `PRIMARY_REGION`.

Any new server-side global (clients, caches) should use the same
`singleton()` helper — otherwise it'll leak across HMR reloads. See
`storage.server.ts` for a second example.

### Data layer convention

- `app/models/*.server.ts` are the only place Prisma is used. Routes
  import from `~/models/...`, never `~/db.server` directly.
- The `.server.ts` / `.server.tsx` suffix is load-bearing: Remix uses it
  to keep modules out of the client bundle. Anything touching Prisma,
  secrets, or Node-only APIs must use it.

### Auth (`app/session.server.ts`)

Cookie-based sessions (`__session`) via `createCookieSessionStorage`. Use
`requireUserId(request)` / `requireUser(request)` at the top of any
protected `loader`/`action` — they throw a redirect to
`/login?redirectTo=...` on miss. Don't roll your own auth check.

### File storage (`app/storage.server.ts`)

MinIO client for uploads (used by vehicle avatars — see `Vehicle.avatarPath`
in Prisma schema). Note: `endPoint` is hard-coded to `localhost` with a
`TODO` for Fly-hosted MinIO; don't assume it works in deployed
environments as-is.

### Routing

Flat-file routes in `app/routes/` using Remix v2 dot-delimited convention:
`vehicles.$vehicleId.logs.$logId.tsx` = `/vehicles/:vehicleId/logs/:logId`.
Path alias `~/*` → `./app/*` (see `tsconfig.json`).

### MSW mocks

`mocks/index.js` is loaded via `node --require ./mocks` in both the dev
script and `start:mocks` (used by `test:e2e:run`). Add new third-party HTTP
handlers there rather than stubbing inside tests.

## GitHub Actions Workflows

- **Deploy** (`.github/workflows/deploy.yml`): Lint + typecheck + vitest +
  cypress on every push/PR; deploys to Fly on push to `main` (prod) or
  `dev` (staging)
- **CI** (`.github/workflows/ci.yml`): PR gate — lint + typecheck + vitest
  (fast signal separate from the full deploy pipeline)
- **Groom Issues** — Service Writer (`.github/workflows/groom-issues.yml`):
  Auto-grooms new issues, manual groom, **re-grooms on issue comments**
  when `status:needs-clarification` is set, and **`/groom` command**
  triggers full (re-)grooming on any issue
  - Reads `SERVICE_WRITER.md`, `AGENT.md`, and `CLAUDE.md` for technical
    context
  - Creates implementation plans as part of grooming
  - Design review step: if questions → `status:needs-clarification`; when
    answered via comment → auto-retriggers to complete grooming
  - `/groom` command: comment `/groom` on any issue to trigger a fresh
    grooming pass — removes stale status labels (`status:groomed`,
    `status:needs-clarification`, `status:needs-info`) before re-running
    the full protocol
- **Build Next** — Wrench (`.github/workflows/build-next.yml`): Manual/
  dispatch trigger to pick and build the next groomed issue (or a
  specific issue number)
- **Build Issue** — `/build` Wrench dispatch
  (`.github/workflows/build-issue.yml`): Comment `/build` on any groomed
  issue to trigger a Wrench build of that issue
- **Test Driver** (`.github/workflows/test-driver.yml`): Runs on every PR
  that touches `app/routes`, `app/components`, `app/root.tsx`,
  `app/tailwind.css`, or `prisma/schema.prisma`. Posts one comment per
  PR with affected flows, a manual test plan, and UX/a11y/mobile notes.
- **Claude PR Review** (`.github/workflows/claude-review.yml`): Responds
  to `@claude` mentions in PR comments

### Issue Status Labels

| Label | Meaning |
|-------|---------|
| `status:needs-info` | Issue incomplete — waiting on reporter for basic information |
| `status:needs-clarification` | Design questions — grooming agent has technical/architectural questions; auto-retriggers grooming when human answers |
| `status:groomed` | Fully specified with implementation plan — ready for a Wrench |
| `status:in-progress` | Claimed by a Wrench |
| `status:deferred` | Intentionally delayed |
| `area:devops` | CI/CD, workflow, Docker, Fly — skipped by `build-next`, requires manual implementation |

## CI/CD

- **Deploy on merge** to `main` (production) or `dev` (staging) via
  `.github/workflows/deploy.yml` on Fly
- **Tests run on every push and PR** (lint + typecheck + vitest + cypress)
- **Secrets:** `FLY_API_TOKEN` (GitHub secret) for deploys;
  `SESSION_SECRET`, `DATABASE_URL`, MinIO creds as Fly secrets
- **Rollback:** `flyctl releases list` + `flyctl releases rollback`

## Git Conventions

- **Squash merge only** — each PR becomes one commit on `main`.
- **Conventional commits** — PR titles must follow the
  [Conventional Commits](https://www.conventionalcommits.org/) format:
  - `fix: <description>` — bug fix
  - `feat: <description>` — new feature
  - `feat!: <description>` or body contains `BREAKING CHANGE` — breaking
  - `chore:`, `docs:`, `refactor:`, `test:`, `ci:` — non-feature
  - Scopes are optional: `feat(vehicles): add VIN field`
- PR title becomes the commit message, PR body becomes the commit
  description. Write clear, descriptive PR titles — they are the permanent
  history.

## Code Conventions

- No classes except where state is needed (Prisma client, MinIO client)
- Pure functions preferred for utilities
- Error handling: try/catch at loader/action boundaries — let Remix
  ErrorBoundary handle render failures
- Imports obey ESLint's `import/order` (alphabetized, blank lines between
  groups)
- Server-only modules use `.server.ts` / `.server.tsx`

## Safety Rules (Non-Negotiable)

- Do NOT skip auth — every protected loader/action calls
  `requireUserId` / `requireUser`
- Do NOT return another user's data — every query that takes a
  `:vehicleId` or `:logId` must check ownership
- Do NOT import `~/db.server` from routes — go through
  `app/models/*.server.ts`
- Do NOT pass secrets as CLI arguments (visible in `ps aux`)
- Do NOT commit `.env` or Fly secrets
- Do NOT weaken the ESLint config to silence violations
- Do NOT skip migrations on production deploys
- Do NOT add custom write endpoints that bypass the Fly replay logic in
  `server.ts`

## Running Tests

```bash
npm test                         # vitest (watch)
npm test -- --run                # single pass
npm test -- app/utils.test.ts    # specific file
npm test -- -t "name pattern"    # by test name

npm run test:e2e:dev             # cypress UI (dev server on :3000)
npm run test:e2e:run             # cypress headless (prod build on :8811, MSW mocks)

npm run typecheck                # tsc (app) + tsc -p cypress
npm run lint
npm run validate                 # full CI-equivalent: test + lint + typecheck + e2e
```

## Key Files to Understand

1. `server.ts` — Custom Express server, Fly replay, Prometheus metrics
2. `app/db.server.ts` — Prisma singleton, region-aware URL rewrite
3. `app/singleton.server.ts` — HMR-safe global wrapper
4. `app/session.server.ts` — Cookie session, `requireUserId`,
   `requireUser`
5. `app/storage.server.ts` — MinIO client for avatars (note: endpoint
   TODO)
6. `app/models/*.server.ts` — Data access layer (the only place Prisma is
   used)
7. `app/routes/vehicles*.tsx` — Core user flows
8. `prisma/schema.prisma` — Data model
9. `prisma/seed.ts` — Seed data (creates rachel@remix.run)
10. `remix.config.js` — Build config (`serverModuleFormat: "cjs"`)
11. `mocks/index.js` — MSW handlers loaded via `node --require ./mocks`
12. `Dockerfile`, `docker-compose.yml`, `fly.toml` — Runtime & deploy
13. `.github/workflows/deploy.yml` — CI + Fly deploy pipeline

## Notes

- Node >= 18 required.
- ESLint enforces `import/order` with alphabetized groups and blank lines
  between groups. Run `npm run lint` before committing — CI will fail on
  violations.
- Deploys: pushes to `main` → production, pushes to `dev` → staging (via
  `.github/workflows/deploy.yml` on Fly).

## Documentation Policy

When making code changes, always update the relevant documentation files:

- `AGENT.md` — Architecture, interfaces, common tasks, development
  instructions
- `AGENTS.md` / `CLAUDE.md` — Quick reference for AI editors
- `SERVICE_WRITER.md` — Service Writer (PM) — grooming protocol, Wrench
  task-selection algorithm
- `CHIEF_MECHANIC.md` — Chief Mechanic (Architect) — audit methodology,
  proposals
- `CREW_CHIEF.md` — Crew Chief (DevOps) — review protocol, CI/CD audit
  checklist
- `TEST_DRIVER.md` — Test Driver (QA / UX) — per-PR review protocol
- `README.md` — User-facing docs, setup, configuration
