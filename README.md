# Email Hub

pnpm + Turborepo monorepo for the Email Hub platform (Node 24 LTS).

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
pnpm dev
```

## Tooling

- ESLint, Prettier, and commitlint live in `@workspace/config`
- Husky runs `lint-staged` on pre-commit and commitlint on commit-msg
- Commit format: `<type>(T-###): <summary>`
