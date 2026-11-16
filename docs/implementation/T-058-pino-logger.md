# T-058 — Pino logger with redaction and request IDs

Status: IMPLEMENTED — AWAITING TESTING

SD#15.2 was not in this repository. The Notion pages for this task were not readable because Notion authentication was skipped. Field names below are the provisional set from the task plus the auth events already marked as SD#15.2 in code (`user_id`, `request_id`, and the `auth.*` event names). They are not a verified transcription of SD#15.2.

## Architecture

`@workspace/logger` is the only Pino configuration. Web and worker call `createLogger({ service })`. The factory caches one logger per service name. Child loggers add `request_id`, and for jobs also `job_id`, `message_id`, and `workspace_id` when those values exist.

| Service value     | Process       |
| ----------------- | ------------- |
| `emailhub-web`    | Next.js app   |
| `emailhub-worker` | BullMQ worker |

Every log line includes `service` and `environment` (`EMAILHUB_ENV`, otherwise `NODE_ENV`). Pino adds `time` (ISO) and `level` (label). Those are not duplicated in application fields.

The Edge proxy imports `@workspace/logger/request-id` only. That module does not import Pino or `AsyncLocalStorage`.

## Package layout

```text
packages/logger/src/
  index.ts
  logger.ts
  redaction.ts
  mask-email.ts
  request-id.ts
  request-context.ts
  errors.ts
  types.ts
```

Public entry: `@workspace/logger`. Edge-safe entry: `@workspace/logger/request-id`.

## API

```ts
import { createLogger } from "@workspace/logger"

const logger = createLogger({ service: "emailhub-web" })

logger.info(
  {
    event: "template.created",
    template_id: templateId,
    user_id: userId,
  },
  "Template created"
)
```

Request scope:

```ts
import {
  getContextLogger,
  getRequestId,
  runWithRequestContext,
} from "@workspace/logger"

runWithRequestContext(requestId, () => {
  getContextLogger().info(
    { event: "message.queued", message_id: messageId },
    "Message queued"
  )
  getRequestId()
})
```

Outside a context, `getContextLogger()` uses the process fallback set from web instrumentation or the worker entrypoint. If nothing set a fallback, it uses the web logger.

## Provisional fields

Used when present:

- `request_id`
- `service`
- `environment`
- `event`
- `workspace_id`
- `user_id`
- `job_id`
- `message_id`
- `duration_ms`
- `error_code`

Auth events already in the app, kept as the event name: `auth.login`, `auth.login_failed`, `auth.2fa_failed`, `auth.lockout`, `auth.lockout_admin_required`, `auth.2fa_enrolled`, `auth.2fa_reset`.

## Redaction

Censor value: `[REDACTED]`.

Pino redacts configured paths up to four levels deep, including header paths. Covered names include password, confirmPassword, authorization, cookie, set-cookie, access and refresh tokens, session tokens, API keys and secrets, AWS access keys, database and cache URLs, SMTP passwords and FBL webhook secrets, Better Auth and Google client secrets, app encryption key, unsubscribe token and URL, webhook secret, `secret`, `token`, private keys, connection strings, and email `html` / `text`.

`serializeError` does not copy arbitrary error properties. It keeps `name`, a URL-scrubbed `message`, a short string or number `code`, and a scrubbed stack outside production. Stacks are omitted when `EMAILHUB_ENV=prod` or `NODE_ENV=production`. URL userinfo (`scheme://user:password@host`) is replaced with `scheme://[REDACTED]@host`.

This does not scan free-text for every possible secret. Callers must not log raw HTTP bodies, full queue payloads, or auth objects.

## maskEmail

Logger helper, separate from `@workspace/shared` `maskEmail` (that one keeps two local characters for audit and API display).

| Input                      | Output             |
| -------------------------- | ------------------ |
| `alexanderson@example.com` | `a***@example.com` |
| `a@example.com`            | `a***@example.com` |
| `""`                       | `""`               |
| malformed                  | `[invalid-email]`  |

The first Unicode code point of the local part is kept. The original address is not returned. Sending still uses the real recipient.

## Request IDs

