# AGENT.md — Vehicle Work Log

> This file provides context for AI code editors (Claude Code, Cursor, Windsurf, etc.)
> about the Vehicle Work Log project. Read this first before making changes.

## What is Vehicle Work Log?

A Remix (v2) web app for tracking work and maintenance performed on vehicles.
Users register their vehicles, log services/repairs/modifications performed by
themselves or a mechanic, attach parts and tags, and upload a vehicle avatar
image. Originally scaffolded from the Blues Stack (Remix + Postgres + Fly);
extended with MinIO for avatar/file storage.

## Tech Stack

- **Runtime:** Node.js 20+ (engines field: >=18), TypeScript (strict mode)
- **Framework:** Remix v2 (CJS server module format, flat-file routing)
- **Server:** Custom Express (`server.ts`) — not the default Remix CLI server
- **Database:** Postgres 16 + Prisma ORM
- **Object storage:** MinIO (for vehicle avatars and files)
- **Auth:** Cookie-based sessions (`createCookieSessionStorage`)
- **Styling:** Tailwind CSS
- **Testing:** Vitest (unit) + Cypress (e2e) + MSW (HTTP mocks)
- **Linting:** ESLint (with `import/order` alphabetized enforcement), Prettier
- **Deployment:** Fly.io (multi-region), Docker multi-stage build
- **CI/CD:** GitHub Actions

## Project Structure

```
vehicle-work-log/
├── app/
│   ├── components/              # Shared React components
│   │   ├── Breadcrumbs/
│   │   └── InputField/
│   ├── models/                  # Prisma access layer — *.server.ts only
│   │   ├── log.server.ts
│   │   ├── user.server.ts
│   │   └── vehicle.server.ts
│   ├── routes/                  # Remix flat-file routes (dot-delimited)
│   │   ├── _index.tsx
│   │   ├── healthcheck.tsx
│   │   ├── join.tsx
│   │   ├── login.tsx
│   │   ├── logout.tsx
│   │   ├── vehicles._index.tsx
│   │   ├── vehicles.$vehicleId._index.tsx
│   │   ├── vehicles.$vehicleId.edit.tsx
│   │   ├── vehicles.$vehicleId.logs._index.tsx
│   │   ├── vehicles.$vehicleId.logs.$logId.tsx
│   │   ├── vehicles.$vehicleId.logs.new.tsx
│   │   ├── vehicles.$vehicleId.logs.tsx
│   │   ├── vehicles.$vehicleId.tsx
│   │   ├── vehicles.new.tsx
│   │   └── vehicles.tsx
│   ├── db.server.ts             # Prisma singleton with region-aware URL
│   ├── session.server.ts        # requireUserId / requireUser helpers
│   ├── storage.server.ts        # MinIO client (vehicle avatars)
│   ├── singleton.server.ts      # HMR-safe singleton wrapper
│   ├── entry.client.tsx         # Remix client entry
│   ├── entry.server.tsx         # Remix server entry
│   ├── root.tsx                 # App shell
│   ├── utils.ts
│   ├── utils.test.ts
│   └── tailwind.css
├── prisma/
│   ├── schema.prisma            # User, Password, Vehicle, Log, Mechanic, Part, Tag
│   ├── seed.ts                  # Seed user rachel@remix.run
│   └── migrations/
├── cypress/                     # e2e tests
├── mocks/                       # MSW handlers (loaded via node --require)
├── test/                        # Vitest setup
├── scripts/                     # Dev/deploy scripts
├── public/
├── server.ts                    # Custom Express server
├── remix.config.js              # serverModuleFormat: "cjs"
├── fly.toml                     # Fly deploy config
├── Dockerfile                   # Multi-stage Node.js build
├── docker-compose.yml           # Local Postgres + MinIO
├── vitest.config.ts
├── cypress.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── .github/workflows/
│   ├── deploy.yml               # Lint + typecheck + vitest + cypress + Fly deploy on main/dev
│   ├── ci.yml                   # PR CI (lint + typecheck + vitest)
│   ├── groom-issues.yml         # PM agent: auto-groom new issues, /groom command, re-groom on clarification
│   ├── build-next.yml           # Builder agent: implement groomed issues
│   ├── build-issue.yml          # /build slash-command trigger
│   └── claude-review.yml        # @claude PR review
├── AGENT.md                     # ← You are here
├── AGENTS.md                    # Quick reference for AI editors
├── CLAUDE.md                    # Claude Code quick reference
├── PM_AGENT.md                  # PM agent personality
├── ARCHITECT_AGENT.md           # Architecture agent
├── DEVOPS_AGENT.md              # DevOps agent
└── README.md                    # User-facing docs
```

