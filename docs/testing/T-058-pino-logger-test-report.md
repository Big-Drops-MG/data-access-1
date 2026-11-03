# T-058 — Pino logger test report

Date: 2026-11-02

Branch: `feature/T-058-pino-logger-redaction-request-ids`

SD#15.2 was not in this repository. Notion was not readable in this session. Field names, the censor string, the email mask, and the request-id trust rule are therefore unverified against that document.

No production data was changed. No AWS email was sent.

The seven failures below were fixed after this run. Re-running those files passed 21 tests: URL userinfo with an empty username is redacted, the auth sink test reads the Pino line, the ready route tests pass a `Request`, and the database and worker timeouts were raised. Mailpit delivery remains skipped when Mailpit is not running. The Next.js production build failure and the unverified SD#15.2 field list were not changed by that fix.

The isolated Redis container `t058-redis-test` (host port 6399) was stopped after the worker tests. It was not removed.

## Result counts

`pnpm test` (Vitest 3.2.7, unit projects only, `*.int.test.ts` excluded) started at 22:10:24 local time and exited 1 after 238.87s.

|                |                               Count |
| -------------- | ----------------------------------: |
| Tests executed |                                 541 |
| Passed         |                                 533 |
| Failed         |                                   7 |
| Skipped        |                                   1 |
| Test files     | 96 (90 passed, 5 failed, 1 skipped) |

The seven failures:

| Test                                                                           | Result on that run                                                                                 | Later isolated re-run                                                      |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `packages/logger/src/logger.test.ts` serializes errors and scrubs URL userinfo | FAIL. Cause message still contains `synthetic-redis-password`.                                     | Not re-run. Same assertion failed on the earlier logger-only run.          |
| `apps/email-hub/src/lib/auth/auth-events.test.ts` default sink                 | FAIL. `console.warn` was not called.                                                               | Not re-run. The default sink is Pino.                                      |
| `apps/email-hub/src/app/api/ready/route.test.ts` (3 tests)                     | FAIL. `request` is undefined, so `request.headers` throws.                                         | Not re-run. `tsc` reports the same call sites as TS2554.                   |
| `apps/worker/src/request-id.redis.test.ts`                                     | FAIL. Timed out at 15s with empty worker output while Next and Turbo were also running.            | PASS in 7620ms when run alone. An earlier alone run also passed in 3745ms. |
| `packages/db/src/index.test.ts` import without a database                      | FAIL. Timed out at 15s under the same load. The test itself took 4303ms when run alone and passed. | PASS                                                                       |

Skipped: `packages/emails/src/mailpit-delivery.test.ts`. `describe.skipIf` skipped it because Mailpit was not reachable at `http://127.0.0.1:8025` and `SMTP_HOST` was unset. This is BLOCKED, not a pass.

`pnpm test:int` was not run. Those tests can write to the database named by the local env, so they stayed blocked.

## Acceptance criteria

| Criterion                                           | Status  |
| --------------------------------------------------- | ------- |
| 1. Shared Pino logger for web and worker            | PASS    |
| 2. Logging fields follow SD#15.2                    | BLOCKED |
| 3. Sensitive-data redaction paths                   | FAIL    |
| 4. maskEmail for email addresses                    | PASS    |
| 5. X-Request-Id on every applicable HTTP response   | PASS    |
| 6. request_id propagated into background job data   | PASS    |
| 7. Consistent request_id across API and worker logs | BLOCKED |

Not production ready. The Next.js production build does not complete, one redaction path leaks a password, and SD#15.2 was never checked.

## Phase 1 — implementation vs criteria

Present:

- `packages/logger` (`createLogger`, redaction, `maskEmail`, `resolveRequestId`, `AsyncLocalStorage` context).
- Web: `apps/email-hub/src/proxy.ts`, `instrumentation.ts`, `with-api-request.ts`, `api-response.ts`, route wrappers.
- Worker: `apps/worker/src/index.ts`.
- Queue: `packages/shared/src/send-email-queue.ts`, `trigger-email.ts`. `SendEmailJobData` is `{ message_id: string, request_id?: string }`.
- T-042 mail transport logs through `loggedSend` in `packages/emails/src/mail-transport.ts`.