`resolveRequestId` keeps an incoming `X-Request-Id` only when it is 1–128 characters and matches `^[A-Za-z0-9][A-Za-z0-9._-]*$`. Otherwise it uses `crypto.randomUUID()`. Assumption until SD#15.2 is available: a value that passes that check is accepted.

`apps/email-hub/src/proxy.ts` runs for pages and `/api/*` (static assets and dotted paths stay excluded). It sets `X-Request-Id` on the forwarded request and on the response. `x-pathname` is still set only for non-API paths.

`observeApiRequest` / `withApiRequest` repeat the header on the handler response, store `request_id` in `AsyncLocalStorage`, and log one `http.request` line with method, pathname, status, and `duration_ms`. Query strings are not logged. Thrown errors are logged once as `http.unhandled_error` and rethrown. `onRequestError` logs the same event only if that error was not already logged.

JSON helpers `jsonAppError`, `toErrorResponse`, and `jsonForRole` set `X-Request-Id` when a request context exists. Unexpected non-`AppError` values are logged in `toErrorResponse` and still returned as a generic internal error, without a stack in the response body.

## Queue `request_id`

`SendEmailJobData` is `{ message_id: string, request_id?: string }`. `enqueueSendEmailJob` adds `request_id` only when the argument or the active request context is a valid id. Omitted for older callers, so existing jobs stay `{ message_id }`. BullMQ `jobId` remains `message_id`. `request_id` is not the BullMQ job id.

`triggerEmail` accepts optional `requestId` and passes a valid id into `enqueueSendEmail`. There is no HTTP route on this branch that calls `triggerEmail`.

The worker, for a job with no valid `request_id`, generates one and tries `job.updateData` so retries keep it. If the payload is not a plain object, or the update fails, that attempt still logs the generated id.

## Worker

`apps/worker/src/index.ts` logs `worker.ready`, `worker.shutting_down`, `worker.boot_failed`, `job.started`, `job.retry` when `attemptsMade > 0`, `job.completed`, and `job.failed`. Child bindings include `request_id` and `job_id`, plus `message_id` or `workspace_id` when present. The full job payload is not logged.

The send-email processor from T-046 is not in this branch. The worker still completes those jobs the way the previous stub did, and logs `send_email.processor_unavailable`. It does not render, check suppression, or send mail.

T-042 `loggedSend` in `packages/emails` logs `mail.transport.called`, `mail.transport.accepted`, and `mail.transport.rejected` with a masked recipient and provider message id. It does not log subject, bodies, or the unsubscribe URL. Inside a worker or request context those lines share `request_id`.

T-054 render code is not on this branch, so render start/complete events are not emitted.

## Environment

| Variable     | Default | Notes                                                                                                                    |
| ------------ | ------- | ------------------------------------------------------------------------------------------------------------------------ |
| `LOG_LEVEL`  | `info`  | `fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`. Invalid values fall back to `info`.                        |
| `LOG_FORMAT` | `json`  | `pretty` is a single-line readable stdout format. Forced back to JSON when `EMAILHUB_ENV=prod` or `NODE_ENV=production`. |

No external log shipping was added.

## Safe logging

- Log ids, statuses, durations, and masked recipients.
- Do not log passwords, tokens, cookies, raw bodies, rendered HTML, or connection strings.
- Do not put secrets on thrown `Error` messages; the serializer only scrubs URL userinfo and known redaction paths.

## Known limits

- SD#15.2 field list, censor text, email mask, and request-id trust rules are unverified.
- Path redaction does not clean secrets embedded in unrelated strings, other than URL userinfo in serialized errors.
- `AsyncLocalStorage` does not cross the Edge proxy. Handlers read the request header the proxy set, then enter ALS.
- T-046 and T-054 are absent here, so suppression, render, and provider acceptance are not logged from a real send pipeline.
- `apps/email-hub/src/lib/auth/auth-events.test.ts` still expects the temporary `console.warn` sink and `service: "web"`. The default sink is now Pino with `service: "emailhub-web"`. That test needs an update in the testing task.
- `@workspace/logger` follows the repo layout (`dist` at runtime). Build that package before starting web or worker. This implementation pass did not run the build.
