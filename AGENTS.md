# AGENTS.md — AI Editor Context for Vehicle Work Log

Read `AGENT.md` for full project context. This file is a quick reference.

## Quick Reference

- TypeScript strict mode, Node.js 20+ (engines: `>=18`), Remix v2
- Package manager: **npm** (lockfile: `package-lock.json`)
- Test with `npm test` (vitest), type check with `npm run typecheck`,
  lint with `npm run lint`, e2e with `npm run test:e2e:dev` /
  `npm run test:e2e:run`
- Before anything runs locally: `npm run docker` (Postgres + MinIO) and
  `npm run setup` (Prisma generate + migrate deploy + seed)
- Seeded login: `rachel@remix.run` / `racheliscool`
- **Remix flat-file routes** in `app/routes/` — dot-delimited paths
  (`vehicles.$vehicleId.logs.$logId.tsx` = `/vehicles/:vehicleId/logs/:logId`)
- Path alias: `~/*` → `./app/*`
- **Prisma is only used from `app/models/*.server.ts`** — routes import
  from `~/models/...`, never `~/db.server` directly
- **`.server.ts` / `.server.tsx` suffix is load-bearing** — Remix uses it
  to keep modules out of the client bundle. Anything touching Prisma,
  secrets, or Node-only APIs must use it.
- Auth: `requireUserId(request)` / `requireUser(request)` from
  `app/session.server.ts` at the top of every protected loader/action.
  Don't roll your own auth check.
- Cookie sessions via `createCookieSessionStorage`; cookie name
  `__session`
- Custom Express server at `server.ts` (CJS, built with esbuild) —
  Remix is mounted via `createRequestHandler`
- Fly multi-region replay: non-GET/HEAD/OPTIONS in non-primary regions
  return 409 with `fly-replay: region=$PRIMARY_REGION`. Don't add
  custom endpoints that write without going through this path.
- Prisma singleton in `app/db.server.ts` — HMR-safe via
  `app/singleton.server.ts`. New server globals must follow the same
  pattern.
- Region-aware Prisma URL: `DATABASE_URL` is rewritten at startup to
  prepend `${FLY_REGION}.` and switch to port `5433` on read replicas
- MinIO client for avatars in `app/storage.server.ts` — endpoint
  currently hardcoded to `localhost` (TODO for Fly-hosted MinIO)
- Prometheus metrics on a separate port: `METRICS_PORT` (default `3010`)
- Health check route: `app/routes/healthcheck.tsx`
- **ESLint enforces `import/order`** with alphabetized groups and
  blank lines between groups. CI fails on violations — run
  `npm run lint` before committing.
- Prettier auto-formats — run `npm run format`

## Data Model (Prisma)

| Model | Key fields | Relations |
|-------|-----------|-----------|
| `User` | `email` (unique) | 1-1 `Password`, 1-many `Vehicle`, 1-many `Log` |
| `Password` | `hash` (bcrypt) | 1-1 `User` |
| `Vehicle` | `make`, `model`, `year`, `trim?`, `name?`, `avatarPath?` | belongs to `User`, 1-many `Log` |
| `Log` | `title`, `notes?`, `type?` (Minor/Major/Modify/Check), `cost?`, `odometer?`, `servicedAt`, `selfService` | belongs to `User` + `Vehicle`, optional `Mechanic`, many `Tag`, many `Part` |
| `Mechanic` | `name`, `email?` (unique), `location` | 1-many `Log` |
| `Tag` | `name` (unique) | many `Log` |
| `Part` | `name`, `manufacturer`, `price`, `link?`, `note?` | many `Log` |

## GitHub Actions Workflows

- **Deploy** (`.github/workflows/deploy.yml`): Lint + typecheck + vitest +
  cypress on every push/PR; deploys to Fly on push to `main` (prod) or
  `dev` (staging)
- **CI** (`.github/workflows/ci.yml`): PR gate — lint + typecheck + vitest
  (fast signal separate from the full deploy pipeline)
- **Groom Issues** (`.github/workflows/groom-issues.yml`): Auto-grooms new
  issues, manual groom, **re-grooms on issue comments** when
  `status:needs-clarification` is set, and **`/groom` command** triggers
  full (re-)grooming on any issue
- **Build Next** (`.github/workflows/build-next.yml`): Manual/dispatch
  trigger to pick and build the next groomed issue
- **Build Issue** (`.github/workflows/build-issue.yml`): `/build` slash
  command on any issue triggers the builder for that specific issue
- **Claude PR Review** (`.github/workflows/claude-review.yml`): Responds to
  `@claude` mentions in PR comments

### Issue Status Labels

| Label | Meaning |
|-------|---------|
| `status:needs-info` | Issue incomplete — waiting on reporter for basic information |
| `status:needs-clarification` | Design questions — grooming agent has technical/architectural questions; auto-retriggers grooming when human answers |
| `status:groomed` | Fully specified with implementation plan — ready for builder agent |
| `status:in-progress` | Claimed by a builder agent |
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
- **Conventional commits** for PR titles:
  - `fix: <description>` — bug fix
  - `feat: <description>` — new feature
  - `feat!: <description>` or body contains `BREAKING CHANGE` — breaking
  - `chore:`, `docs:`, `refactor:`, `test:`, `ci:` — non-feature
  - Scopes are optional: `feat(vehicles): add VIN field`
- PR title becomes the commit message, PR body becomes the commit
  description
- Write clear, descriptive PR titles — they are the permanent history

## Code Conventions

- No classes except where state is needed (Prisma client, MinIO client)
- Pure functions preferred for utilities
- `logger.child({ component })` pattern if/when a structured logger is
  introduced
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
6. `app/models/user.server.ts`, `vehicle.server.ts`, `log.server.ts` —
   Data access layer (the only place Prisma is used)
7. `app/routes/vehicles*.tsx` — Core user flows
8. `prisma/schema.prisma` — Data model
9. `prisma/seed.ts` — Seed data (creates rachel@remix.run)
10. `remix.config.js` — Build config (`serverModuleFormat: "cjs"`)
11. `mocks/index.js` — MSW handlers loaded via `node --require ./mocks`
12. `Dockerfile`, `docker-compose.yml`, `fly.toml` — Runtime & deploy
13. `.github/workflows/deploy.yml` — CI + Fly deploy pipeline

## Documentation Policy

When making code changes, always update the relevant documentation files:

- `AGENT.md` — Architecture, interfaces, common tasks, development
  instructions
- `AGENTS.md` / `CLAUDE.md` — Quick reference for AI editors
- `PM_AGENT.md` — PM agent personality, grooming protocol, builder task
  selection
- `ARCHITECT_AGENT.md` — Architecture review methodology, proposals
- `DEVOPS_AGENT.md` — DevOps review protocol, CI/CD audit checklist
- `README.md` — User-facing docs, setup, configuration