Missing on this branch:

- T-046 send processor (`apps/worker/src/send-email.ts` is absent). The worker logs `send_email.processor_unavailable` and still completes the job.
- T-054 renderer (`packages/emails/src/render-email.ts` is absent).
- No HTTP route calls `triggerEmail`, so an API request never creates a send job on this branch.
- SD#15.2 text.

Provisional log fields in code: `request_id`, `service`, `environment`, `event`, `workspace_id`, `user_id`, `job_id`, `message_id`, `duration_ms`, `error_code`, plus existing `auth.*` event names. Services are `emailhub-web` and `emailhub-worker`.

## Phase 2 — Pino logger

`packages/logger/src/logger.test.ts`: 12 passed, 1 failed. Captured JSON (secrets below are synthetic):

```json
{
  "level": "info",
  "time": "2026-11-02T16:37:03.423Z",
  "service": "emailhub-test-387486fa-b480-450f-b09a-0dd9d0daa005",
  "environment": "dev",
  "event": "logger.ready",
  "campaign_id": "camp-1",
  "msg": "Logger ready"
}
```

```json
{
  "level": "error",
  "time": "2026-11-02T16:37:03.459Z",
  "service": "emailhub-level-29367476-9d54-413d-af8f-4b1bff4dde5c",
  "environment": "dev",
  "request_id": "req-child",
  "event": "failed",
  "error_code": "internal",
  "msg": "emitted"
}
```

Checked and passed: one cached logger per service, JSON output, level filtering (`info` dropped when `LOG_LEVEL=error`), child `request_id`, service and environment metadata, ISO `time`, production stack omitted, `LOG_FORMAT=pretty` forced back to JSON when `EMAILHUB_ENV=prod`.

Failed: structured error serialization. See Phase 3.

## Phase 3 — redaction

Configured paths were censored to `[REDACTED]` in one captured line. Safe fields stayed readable: `campaign_id` `camp-safe`, `user.name` `safe-name`, header `x-request-id` `req-safe`, event `security.check`.

Censored in that line: `password`, `confirmPassword`, `accessToken`, `refreshToken`, `cookie`, `smtpPassword`, `DATABASE_URL`, `AWS_SECRET_ACCESS_KEY`, `html`, `text`, `unsubscribeToken`, nested `user.password`, `user.headers.authorization`, `nested.refresh_token`, `nested.apiSecret`.

`postgresql://emailhub_app:synthetic-db-password@...` inside an `Error.message` was scrubbed to `postgresql://[REDACTED]@...`. The extra `error.password` property was not copied. `error_code` `ECONNREFUSED` was kept.

FAIL: `packages/logger/src/errors.ts` `CREDENTIAL_URL` requires a non-empty username (`[^/\s:@]+`). This cause was logged intact:

```text
redis://:synthetic-redis-password@127.0.0.1:6379
```

Recommended fix: allow an empty username in that expression (`[^/\s:@]*`) and keep this assertion. Do not log URL userinfo in new messages either.

Free-text is not scrubbed. The suite asserts this leak so it is visible. Captured line:

```json
{
  "level": "info",
  "time": "2026-11-02T16:37:03.572Z",
  "service": "emailhub-freetext-7ec30629-d475-4bb6-84a9-54276d79149e",
  "environment": "dev",
  "event": "note",
  "detail": "postgresql://app:synthetic-note-password@db/app",
  "msg": "leaked synthetic-message-secret"
}
```

`detail` is not a redaction path, and the message string is not scanned. Callers can still leak secrets that way.

## Phase 4 — maskEmail

Logger `maskEmail` (`packages/logger/src/mask-email.ts`), all passed:

| Input                                    | Output             |
| ---------------------------------------- | ------------------ |
| `alexanderson@example.com`               | `a***@example.com` |
| `a@example.com`                          | `a***@example.com` |
| `ab@example.com`                         | `a***@example.com` |
| `""` and whitespace                      | `""`               |
| `not-an-email`, `@example.com`, `local@` | `[invalid-email]`  |
| `álex@example.com`                       | `á***@example.com` |