## Data Model

Prisma models (see `prisma/schema.prisma`):

- **User** — `id`, `email` (unique), `password` (1-1), `vehicles`, `logs`
- **Password** — `hash` stored bcrypt, 1-1 with User
- **Vehicle** — `id`, `name?`, `make`, `model`, `trim?`, `year`, `avatarPath?`, owned by User
- **Log** — `id`, `title`, `notes?`, `type?` (Minor/Major/Modify/Check), `cost?`, `odometer?`, `servicedAt`, `selfService`, belongs to User + Vehicle, optional Mechanic, many Tags + Parts
- **Mechanic** — `id`, `name`, `email?`, `location`
- **Tag** — `id`, `name` (unique), many Logs
- **Part** — `id`, `name`, `manufacturer`, `price`, `link?`, `note?`, many Logs

## Architecture

### Custom Express server (`server.ts`)

Remix is served from a hand-written Express app, not the default Remix CLI
server:

- Built as CJS (`remix.config.js` → `serverModuleFormat: "cjs"`, esbuild targets
  node/cjs). Dev watches `build/server.js` and re-imports the Remix build via a
  cache-busted dynamic import.
- **Fly multi-region replay:** non-GET/HEAD/OPTIONS requests hitting a
  non-primary region return `409` with a `fly-replay: region=$PRIMARY_REGION`
  header so writes go to the primary. Mutations that bypass this (e.g. direct
  DB writes in custom endpoints) will fail on read replicas.
- Exposes a separate Prometheus metrics server on `METRICS_PORT` (default 3010).

### Prisma singleton with region-aware URL (`app/db.server.ts`)

`prisma` is wrapped with `singleton()` (from `app/singleton.server.ts`) so it
survives dev-time module reloads. In Fly, the client rewrites `DATABASE_URL`:

- Prepends `${FLY_REGION}.` to internal hostnames.
- Switches port to `5433` (read replica) when the current region isn't
  `PRIMARY_REGION`.

Any new server-side global (clients, caches) should use the same `singleton()`
helper — otherwise it'll leak across HMR reloads. See `storage.server.ts` for
another example.

### Data layer convention

- `app/models/*.server.ts` are the only place Prisma is used. Routes import from
  `~/models/...`, never `~/db.server` directly.
- The `.server.ts` / `.server.tsx` suffix is load-bearing: Remix uses it to keep
  modules out of the client bundle. Anything touching Prisma, secrets, or
  Node-only APIs must use it.

### Auth (`app/session.server.ts`)

Cookie-based sessions (`__session`) via `createCookieSessionStorage`. Use
`requireUserId(request)` / `requireUser(request)` at the top of any protected
`loader`/`action` — they throw a redirect to `/login?redirectTo=...` on miss.
Don't roll your own auth check.

### File storage (`app/storage.server.ts`)

MinIO client for uploads (used by vehicle avatars — see `Vehicle.avatarPath`
in Prisma schema). Note: `endPoint` is hard-coded to `localhost` with a
`TODO` for Fly-hosted MinIO; don't assume it works in deployed environments
as-is.

### Routing

Flat-file routes in `app/routes/` using Remix v2 dot-delimited convention:
`vehicles.$vehicleId.logs.$logId.tsx` = `/vehicles/:vehicleId/logs/:logId`.
Path alias `~/*` → `./app/*` (see `tsconfig.json`).

### MSW mocks

`mocks/index.js` is loaded via `node --require ./mocks` in both the dev script
and `start:mocks` (used by `test:e2e:run`). Add new third-party HTTP handlers
there rather than stubbing inside tests.

## Common Commands

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

## Git Conventions

