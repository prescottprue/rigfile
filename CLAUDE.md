# CLAUDE.md — Logbook

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
npm run db:seed         # scott@example.com / scottiscool + vehicle, log, reminders, project
npm run scan:extract -- <folder>            # Scan Bay: scans → review JSON (local Ollama)
npm run scan:import -- <review.json> --vehicle <id> [--user <id>] [--reminders]
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
- **Access is membership-based, not owner-only.** `vehicle_members` grants
  crew access (roles: `owner` | `member`); every vehicle-scoped model
  function calls `requireVehicleAccess({ vehicleId, userId })` from
  `~/models/member.server` (or joins on `vehicle_members`). Owner-only
  ops (delete vehicle, manage crew) use `requireVehicleOwner`. The
  vehicle's `userId` column remains the owner. Invites for unknown
  emails live in `vehicle_invites` and are claimed in `signupFn`.
- **Ownership checks in queries**: any model function that takes an `id`
  must scope by `userId` (membership) too. See `getVehicle({ id, userId })`.
- **Semantic color tokens, not raw palette classes** in app UI: use
  `bg-surface`/`bg-card`/`bg-sunken`, `text-ink`/`text-ink-muted`,
  `border-line`, `bg-accent`, `text-danger`/`warn`/`ok` (defined via
  `@theme inline` in `app/styles.css`). Garage Mode toggles a `.garage`
  class on `<html>` (high-contrast dark + 18px base font) — raw slate/red
  classes won't reskin. Shared class recipes live in `app/components/ui.ts`.
- **Dev server env comes from `.dev.vars`**, not the host process env —
  the Cloudflare vite plugin runs SSR in workerd, which can't see shell
  exports. Node-side tooling (drizzle-kit, seed, vitest) still reads
  `DATABASE_URL` from the environment / `.env`. Keep both files in sync
  (both are gitignored).
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
   (incl. `log_attachments`: scans/photos/docs attached to a log;
   `vehicles.vin`: backfilled from receipts, never overwritten;
   `vehicles.engine`: free-text engine description, filled by vPIC decode,
   always user-editable;
   `logs.service_started_at` + `serviced_at`: service start and
   close/completion dates — a single-date receipt fills only the close;
   `odometer_readings`: standalone mileage entries (odometer, read_at, note,
   user_id) — "last odometer" is latest-by-date across logs + manual readings,
   ties broken by higher miles)
