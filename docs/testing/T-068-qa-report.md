# T-068 — Suppression API QA report

### 1. Task information

- Task: T-068 · Suppression API
- Branch: `feature/T-068-suppression-api`
- Date: 2026-11-05
- Base commit: `297e3d9` (`chore(T-002): merge main into dev for release (#146)`)
- Working tree: implementation, tests, and this report are uncommitted. Nothing was pushed.

### 2. Environment

- Node.js: v24.13.0
- pnpm: 11.25.0
- Vitest: 3.2.7
- ESLint: 10.13.0
- Database: loopback Postgres at `127.0.0.1:5433`. The configured application database name is `emailhub` (local Docker). Integration tests did not write to it. `pnpm test:int` clones a migrated template and points `DATABASE_URL` at a worker database whose name starts with `eh_w_`. The suppression integration file skips unless the host is loopback and the database name has that prefix. The file ran, so the clone was used.
- Application server: not started. No live HTTP session was created.

### 3. Test coverage

| Area                      | How it was checked                                                                                                                                 | Result  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| GET list                  | Route test with a mocked service, plus integration list, cursor, empty filter, and `include_removed`                                               | Pass    |
| Viewer email masking      | Route test: viewer payload masks `email`; operator payload does not. `email_hash` is not on the payload                                            | Pass    |
| Manual add                | Route test (201, session user id, normalised email) and integration insert                                                                         | Pass    |
| Optional offer            | Integration: global and offer rows both exist; unknown offer is 422                                                                                | Pass    |
| Reason validation         | Schema and route tests reject `hard_bounce`, missing email, invalid email, and extra fields                                                        | Pass    |
| Server-derived `added_by` | Route test asserts the session id. Schema rejects a body `added_by`. Integration duplicate keeps the original `added_by`                           | Pass    |
| Duplicate ignore          | Integration repeat and `Promise.all` concurrent inserts. One row. Original `created_at` and `added_by` stay                                        | Pass    |
| Recipient linking         | Integration links an existing recipient, including a padded mixed-case address. A missing recipient stays null and no recipient row is created     | Pass    |
| Admin-only removal        | Route test: viewer and operator 403, admin 200, missing id 404, invalid id 422. Integration soft-removes via `removed_at` and writes one audit row | Pass    |
| Hard-bounce protection    | Integration: manual add returns 409 and does not change the row. Admin remove returns 409 twice. `source`, `reason`, and `removed_at` stay         | Pass    |
| Auth                      | Null session 401. Machine `x-key-id` 401. Forged `role` in the body does not raise a viewer. Expired Better Auth cookies were not exercised        | Partial |
| Send checks               | Integration calls `runSendChecks` inside a transaction. No mail transport                                                                          | Pass    |
| Audit                     | Integration reads `audit_log`. Actor is the session user. Plaintext email is absent from the payload                                               | Pass    |

### 4. Execution results

| Command                                                                                                                                                 | Exit    | Passed                                                            | Failed                                 | Skipped |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------- | -------------------------------------- | ------- |
| `pnpm --filter @workspace/email-hub exec eslint src/app/api/suppressions src/lib/suppressions src/lib/permission-map.ts src/lib/permission-map.test.ts` | 0       | ESLint reported no findings                                       | 0                                      | 0       |
| `pnpm --filter @workspace/email-hub exec vitest run src/app/api/suppressions src/lib/suppressions/schemas.test.ts src/lib/permission-map.test.ts`       | 0       | 30 tests, 4 files                                                 | 0                                      | 0       |
| `pnpm exec vitest run --config vitest.int.config.ts apps/email-hub/src/lib/suppressions/service.int.test.ts`                                            | 0       | 8 tests, 1 file                                                   | 0                                      | 0       |
| `pnpm exec prettier --check` on the T-068 files                                                                                                         | 1       | —                                                                 | 6 files needed formatting              | —       |
| `pnpm exec prettier --write` on those files                                                                                                             | 0       | Formatting applied, then the Vitest commands above were run again | 0                                      | 0       |
| `pnpm --filter @workspace/email-hub typecheck` (`tsc --noEmit`)                                                                                         | 2       | —                                                                 | 2 errors in `.next/types/validator.ts` | —       |
| `pnpm --filter @workspace/email-hub build`                                                                                                              | not run | —                                                                 | —                                      | —       |
| Playwright                                                                                                                                              | not run | —                                                                 | —                                      | —       |
| Live HTTP against the app                                                                                                                               | not run | —                                                                 | —                                      | —       |

The typecheck errors are:

- `.next/types/validator.ts(92,39)`: cannot find `src/app/(app)/admin/queues/page.js`
- `.next/types/validator.ts(100,69)`: `__InvalidParamMatchingKeys`

`tsconfig.json` includes `.next/types/**/*.ts`. Those files are a stale Next cache. The queues page was moved on `dev` before this task. No error was reported in the suppression sources.

Vitest printed a sourcemap warning for `packages/shared/dist/e2e-runtime.js`. That file is leftover build output. It did not fail the tests.

Windows PowerShell recorded Vitest's check mark as `Γ£ô` in the saved logs. The pass counts in those files match the console.

### 5. Defects

1. Fixed before the green integration run. `addManualSuppression` looked up `recipient.email` with the raw string. A padded or mixed-case address hashed to the normalised recipient but left `recipient_id` null. The service now runs `normaliseEmail` before the lookup and the hash. The integration test covers `  EMAIL  `.
2. Not a product defect. `tsc --noEmit` fails on stale `.next/types`. Not changed.
3. Formatting. Prettier rewrote six T-068 files. Tests were re-run after that rewrite.

### 6. Screenshot evidence

No PNG files were created. Screenshot capture is not available here, and invented images would not be evidence.

Real logs:

- `docs/testing/evidence/T-068/unit-vitest.txt`
- `docs/testing/evidence/T-068/int-vitest.txt`
- `docs/testing/evidence/T-068/typecheck.txt`
- `docs/testing/evidence/T-068/screenshot-instructions.txt`

### 7. Untested scenarios

- Live `GET`/`POST` against a running Next server. The app would use the shared local `emailhub` database, so those writes were not made.
- A real Better Auth cookie, including an expired or tampered session. Tests use `getSession` returning null or a staff user.
- Playwright. The suppression UI is still a placeholder, and there is no signed-in browser session.
- `pnpm --filter @workspace/email-hub build`.
- A clean `tsc --noEmit` after the stale `.next/types` cache is removed. That cache was not deleted.
- The full monorepo Vitest suite.

### 8. Final QA verdict

`PARTIAL PASS — SOME CHECKS NOT EXECUTED`

The suppression acceptance checks passed on the isolated clone and in route tests: list, manual add, offer scope, duplicate ignore, recipient link, admin remove, and hard-bounce rejection. Typecheck did not pass, the app build and live HTTP checks were not run, and there are no screenshots.