The original local part was absent from each result.

`@workspace/shared` `maskEmail` is a different function (audit and API display). It was not changed by these tests.

Sending address is unchanged. `packages/emails/src/mail-transport-log.test.ts` used a mock SMTP sender. The message was sent to `alexanderson@example.com`. The log recipient was `a***@example.com`. The log did not contain `alexanderson`, `sender-domain.test`, `synthetic-html-body`, `synthetic-text-body`, or `synthetic-unsub-token`.

Existing `mail-transport.test.ts` (4 tests) passed. Its captured lines used `r***@example.com`, not the full recipient.

## Phase 5 — X-Request-Id

Live app: `next dev` 16.4.2 at `http://127.0.0.1:3458`, then stopped. Curl response headers:

| Request                                                  | Status | `x-request-id`                                            |
| -------------------------------------------------------- | ------ | --------------------------------------------------------- |
| `GET /api/health` with no header                         | 200    | `227954b6-211d-4358-978b-38e88d953645`                    |
| `GET /api/health` with `req-live-1`                      | 200    | `req-live-1`                                              |
| `GET /api/health` with `bad id`                          | 200    | `61e4f2e7-38b8-481c-bb0b-c128efceed9a`                    |
| `GET /api/health` with a 201-character id                | 200    | `675f1e0f-bdc2-4a06-a347-9fd31eb68379`                    |
| `GET /api/domains` with no session                       | 401    | `25a499a0-58b2-4fe2-846e-6c438bfa5fee`                    |
| `POST /api/domains` invalid JSON body, id `req-live-422` | 401    | `req-live-422`                                            |
| `GET /api/templates` id `req-live-templates`             | 401    | `req-live-templates`                                      |
| `GET /api/ready` id `req-live-ready`                     | 503    | `req-live-ready`                                          |
| Four concurrent health calls                             | 200    | `req-live-c1` through `req-live-c4`, each kept its own id |

The same ids appeared on the server `http.request` lines (`service` `emailhub-web`). The invalid and oversized ids were replaced. Query strings were not in those lines.

The unauthenticated POST never reached validation, so the live server did not show a 422. Real handler tests did:

- `apps/email-hub/src/app/api/domains/route.test.ts` (6 passed): 401 `req-401`, 403 `req-403`, 422 `req-422`, 201 `req-1`, 500 `req-500`. The 500 body did not contain `synthetic database failure`.
- `with-api-request.test.ts` (4 passed): generated id, preserved id, 422, 500, and concurrent ids `req-a` / `req-b`.
- `proxy.test.ts` (3 passed): missing id becomes a UUID, valid id kept, invalid and oversized replaced. `x-pathname` is set on `/dashboard` and not on `/api/health`.
- Admin 2FA reset route tests (5 passed) logged 401, 403, 400, and 200 with distinct request ids.

`/api/ready` unit tests do not pass a `Request`. Live `GET /api/ready` did return `X-Request-Id`.

## Phase 6 — request context

Passed in `logger.test.ts`:

- After `await`, `req-a` and `req-b` stayed on their own concurrent contexts.
- Outside a context, `getRequestId()` is `undefined` and `getContextLogger()` still returns a logger.
- Child logger kept `request_id` `req-child`.
- `packages/logger/src/request-id.ts` does not import `node:` or `pino`. The proxy imports `@workspace/logger/request-id` only.

Live logs show the id from `proxy.ts` on the later Node `http.request` line. Async local storage does not run inside the Edge proxy. Handlers read the header the proxy set and then enter context. That handoff worked for the health, domains, templates, and ready requests above.

## Phase 7 — queue propagation

Redis: `redis:7` container `t058-redis-test`, `127.0.0.1:6399`, BullMQ prefix `bd`, queue `send-email`. Worker process was `apps/worker` dist with `MAIL_TRANSPORT=smtp` pointed at localhost. No mail was sent. The processor is still the stub.