2. `app/db/client.ts` — postgres-js client, runtime-aware
3. `app/db/migrations/` — generated SQL (do not edit by hand unless
   adding CREATE EXTENSION-style ops that Drizzle can't infer)
4. `app/auth/session.server.ts` — session cookie config + `requireAuth()`
5. `app/auth/server-fns.ts` — login/signup/logout/currentUser server fns
6. `app/storage.server.ts` — `Storage` interface + LocalFS + R2 drivers;
   `getStorage()` auto-resolves the R2 `UPLOADS` binding on Workers (lazy,
   via `cloudflare:workers`), LocalFS elsewhere
7. `app/models/*.server.ts` — the only place that imports from `~/db/client`;
   `member.server.ts` (crew/invites/access), `reminder.server.ts`
   (date+mileage due, recurring roll-forward), `project.server.ts`
   (builds + parts pipeline; status vocab in `project.shared.ts` because
   client code can't import values from `.server.ts` modules),
   `attachment.server.ts` (log attachments — uploads via storage layer +
   row insert, access checked against the log's vehicle),
   `mechanic.server.ts` (vendors/shops — case-insensitive find-or-create;
   logs link via `logs.mechanicId`, the logs list filters by vendor),
   `odometer.server.ts` (union latest across logs + manual readings, batch
   helper, history, create/delete — deletes restricted to author-or-owner),
   `vehicle-form.server.ts` (shared parse + avatar store + avatar reap for
   create and edit routes)
8. `app/lib/` — isomorphic client utilities (safe to call from route
   components): `image.ts` (`downscaleImage` — shared JPEG downscale used
   by the scan page ~1600px and avatar uploads ~1024px; deliberately NOT
   named `.client.ts` because TanStack Start's import-protection denies
   `*.client.*` imports from SSR-reachable route components — functions are
   only called inside browser event handlers), `vpic.ts` (NHTSA vPIC
   client — VIN decode prefills year/make/model/trim/engine; make/model
   datalist suggestions; browser-direct CORS calls, no API key, 5s timeout,
   degrades gracefully to plain free-text)
9. `app/scan/` — Scan Bay. `receipt.ts` is the isomorphic extraction
   contract (JSON schema + prompt + `normalizeReceipt`/`receiptToNotes`);
   `extract.server.ts` is the runtime seam (Workers AI binding on CF,
   Ollama fallback on Node — `ollama.server.ts`); `import.server.ts` is
   `createLogWithScan` (log + attachment + optional reminder), shared by
   the batch CLI (`scripts/scan-bay/`) and the in-app scan page.
10. `app/routes/*` — file-based routes, including `/files/$` streaming
    route, `/account/export` JSON bundle endpoint,
    `_authed.vehicles.$vehicleId.scan.tsx` (in-app receipt scan),
    `_authed.vehicles.$vehicleId.odometer.tsx` (current reading + source +
    quick-add form + history with author-or-owner delete), and
    `_authed.vehicles.$vehicleId.edit.tsx` (owner-only vehicle edit:
    name/year/make/model/trim/engine/VIN/avatar); `app/components/VehicleForm.tsx`
    is the shared create/edit form (vPIC assists + avatar downscale)
11. `wrangler.jsonc` — Cloudflare Workers config (Hyperdrive, R2, Workers
    AI, secrets). The `ai` binding is remote-only; dev keeps remote
    bindings OFF unless `CF_REMOTE_BINDINGS=1` (see vite.config.ts), so
    `npm run dev` never requires `wrangler login`.
12. `drizzle.config.ts` — Drizzle Kit config
13. `tsr.config.json` — TanStack Router CLI config; drives
    `app/routeTree.gen.ts` generation (the file is gitignored, so
    `npm run typecheck` regenerates it via `tsr generate` first)
14. `biome.json` — lint/format rules
15. `Dockerfile` + `docker/s6-rc.d/` — single-container self-host image
16. `docker-compose.yml` — dev Postgres only (not for self-host)

## Git conventions

- **Squash merge only** — each PR becomes one commit on `main`.
- **Conventional commits** — PR titles follow
  [Conventional Commits](https://www.conventionalcommits.org/):
  `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `ci:`, with
  optional scopes (`feat(db): ...`). Breaking changes use `feat!:` or
  include `BREAKING CHANGE:` in the body.
- PR title = commit message; PR body = commit description. Write clear,
  descriptive PR titles — they become the permanent history.

## Pit Crew — agent automation workflows

See the README "Pit Lane" section for the full flow and issue labels.

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `ci.yml` | PRs | Biome + TypeScript + Vitest + CF build |
| `deploy.yml` | push to main/dev | Apply Drizzle migrations to Neon, then `wrangler deploy` |
| `groom-issues.yml` | issues, `/groom` comments | Service Writer: evaluates + plans + labels |
| `build-next.yml` | `/build` command or dispatch | Wrench: implements a groomed issue, opens PR |
| `build-issue.yml` | `/build` comment | Routes to `build-next.yml` |
| `test-driver.yml` | `test-drive` label or `/test-drive` comment | Posts a UX/a11y test plan |
| `claude-review.yml` | `@claude` mention | Code review |

Agent persona docs (`SERVICE_WRITER.md`, `CHIEF_MECHANIC.md`, etc.)
describe each role's protocol — they still reference the old
Remix/Prisma stack in places and are queued for a refresh pass.

## Open issues to be aware of

- `npm run build:node` (Nitro + TanStack Start node preset) produces
  `.output/server/index.mjs` but runtime 404s on all routes — SSR
  fallback wiring. Tracked for the self-host image release.

## Next up (June 2026, in priority order)

### 1. Scan Bay — paper shop-record ingestion (local AI, $0)

The app's core purpose is digitizing Scott's vehicle maintenance records,
including a backlog of paper shop invoices.

- **Phase 1 (DONE) — batch CLI.** `scripts/scan-bay/` + local Ollama
  (`qwen3-vl:8b`, JSON-schema structured output via `format` on `/api/chat`,
  temp 0). Two steps with a human review between: `npm run scan:extract --
  <folder>` writes a `scan-review.json`; edit it; `npm run scan:import --
  <review.json> --vehicle <id> [--reminders]` creates a log per invoice via
  the model layer, stores the original scan as a `log_attachments` row, and
  (with `--reminders`) drafts a reminder from `recommendedWork`. Idempotent —
  imported entries are stamped with their logId. The extraction prompt +
  schema + normalizer live in `app/scan/receipt.ts` (isomorphic, so phase 2
  reuses them). Attachments render on the log detail page.
- **Phase 2 (DONE) — in-app one-off scans:** `/vehicles/$vehicleId/scan`
  (📷 button on the vehicle dashboard + logs list). Phone camera capture →
  client-side downscale (~1600px JPEG) → `extractReceiptScan()` in
  `app/scan/extract.server.ts` (Workers AI `@cf/meta/llama-3.2-11b-vision-
  instruct` w/ `response_format` json_schema on CF; Ollama fallback on
  Node/dev) → editable prefilled form → `createLogWithScan()` saves log +
  attaches the photo + optionally drafts a reminder from `recommendedWork`.
  Extraction failures degrade gracefully: the form opens blank and the
  photo still attaches on save.
- Deliberately NOT the Anthropic API — cost. Don't suggest it for this.

### 2. Logbook MCP server

So the crew can talk to Logbook from their own Claude accounts
(claude.ai custom connector, works on mobile). NOTE: rally-specific
features stay OUT of the app — the app is generic vehicle maintenance;
rally procedure lives in Scott's external rebelle-rally skill, which will
call these MCP tools:

- Remote MCP endpoint at `/mcp` on the existing Worker — Cloudflare
  `agents` SDK (`McpAgent`) + `workers-oauth-provider`, OAuth backed by
  the existing `users` table + session auth (login screen on connect; no
  API keys for end users).
- Tools are thin wrappers over `app/models/*` so crew-membership
  authorization is enforced for free: `log_work`, `whats_due`,
  `complete_reminder`, `get_vehicle_status`, `list_projects`,
  `add_project_item`, `update_item_status`.
- A rally-prep skill (Rebelle Rally — Scott has a draft) layers event
  procedure on top and calls these tools; keep event-specific content in
  the skill, generic data access in MCP.

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
