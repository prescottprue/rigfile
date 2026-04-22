# CLAUDE.md — Vehicle Work Log

Quick reference for Claude Code sessions in this repo. Read `README.md` for
user-facing context and tool-choice rationale.

## Stack

- **Framework**: TanStack Start (Vite) — file-based routes in
  `app/routes/`, server functions via `createServerFn`. Dev and the
  production CF build both run through `@cloudflare/vite-plugin`
  (reusing Vite's `ssr` env so the TanStack Start server-fn transformer
  is applied). Nitro is only wired in for `npm run build:node`.
- **Runtime targets**: Cloudflare Workers (primary) and Node self-host
  (Docker image). The runtime seam is kept small: `app/db/client.ts`,
  `app/storage.server.ts`. Everything else is isomorphic.
- **DB connection**: `getDb()` is **async** — on Workers it dynamically
  imports `cloudflare:workers` and uses `env.HYPERDRIVE.connectionString`,
  returning a fresh client per request (Hyperdrive pools under the hood).
  On Node it falls back to `DATABASE_URL` with a process-wide singleton.
  All callers `await getDb()`.
- **ORM**: Drizzle, Postgres dialect, postgres-js driver.
- **DB**: Postgres 16 everywhere. Extensions enabled in the initial
  migration: `pg_trgm`, `vector` (pgvector). `logs.search_tsv` is a
  generated column with a GIN index — use `searchLogs()` for FTS.
- **Lint/format**: Biome 2 (`biome.json`). No ESLint/Prettier.
- **Tests**: Vitest (integration, hits real local Postgres). Playwright
  e2e smoke tests in `e2e/` (registration, login, vehicle+log CRUD).
- **Auth**: TanStack Start `useSession` in `app/auth/session.server.ts`,
  wrapped by `loginFn`, `signupFn`, `logoutFn`, `getCurrentUserFn` in
  `app/auth/server-fns.ts`. bcryptjs for hashing.
- **Styling**: Tailwind v4 via `@tailwindcss/vite`. No `tailwind.config.ts`,
  no PostCSS — `@import "tailwindcss"` in `app/styles.css`.
- **Package manager**: npm, lockfile `package-lock.json`. Node 24+.

## Common commands

```sh
npm run docker:dev      # start local Postgres (pgvector/pgvector:pg16 on :5440)
npm run db:migrate      # apply Drizzle migrations
npm run db:seed         # creates scott@example.com / scottiscool + seed vehicle
npm run db:generate     # after schema changes
npm run db:studio       # Drizzle Studio against local DB
npm run dev             # Vite dev server on :3000
npm run build           # Cloudflare Workers build → dist/
npm run build:node      # Node/Nitro build → .output/ (WIP — see README)
npm run typecheck       # runs `tsr generate && tsc --noEmit`
npm run lint            # biome check
npm run lint:fix        # biome check --write
npm test -- --run       # vitest single pass
npm run validate        # typecheck + lint + test
npm run test:e2e        # playwright smoke tests (needs dev server + DB)
```

## Conventions

- **Server-only modules end in `.server.ts` / `.server.tsx`** — Vite
  tree-shakes them out of the client bundle. Anything touching Drizzle,
  `useSession`, or filesystem/R2 belongs in a `.server.ts` file.
- **Data layer lives in `app/models/*.server.ts`**. Routes import from
  `~/models/...`, not from `~/db/client` directly.
- **Auth is two layers: route guard + server function check.**
  `/_authed` layout enforces auth in `beforeLoad` via `getCurrentUserFn`
  (redirects to `/login` if no session). Server functions additionally
  call `requireAuth()` from `~/auth/session.server` for defense-in-depth.
- **`throw redirect()` only works in `beforeLoad`/loaders.** When a
  `createServerFn` handler throws `redirect()` and is called from a
  client event handler, the redirect arrives as a 307 Response the
  router never sees. Server functions called from forms must **return
  data** and let the client navigate — use `window.location.assign()`
  for auth (forces full reload to pick up session cookie) or
  `useNavigate()` for mutations.
- **Ownership checks in queries**: any model function that takes an `id`
  must scope by `userId` too. See `getVehicle({ id, userId })`.
