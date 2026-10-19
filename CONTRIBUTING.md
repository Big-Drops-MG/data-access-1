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

Coverage and integration tests: `pnpm test:coverage`, `pnpm test:int` (see root [README.md](README.md)).

### Dependencies (Docker)

From the repo root:

```bash
docker compose -f docker-compose.dev.yml up -d
```

| Service    | Ports                          | Notes                        |
| ---------- | ------------------------------ | ---------------------------- |
| Postgres   | `5432`                         | User/db/password: `emailhub` |
| Redis      | `6379`                         | Password: `emailhub`         |
| ClickHouse | `8123` (HTTP), `9000` (native) |                              |
| Mailpit    | `1025` (SMTP), `8025` (UI)     | Local mail catcher           |

### App env

Copy and edit the app env (Drizzle reads this file only — not a root `.env`):

```bash
cp apps/email-hub/.env.example apps/email-hub/.env
```

Default local `DATABASE_URL`:

```text
postgresql://emailhub:emailhub@127.0.0.1:5432/emailhub
```

Then:

```bash
pnpm dev
```

## Database migrations (Postgres / Drizzle)

Schema changes ship only as Drizzle migrations under `packages/db`. Never edit a migration that is already merged — add a new one.

1. Change schema TypeScript under `packages/db/src/schema/`.
2. Ensure `apps/email-hub/.env` has the correct `DATABASE_URL` (must match any `DATABASE_URL` in the process environment).
3. From **`packages/db`** (required — paths are relative to that package):

   ```bash
   pnpm --filter @workspace/db db:generate
   pnpm --filter @workspace/db db:migrate
   ```

   Or `cd packages/db` then `pnpm db:generate` / `pnpm db:migrate`.

4. Commit the SQL under `packages/db/drizzle/`, snapshots under `packages/db/drizzle/meta/`, and schema sources together.
5. Migrations must stay backward compatible with the previous app version.

ClickHouse DDL uses its own ordered migration runner when that package path exists — same rule: never rewrite a shipped migration.

## Quick reference

| Item           | Format / rule                                               |
| -------------- | ----------------------------------------------------------- |
| Branch         | `feature/T-012-hmac-middleware`                             |
| Commit         | `feat(T-012): add HMAC verification middleware`             |
| PR into        | `dev` (tasks); `main` only for release / hotfix             |
| PR size        | under 400 lines (excl. lockfile / generated)                |
| SD in PR       | `SD reference: SD#12.7`                                     |
| Local services | `docker compose -f docker-compose.dev.yml up -d`            |
| Migrate        | `pnpm --filter @workspace/db db:generate` then `db:migrate` |

More index links: [docs/README.md](docs/README.md).
