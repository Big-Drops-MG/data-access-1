# Email Hub

pnpm + Turborepo monorepo for the Email Hub platform (Node 24 LTS).

**Contributing / dev handbook:** [CONTRIBUTING.md](CONTRIBUTING.md) (branching, commits, PRs, local stack, migrations). Doc index: [docs/README.md](docs/README.md).

## Workspace layout

| Path              | Contents                                      |
| ----------------- | --------------------------------------------- |
| `apps/email-hub`  | Next.js 16 app (App Router)                   |
| `apps/worker`     | BullMQ workers and schedulers                 |
| `packages/db`     | Drizzle schema, migrations, ClickHouse client |
| `packages/shared` | Shared Zod schemas, helpers                   |
| `packages/emails` | react-email templates                         |
| `packages/config` | Shared tsconfig, ESLint, Prettier, commitlint |
| `packages/ui`     | Shared UI kit (shadcn/ui)                     |

## Prerequisites

- Node.js 24 LTS
- pnpm 11+

## Commands

```bash
pnpm install
pnpm build
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:int
pnpm dev
```

## Testing (SD#16.1)

| Kind        | Files               | Command              |
| ----------- | ------------------- | -------------------- |
| Unit        | `*.test.ts`         | `pnpm test`          |
| Integration | `*.int.test.ts`     | `pnpm test:int`      |
| Coverage    | report + thresholds | `pnpm test:coverage` |

Coverage thresholds: `@workspace/shared` 90%, `apps/worker` 80%, `apps/email-hub` server (`src/lib` + `src/app/api`) 80%. Unit runs never pick up `*.int.test.ts`. Integration tests migrate one Postgres template and give each Vitest worker a copy of that database. `pnpm test:int:workers` runs that copy on two workers at once.

## Tooling

- ESLint, Prettier, and commitlint live in `@workspace/config`
- Husky runs `lint-staged` on pre-commit and commitlint on commit-msg
- Commit format: `<type>(T-###): <summary>`
- Vitest projects live in each package/app; root `vitest.config.ts` owns coverage