Captured worker lines from the passing isolated run:

```json
{"level":"info","time":"2026-11-02T16:46:42.886Z","service":"emailhub-worker","environment":"dev","request_id":"req-aaa","job_id":"msg-a","message_id":"msg-a","event":"job.started","queue":"send-email","attempt":1,"msg":"Job started"}
{"level":"info","time":"2026-11-02T16:46:42.971Z","service":"emailhub-worker","environment":"dev","request_id":"req-bbb","job_id":"msg-b","message_id":"msg-b","event":"job.started","queue":"send-email","attempt":1,"msg":"Job started"}
{"level":"info","time":"2026-11-02T16:46:43.093Z","service":"emailhub-worker","environment":"dev","request_id":"req-delayed","job_id":"msg-delayed","message_id":"msg-delayed","event":"job.started","queue":"send-email","attempt":1,"msg":"Job started"}
```

| Check                                                        | Status                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Job data contains `request_id`                               | PASS. `send-email-request-id.test.ts` (4 passed) plus `queue.getJob("msg-a").data.request_id === "req-aaa"`.                                                                                                                                     |
| Worker logs the same id                                      | PASS for `req-aaa`, `req-bbb`, and `req-delayed`.                                                                                                                                                                                                |
| Concurrent jobs do not mix ids                               | PASS.                                                                                                                                                                                                                                            |
| Legacy job with no `request_id`                              | PASS. The test required a generated string, different from the other ids, and the same value stored back on the job. The generated value was not printed.                                                                                        |
| Delayed job                                                  | PASS (`req-delayed`, delay 200ms). There is no cron scheduler on this branch.                                                                                                                                                                    |
| Retries keep `request_id`                                    | BLOCKED. `processJob` never throws, so BullMQ did not retry and `job.retry` was not logged. `correlationIdFor` in `apps/worker/src/index.ts` does call `job.updateData` when the id is missing. That path was not executed for a failed attempt. |
| API request creates the job and the worker logs that same id | BLOCKED. No route calls `triggerEmail`. Enqueue and the worker were proven separately.                                                                                                                                                           |

`trigger-email.test.ts` (24 passed) and `send-email-queue.test.ts` (3 passed). A captured queue-failure line masked the recipient as `j***@example.com` and did not print a full address.

## Phase 8 — security

Logged through the real logger. Findings:

1. FAIL. Empty-username Redis URL password survives `serializeError`. Location: `packages/logger/src/errors.ts` lines 3–10. See Phase 3.
2. Unlisted fields and the log message are not redacted. Captured `detail` and `msg` contained `synthetic-note-password` and `synthetic-message-secret`.
3. Configured secret fields, including nested headers, were `[REDACTED]`.
4. Mail transport logs did not contain HTML, text, or the unsubscribe token. The SMTP mock still received the real recipient.
5. Worker `job.started` lines contained ids only. They did not contain the job payload, HTML, or merge data.
6. Live `http.request` lines contained method, path, status, and `duration_ms`. They did not contain the POST body.
7. `readJobCorrelation` returns `requestId`, `messageId`, and `workspaceId` only. A `password` field on the job object was not copied. Unit test passed.
8. `GET /api/ready` 503 and domains 500 responses did not echo connection strings or the synthetic error text in the HTTP body under test.

No log line from these runs contained an authorization bearer value, a cookie value, or an AWS secret that had been placed on a configured redaction path.

## Phase 9 — regression, types, lint, build

Unit tests: see the counts above.

Passed groups that this task touches:

- Web routes: health, domains, templates, template publish, template versions, SES webhook, admin 2FA reset.
- Auth unit tests other than the default-sink test: `auth.test.ts` (8), `auth-gates.test.ts` (8), machine auth, session policy, two-factor policy, hooks, lockout, enrollment, trust device.
- Worker `queues.test.ts` (2).
- T-042: `mail-transport.test.ts` (4) and `mail-transport-log.test.ts` (1). Mailpit delivery skipped.
- T-046: BLOCKED. `apps/worker/src/send-email.ts` is not on this branch.
- T-054: BLOCKED. `packages/emails/src/render-email.ts` is not on this branch.
- Integration tests: BLOCKED. Not executed.

