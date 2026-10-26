# Contributing to Email Hub

How we branch, commit, open PRs, run the stack, and change the database.
For full team process (task states, review matrix, Definition of Done), see the Notion **Developer Rules** page under EmailHub DataAccess1.

## Branch flow (model B)

| Branch | Role                                   |
| ------ | -------------------------------------- |
| `main` | Production-bound                       |
| `dev`  | Integration — all task work lands here |

1. Update `dev`: `git fetch origin && git checkout dev && git pull origin dev`
2. Create a task branch from that tip (never from a stale local branch).
3. Open a PR **into `dev`**.
4. Promote to production with a separate PR: `dev` → `main` (never push `dev` into `main` without a PR).
5. Hotfixes: branch from `main`, PR into `main`, then merge the fix back into `dev`.

Never commit directly to `main` or `dev`. Delete the task branch after merge.

## Branch naming

```text
<type>/T-###-short-kebab-name
```

| Type      | Use for                                |
| --------- | -------------------------------------- |
| `feature` | New behaviour                          |
| `fix`     | Bug fix                                |
| `chore`   | Tooling, dependencies, config          |
| `docs`    | Documentation only                     |
| `test`    | Tests only                             |
| `hotfix`  | Urgent Prod fix (branched from `main`) |

Examples: `feature/T-012-hmac-middleware`, `fix/T-087-dst-day-boundary`, `docs/T-018-contributing-handbook`.

Rules: lowercase, hyphens only, no spaces or underscores, keep the name short. One task per branch.

## Commits

Conventional Commits with the task id as the scope:

```text
<type>(T-###): <summary>
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`.

Examples:

```text
feat(T-012): add HMAC verification middleware
fix(T-087): handle DST change day in ET helper
docs(T-018): add CONTRIBUTING and dev handbook
```

- Imperative summary ("add", not "added"), ≤72 characters, no trailing period.
- One logical change per commit; do not mix formatting with behaviour.
- Never commit secrets, `.env` files, or real recipient emails.
- Husky `commit-msg` runs commitlint — fix the message; do not bypass hooks.

## Pull requests

**Title:** prefer `feat(T-012): add HMAC verification middleware` (matches the squash commit). Include the task id.

**Base:**

- Task work → `dev`
- Release → `main` (compare `dev`), title like `Release: promote dev to main (YYYY-MM-DD)`
- Hotfix → `main`, then follow up into `dev`

**Size:** under **400 changed lines**, excluding lockfiles and generated files. Split larger work.

**Rules:**

- One task per PR into `dev`.
- CI green before requesting review.
- Do not merge your own PR.
- Resolve every review comment before merge.
- Squash merge only.
- Keep the branch updated with **merge** from `dev` (do not rebase shared review history unless the team asks).

Use the PR template in [`.github/pull_request_template.md`](.github/pull_request_template.md).

### Referencing System Design (SD) pages

In the PR body under **Task**:

```text
T-012 · HMAC verification middleware
SD reference: SD#12.7, SD#15.6
```

- Cite the SD section numbers that the change implements or touches.
- Link the Notion Doc Index / SD page when useful.
- If the code must differ from an SD page, update that SD page in the same week and log the change in **SD#17**.

## Local stack

Prerequisites: Node.js 24 LTS, pnpm 11+.

### Install and quality checks