- **Squash merge only** — each PR becomes one commit on `main`.
- **Conventional commits** — PR titles must follow the
  [Conventional Commits](https://www.conventionalcommits.org/) format because
  they become the squash commit message:
  - `fix: <description>` — bug fix
  - `feat: <description>` — new feature
  - `feat!: <description>` or body contains `BREAKING CHANGE` — breaking
  - `chore:`, `docs:`, `refactor:`, `test:`, `ci:` — non-feature
  - Scopes are optional: `feat(vehicles): add VIN field`
- PR body becomes the commit description — include context, motivation, and
  test plan.

## Development

```bash
npm install           # Install deps
npm run docker        # Start Postgres + MinIO
npm run setup         # Prisma generate + migrate deploy + seed
npm run typecheck     # Type check
npm test              # Run vitest (watch)
npm run dev           # Dev server on :3000
npm run build         # Production build
npm start             # Start built app
```

## Testing Philosophy

- **Unit (vitest):** Pure utilities and model functions. HTTP calls mocked via
  MSW. Run with `npm test` or `npm test -- --run`.
- **End-to-end (cypress):** User flows against a full built app with MSW
  shimmed in via `node --require ./mocks`. Run with `npm run test:e2e:dev` (UI)
  or `npm run test:e2e:run` (headless, CI).
- **Type checking:** `npm run typecheck` runs `tsc` on both the app and the
  cypress project.

Cypress utilities:

- `cy.login()` — logs in as a freshly created user
- `cy.cleanupUser()` — deletes the test user, call in `afterEach`

## Environment Variables

See `.env.example` (if present) or `docker-compose.yml` for the full list.

Key vars:

- `DATABASE_URL` — Postgres connection string. In Fly, the app rewrites this
  to include the region and route non-primary regions to the `5433` read
  replica.
- `SESSION_SECRET` — signs the session cookie. Required.
- `PRIMARY_REGION` / `FLY_REGION` — for multi-region replay logic in
  `server.ts`.
- `METRICS_PORT` — Prometheus metrics port (default `3010`).
- MinIO config (see `storage.server.ts`) — endpoint, access key, secret key,
  bucket.

## Notes

- Node >= 18 required (`package.json` `engines`). CI runs on Node 20–22; use 20
  for consistency with the Cypress job.
- ESLint enforces `import/order` with alphabetized groups and blank lines
  between groups. Run `npm run lint` before committing — CI will fail on
  violations.
- Prettier is configured. Run `npm run format` to auto-format.
- Deploys: pushes to `main` → production, pushes to `dev` → staging (via
  `.github/workflows/deploy.yml` on Fly).

## Common Tasks

### Add a new route

1. Create a file in `app/routes/` following the dot-delimited convention
   (`vehicles.$vehicleId.logs.new.tsx` = `/vehicles/:vehicleId/logs/new`).
2. Export `loader` and/or `action` and a default component.
3. Use `requireUserId(request)` or `requireUser(request)` at the top of any
   protected loader/action.
4. Access data via `app/models/*.server.ts` — never import `~/db.server`
   directly from a route.

### Add a new Prisma model

1. Edit `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name <short-description>` locally to generate
   a migration.
3. Run `npx prisma generate` (automatic after migrate) to update the client.
4. Add a new `app/models/<model>.server.ts` module for data access.
5. If the model is seeded, update `prisma/seed.ts`.
6. Commit the generated migration file under `prisma/migrations/`.

### Add a new server-side global (client/cache)

Wrap it in `singleton()` from `app/singleton.server.ts` so it survives dev HMR.
See `app/db.server.ts` and `app/storage.server.ts` for examples.

### Add a new third-party HTTP dependency

Add the MSW handler in `mocks/` so e2e tests can run without hitting the real
service. Don't stub per-test.

### Deploy

Merges to `main` deploy to production via
`.github/workflows/deploy.yml`; merges to `dev` deploy to staging. Both run
lint + typecheck + vitest + cypress first. Requires `FLY_API_TOKEN` in repo
secrets.

### Update docs

When making code changes, update the relevant documentation files:

- `AGENT.md` — Architecture, interfaces, common tasks, development
- `AGENTS.md` / `CLAUDE.md` — Quick reference for AI editors
- `PM_AGENT.md` — PM agent personality, grooming protocol, builder task
  selection
- `ARCHITECT_AGENT.md` — Architecture review methodology, proposals
- `DEVOPS_AGENT.md` — DevOps review protocol, CI/CD audit checklist
- `README.md` — User-facing docs, setup, configuration