Typecheck: `pnpm exec turbo run typecheck` exited 2. Ten tasks succeeded. `@workspace/email-hub` failed:

```text
src/app/api/ready/route.test.ts(21,28): error TS2554: Expected 1 arguments, but got 0.
src/app/api/ready/route.test.ts(30,28): error TS2554: Expected 1 arguments, but got 0.
src/app/api/ready/route.test.ts(49,28): error TS2554: Expected 1 arguments, but got 0.
```

`withApiRequest` types `GET` as requiring a `Request`. These three calls pass none.

Lint:

- `packages/logger`: FAIL. `packages/logger/src/mask-email.ts:18` `no-control-regex` (`\x00`, `\x1f`). `pnpm exec turbo run lint typecheck` exited 1 on this and cancelled the rest of that run.
- After that, `turbo run lint` for `@workspace/email-hub`, `@workspace/worker`, `@workspace/shared`, and `@workspace/emails` exited 0 (8 tasks successful). A debug `console.info` in the Redis test and an `import()` type in the mail log test were removed before this passing run. Those two lint failures were in the new tests, not in the logger runtime.

Builds:

| Command                                                   | Exit |
| --------------------------------------------------------- | ---- |
| `pnpm --filter @workspace/logger build` (`tsc`)           | 0    |
| `pnpm --filter @workspace/shared build` (`tsc`)           | 0    |
| `pnpm --filter @workspace/worker build` (`tsc`)           | 0    |
| `pnpm --filter @workspace/email-hub build` (`next build`) | 1    |

Next build panic while writing the `/page` endpoint:

```text
Failed to write app endpoint /page
the chunking context (unknown) does not support external modules (request: node:async_hooks)
```

Cause: `packages/logger/src/request-context.ts` imports `node:async_hooks`. `packages/shared/src/trigger-email.ts` and `send-email-queue.ts` import `@workspace/logger`. `packages/shared/src/index.ts` re-exports both. Client components import that barrel, including `apps/email-hub/src/components/app/app-top-bar-clock.tsx`, `et-datetime-picker.tsx`, and `apps/email-hub/src/components/auth/onboarding-view.tsx`. `apps/email-hub/next.config.ts` also lists `@workspace/logger` in `transpilePackages`, so Turbopack tries to bundle it into the browser graph.

Recommended fix: keep logger, `trigger-email`, and `send-email-queue` off the client module graph. Stop re-exporting those two modules from the shared entry that client files import, or move them to a server-only export. Add `import "server-only"` on `request-context.ts` and the queue modules. Leave `@workspace/logger/request-id` free of Pino and `async_hooks`, which it already is.

## Remaining defects

1. Production `next build` fails. Browser bundle reaches `node:async_hooks`. Locations above.
2. `serializeError` leaks `scheme://:password@host`. `packages/logger/src/errors.ts`.
3. Path redaction does not cover free-text messages or unlisted keys such as `detail`.
4. `apps/email-hub/src/lib/auth/auth-events.test.ts` still expects `console.warn` and `service: "web"`. Default sink in `auth-events.ts` writes Pino with `emailhub-web`. Recommended fix: assert the Pino line, not `console.warn`.
5. `apps/email-hub/src/app/api/ready/route.test.ts` calls `GET()` with no request. Recommended fix: pass `new Request("http://localhost/api/ready")`. Live Next already supplies the request, and that response carried `X-Request-Id`.
6. `packages/logger/src/mask-email.ts:18` fails `no-control-regex`.
7. Worker retry preservation and a single API-to-worker request id were not observed.
8. SD#15.2 was not available to compare.

## PR readiness

Not ready to merge.

Blockers: the Next production build, the URL-password leak, the logger lint error, and the email-hub typecheck errors. SD#15.2 compliance, job retries, the joined API-to-worker path, T-046, T-054, Mailpit, and the integration suite remain blocked.