- **Path alias**: `~/*` → `./app/*`.
- **Biome `useHookAtTopLevel` is disabled for `.server.ts`, `server-fns.ts`,
  and `app/routes/**`** because TanStack Start's `use*`-named helpers are
  server-side, not React hooks.

## Safety rules (non-negotiable)

- Do NOT skip auth — every server function that reads/writes user data
  calls `requireAuth()` first (returns `userId` or throws redirect).
- Do NOT return another user's data — every query takes a `userId` and
  filters on it. Same for vehicleId → userId, logId → userId+vehicleId.
- Do NOT import `~/db/client` from a route — go through `~/models/...`.
- Do NOT commit `.env` or Cloudflare secrets.
- Do NOT weaken the Biome config to silence violations.
- Do NOT bypass Drizzle migrations on production (both `wrangler deploy`
  CI and self-host first-start run `drizzle-kit migrate`).

## Files to know

1. `app/db/schema.ts` — all tables + pgvector + tsvector setup
2. `app/db/client.ts` — postgres-js client, runtime-aware
3. `app/db/migrations/` — generated SQL (do not edit by hand unless
   adding CREATE EXTENSION-style ops that Drizzle can't infer)
4. `app/auth/session.server.ts` — session cookie config + `requireAuth()`
5. `app/auth/server-fns.ts` — login/signup/logout/currentUser server fns
6. `app/storage.server.ts` — `Storage` interface + LocalFS + R2 drivers
7. `app/models/*.server.ts` — the only place that imports from `~/db/client`
8. `app/routes/*` — file-based routes, including `/files/$` streaming
   route and `/account/export` JSON bundle endpoint
9. `wrangler.jsonc` — Cloudflare Workers config (Hyperdrive, R2, secrets)
10. `drizzle.config.ts` — Drizzle Kit config
11. `tsr.config.json` — TanStack Router CLI config; drives
    `app/routeTree.gen.ts` generation (the file is gitignored, so
    `npm run typecheck` regenerates it via `tsr generate` first)
12. `biome.json` — lint/format rules
13. `Dockerfile` + `docker/s6-rc.d/` — single-container self-host image
14. `docker-compose.yml` — dev Postgres only (not for self-host)

## Git conventions

- **Squash merge only** — each PR becomes one commit on `main`.
- **Conventional commits** — PR titles follow
  [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, with
  optional scopes (`feat(db): ...`). Breaking changes use `feat!:` or
  include `BREAKING CHANGE:` in the body.
- PR title = commit message; PR body = commit description. Write clear,
  descriptive PR titles — they become the permanent history.

## Agent automation workflows

Preserved from the pre-rewrite repo; the docs haven't all been updated yet.

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | PRs | Biome + TypeScript + Vitest + CF build |
| `deploy.yml` | push to main/dev | Apply Drizzle migrations to Neon, then `wrangler deploy` |
| `groom-issues.yml` | issues, `/groom` comments | Service Writer: evaluates + plans + labels |
| `build-next.yml` | `/build` command or dispatch | Wrench: implements a groomed issue, opens PR |
| `build-issue.yml` | `/build` comment | Routes to `build-next.yml` |
| `test-driver.yml` | PRs touching routes/components/schema | Posts a UX/a11y test plan |
| `claude-review.yml` | `@claude` mention | Code review |

Agent persona docs (`SERVICE_WRITER.md`, `CHIEF_MECHANIC.md`, etc.)
describe each role's protocol — they still reference the old
Remix/Prisma stack in places and are queued for a refresh pass.

## Open issues to be aware of

- `npm run build:node` (Nitro + TanStack Start node preset) produces
  `.output/server/index.mjs` but runtime 404s on all routes — SSR
  fallback wiring. Tracked for the self-host image release.

## Documentation policy

When making code changes, update the relevant docs:

- `README.md` — user-facing docs, tool-choice rationale
- `CLAUDE.md` (this file) — quick reference for future sessions
- `docs/SELF_HOSTING.md` — self-host UX
- `app/db/schema.ts` + the generated migration — schema changes
- `.env.example` — any new env vars

Agent persona docs (`SERVICE_WRITER.md`, `CHIEF_MECHANIC.md`,
`CREW_CHIEF.md`, `TEST_DRIVER.md`, `AGENT.md`, `AGENTS.md`) are
pre-rewrite and need a refresh pass before they're accurate again.
