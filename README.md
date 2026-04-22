# Vehicle Work Log

A personal maintenance log for every car you own. Track services, parts,
odometer, cost, and notes per vehicle. Export your whole history as JSON
whenever you want — and run your own instance on a single `docker run` if you
don't want to rely on any hosted provider.

This repo originally ran on Remix + Fly + Postgres + MinIO. It was rebuilt
from the ground up in 2026 on a TanStack Start stack targeting Cloudflare
Workers, with a first-class self-host path that ships as a single Docker
image.

## Stack

| Concern              | Choice                                       |
| -------------------- | -------------------------------------------- |
| Framework            | [TanStack Start](https://tanstack.com/start) (Vite, React 19) — CF Workers via `@cloudflare/vite-plugin` for dev + prod; Nitro for the self-host Node build |
| ORM                  | [Drizzle](https://orm.drizzle.team)           |
| Database             | Postgres 16 everywhere                       |
| Vectors / FTS ready  | `pgvector` + `pg_trgm` extensions on day one |
| File storage         | R2 (cloud) · local filesystem (self-host)    |
| Cloud deploy         | Cloudflare Workers + Hyperdrive + Neon + R2  |
| Self-host deploy     | Single Docker image (app + Postgres + data volume) |
| Lint / format        | [Biome 2](https://biomejs.dev)                |
| Tests                | Vitest (integration), Playwright (planned)   |
| Auth                 | Cookie session via TanStack Start `useSession` + bcryptjs |
| Styling              | Tailwind v4                                  |

### Why these choices

The interesting decisions, so future me and you know why things are the way
they are:

- **Postgres everywhere instead of SQLite + D1.** Text search is already
  wired up (`tsvector` + GIN index on `logs`), and the near-term plan
  includes a chat agent that will want embeddings. `pgvector` makes that a
  one-system story; SQLite would force a separate vector DB. Neon's free
  tier covers this app easily on Cloudflare, and the self-host image ships
  with Postgres baked in so users still get one-command install.
- **Drizzle over Prisma.** Drizzle is lightweight and edge-runtime-friendly,
  works on Cloudflare Workers via Hyperdrive without a second schema
  language, and generates plain SQL migrations you can read.
- **Cloudflare Workers over Fly.** Lower cost at this scale, globally
  distributed by default, and the R2 + Hyperdrive + Workers combo removes
  the previous custom Fly-region replay Express server entirely.
- **Biome over ESLint + Prettier.** One binary, one config, dramatically
  faster. Replaces everything we were doing before except a handful of
  domain-specific plugins we didn't actually need.
- **TanStack Start over staying on Remix.** Same file-based routing model
  we liked, but with server functions, better typed router, and a Vite
  build pipeline that retargets Cloudflare Workers or Node from one codebase.
- **Local filesystem on self-host, R2 in the cloud.** A single `Storage`
  interface with two drivers. The URL shape (`/files/<key>`) is identical
  on both — there's no presigned-URL dance on self-host.
- **Data export as a core feature.** `GET /account/export` returns your
  entire record as a versioned JSON bundle. Self-hosting is pointless if
  you can't get your data out.

## Quick start (local dev)

Prereqs: Node 24+, Docker.

```sh
# 1. Install deps
npm install

# 2. Start local Postgres (pgvector image, on port 5440)
npm run docker:dev

# 3. Seed env
cp .env.example .env
# (SESSION_SECRET in .env must be ≥ 32 characters)

# 4. Run migrations + seed
npm run db:migrate
npm run db:seed

# 5. Run the dev server
npm run dev
```

Open http://localhost:3000. Seed login: `scott@example.com` / `scottiscool`.

### Useful commands

```sh
npm run dev            # vite dev server
npm run build          # Cloudflare build (dist/)
npm run build:node     # Node/Nitro build (.output/)
npm run typecheck      # tsc --noEmit
npm run lint           # biome check
npm run lint:fix       # biome check --write
npm test               # vitest (watch)
npm test -- --run      # single pass
npm run db:generate    # drizzle-kit generate (after schema changes)
npm run db:migrate     # apply pending migrations
npm run db:studio      # drizzle-kit studio
npm run validate       # typecheck + lint + test (CI equivalent)
```

## Self-hosting

The self-host image bundles the Node app + Postgres 16 + s6-overlay in a
single container. One command, one mounted volume:

```sh
docker run -d \
  -p 3000:3000 \
  -v vwl-data:/app/data \
  -e SESSION_SECRET="$(openssl rand -base64 48)" \
  ghcr.io/scottprue/vehicle-work-log:latest
```

Everything persistent (Postgres cluster + uploaded files) lives under
`/app/data`, so backing up is as simple as snapshotting the volume.

See `docs/SELF_HOSTING.md` for upgrades, backups, and exporting your data.

> Note: The self-host image is being finalized — `npm run build:node` has an
> outstanding Nitro + TanStack Start integration issue tracked in the
> Phase 5 TODO. Until that's resolved, self-host users can clone the repo
> and run the dev server directly, or wait for the tagged image release.

## Deploying to Cloudflare Workers

Prereqs: a Cloudflare account, a Neon Postgres database, an R2 bucket, and
a Hyperdrive binding pointing at the Neon connection string.

```sh
# Create R2 bucket
wrangler r2 bucket create vehicle-work-log-uploads

# Create Hyperdrive over Neon
wrangler hyperdrive create vehicle-work-log-db --connection-string="$NEON_URL"
# paste the returned id into wrangler.jsonc under hyperdrive[0].id

# Set SESSION_SECRET for the Worker
wrangler secret put SESSION_SECRET

# Apply migrations to Neon (one-off; CI does this automatically)
DATABASE_URL=$NEON_URL npm run db:migrate

# Deploy
npm run deploy:cf
```

CI (`.github/workflows/deploy.yml`) does steps 3–5 automatically on push
to `main` (production) and `dev` (staging). Required secrets:
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEON_DATABASE_URL`.

## Architecture

```
app/
  db/
    schema.ts           # Drizzle Postgres tables + tsvector + pgvector setup
    client.ts           # postgres-js client (works on Node + Workers)
    seed.ts             # scott@example.com + 2007 WRX
    migrations/         # drizzle-kit generated SQL
  models/
    user.server.ts      # getUserById, verifyLogin, createUser, ...
    vehicle.server.ts   # CRUD scoped to userId
    log.server.ts       # CRUD + searchLogs using tsvector
  auth/
    session.server.ts   # useAppSession (__session cookie)
    password.server.ts  # bcryptjs wrapper
    server-fns.ts       # loginFn / signupFn / logoutFn / getCurrentUserFn
  storage.server.ts     # Storage interface: LocalFS + R2 drivers
  routes/
    __root.tsx          # HTML shell, tailwind import
    index.tsx           # splash
    login.tsx, join.tsx, logout.tsx
    healthcheck.tsx     # server handler returning "ok"
    files.$.tsx         # streams uploaded files
    account.export.tsx  # GET → JSON bundle
    _authed.tsx         # authed layout
    _authed.vehicles.*  # vehicles CRUD
    _authed.vehicles.$vehicleId.logs.*  # logs CRUD
```

Server-only concerns end in `.server.ts` so the Vite build tree-shakes them
out of the client bundle.

## Data export

`GET /account/export` returns a versioned JSON bundle:

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-04-22T...",
  "user": { "id": "...", "email": "...", "createdAt": "...", "updatedAt": "..." },
  "vehicles": [{ ..., "avatarUrl": "/files/..." }],
  "logs": [ ... ],
  "mechanics": [ ... ],
  "tags": [ ... ],
  "parts": [ ... ],
  "logsToTags": [ ... ],
  "logsToParts": [ ... ]
}
```

`schemaVersion` gives future importers a hook to evolve the format without
breaking old bundles.

## Roadmap

Near-term:

- Playwright e2e coverage for login → vehicle → avatar upload → log → export
  flows
- Finalize the single-container self-host image and publish the first GHCR
  release
- Fix the Nitro 3 + TanStack Start node-build integration so `npm run build:node`
  produces a working `.output/server/index.mjs`
- Reinstate the `_authed` `beforeLoad` guard once `useSession` works from
  loaders

Beyond that:

- MCP server exposing read-only tools over the user's data
- Chat agent backed by `pgvector` embeddings of log title + notes for
  semantic search ("when did I last replace the brake pads on the WRX?")
- Avatar zip download as a `/account/export.zip` companion to the JSON

## License

MIT.