```bash
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Coverage and integration tests: `pnpm test:coverage`, `pnpm test:int` (see root [README.md](README.md)). `pnpm test:int` migrates one Postgres template and gives each Vitest worker a copy.

### Dependencies (Docker)

From the repo root:

```bash
docker compose -f docker-compose.dev.yml up -d
```

| Service    | Ports                          | Notes                                                                              |
| ---------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| Postgres   | `5432`                         | Owner `emailhub`. App role `emailhub_app`. Database and local password `emailhub`. |
| Redis      | `6379`                         | Password: `emailhub`                                                               |
| ClickHouse | `8123` (HTTP), `9000` (native) |                                                                                    |
| Mailpit    | `1025` (SMTP), `8025` (UI)     | Local mail catcher                                                                 |

### App env

Copy and edit the app env (Drizzle reads this file only — not a root `.env`):

```bash
cp apps/email-hub/.env.example apps/email-hub/.env
```

Default local database URLs. `DATABASE_URL` is the app role. `DATABASE_MIGRATION_URL` is the owner login used by migrations:

```text
DATABASE_URL=postgresql://emailhub_app:emailhub@127.0.0.1:5432/emailhub
DATABASE_MIGRATION_URL=postgresql://emailhub:emailhub@127.0.0.1:5432/emailhub
```

Then:

```bash
pnpm dev
```

## Database migrations (Postgres / Drizzle)

Schema changes ship only as Drizzle migrations under `packages/db`. Never edit a migration that is already merged — add a new one.

1. Change schema TypeScript under `packages/db/src/schema/`.
2. Ensure `apps/email-hub/.env` sets `DATABASE_URL` (app role) and `DATABASE_MIGRATION_URL` (owner). When the same variable is also set in the process environment, the two values must match.
3. From **`packages/db`** (required — paths are relative to that package):

   ```bash
   pnpm --filter @workspace/db db:generate
   pnpm --filter @workspace/db db:migrate
   ```

   Or `cd packages/db` then `pnpm db:generate` / `pnpm db:migrate`.
   `db:migrate` applies the Postgres migrations, grants `emailhub_app` (insert and select only on `audit_log`), then the ClickHouse runner.

   Dev catalog data is separate from migrate. `pnpm --filter @workspace/db db:seed` inserts categories, frequency rules, one offer, and sample recipients. It only runs when `DATABASE_URL` points at a loopback host.

4. Commit the SQL under `packages/db/drizzle/`, snapshots under `packages/db/drizzle/meta/`, and schema sources together.
5. Migrations must stay backward compatible with the previous app version.

ClickHouse DDL lives under `packages/db/clickhouse/` as numbered files (`0001_….sql`). Ensure `apps/email-hub/.env` has `CLICKHOUSE_URL`. Run ClickHouse alone with `pnpm --filter @workspace/db db:ch:migrate`. Never rewrite a shipped migration.

## Quick reference

| Item           | Format / rule                                                                     |
| -------------- | --------------------------------------------------------------------------------- |
| Branch         | `feature/T-012-hmac-middleware`                                                   |
| Commit         | `feat(T-012): add HMAC verification middleware`                                   |
| PR into        | `dev` (tasks); `main` only for release / hotfix                                   |
| PR size        | under 400 lines (excl. lockfile / generated)                                      |
| SD in PR       | `SD reference: SD#12.7`                                                           |
| Local services | `docker compose -f docker-compose.dev.yml up -d`                                  |
| Server stack   | `docker-compose.yml` (+ `docker-compose.dev-server.yml` on Dev); see below        |
| Migrate        | `pnpm --filter @workspace/db db:migrate` (Postgres + ClickHouse)                  |
| Prod image     | `docker build -t emailhub:local .` then run web default CMD or `node apps/worker` |

### Server Compose (droplet / Coolify)

Root `docker-compose.yml` is the Dev/Prod host stack (SD#13.2): Caddy (only published ports 80/443), web, worker, Postgres, ClickHouse, Redis, Alloy. Volumes live under `/data/...`. Copy `.env.compose.example` to `.env.compose` on the host (mode 600) or inject the same keys in Coolify.

App container secrets (SD#11.11) belong in Coolify encrypted env. Use `deploy/coolify-app-env.example` as the checklist. Set `EMAILHUB_ENV=dev` on Dev (SMTP/Mailpit allowed) and `EMAILHUB_ENV=prod` on Prod (`MAIL_TRANSPORT=ses`, do not set `E2E`). Missing or invalid env stops web/worker boot with a clear message (`loadServerEnv`).

```bash
# Prod droplet
docker compose --env-file .env.compose up -d

# Dev droplet (adds Mailpit on the internal network only)
docker compose -f docker-compose.yml -f docker-compose.dev-server.yml --env-file .env.compose up -d
```

Do not publish Postgres/Redis/ClickHouse ports on the droplet. Laptop local deps stay on `docker-compose.dev.yml`.

More index links: [docs/README.md](docs/README.md).
