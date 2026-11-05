# T-069 — Publish rules and test send

Status: IMPLEMENTED

Publish refuses a template version that cannot render, and refuses a non-transactional category when the body does not contain live unsubscribe and postal-address merge tags. `POST /api/templates/{id}/test-send` queues a message through the existing `triggerEmail` path to the signed-in user's email with `environment` `test`.

This repository has no workspace or tenant column. Staff session role checks are the authorization boundary. There is no separate test-mail transport.

## Publish validation

`validateTemplateForPublishing` in `apps/email-hub/src/lib/templates/publish-validation.ts` is the only publish check. `publishTemplateVersion` calls it inside the publish transaction. `updateTemplate` calls it when a patch would leave the template `active` and either the status is becoming `active` or `category_id` is changing. A name-only patch does not re-render.

The check loads the version row being published and that version's `subject` and `body_source`. Template versions are insert-only, so the source that rendered is the source that is stored. The template row is locked with `SELECT ... FOR UPDATE` on publish. A concurrent category change waits, then the validator runs against the locked category. If validation throws, the transaction rolls back: `current_version_id` and `status` stay as they were.

Archived templates still cannot be published.

## Rendering

Validation calls `renderEmailTemplate` from `@workspace/emails/render` (T-054). That function compiles the source with the existing compiler and renders HTML and text in the existing worker thread. The API process does not evaluate template source as JavaScript and does not add another renderer.

There is no stored sample-merge payload. Validation supplies a placeholder for every `{{tag}}` in the subject and body:

- ordinary tags: `https://example.com/publish-check/value` (valid in text and in `href` / `src`)
- `unsubscribe_url`: `https://example.com/publish-check/unsubscribe`
- `postal_address`: `Publish Check Postal Address`

The renderer footer receives different values (`https://example.com/publish-check/footer` and `Publish Check Footer Address`) so a footer injected by the renderer is not treated as a template tag. No email is sent. A successful check means this placeholder payload rendered. It does not mean every future merge payload will render.

`TemplateRenderError` becomes `422` `validation_failed`. Timeout uses detail message `TEMPLATE_RENDER_TIMEOUT`. Every other render failure uses `TEMPLATE_RENDER_FAILED`. The response does not include the renderer message or the template source.

## Categories

`email_category.kind` is `transactional` or `relationship`.

| Kind            | Render must succeed | Unsubscribe and postal tags |
| --------------- | ------------------- | --------------------------- |
| `transactional` | yes                 | not required                |
| `relationship`  | yes                 | both required               |
| any other kind  | yes                 | both required               |

`thank_you` and `feedback_request` are transactional for send-check skips (`isTransactionalEmailType`). That classification does not exempt a template from publish tag rules. The category kind does.

A missing category row is `422` with path `category_id`. Callers cannot send a free-text category; the template stores `category_id`.

## Compliance tags

The only merge-tag syntax in the repo is `{{name}}` with name `[A-Za-z_][A-Za-z0-9_]*`. There is no unsubscribe or postal component. The names used here are the existing `unsubscribe_url` redaction key and the `sender.postal_address` column:

- `{{unsubscribe_url}}`
- `{{postal_address}}`

A tag counts only when `extractMergeTagNames` finds it in `body_source` and the rendered HTML and plain text both contain that tag's publish-check sentinel. A tag that appears only in the subject, in a comment, or in source the compiler drops is rejected. The literal words "unsubscribe" and "address" are not accepted.

| Condition                                | Detail `message`                      |
| ---------------------------------------- | ------------------------------------- |
| Unsubscribe tag absent from the body     | `TEMPLATE_UNSUBSCRIBE_TAG_MISSING`    |
| Unsubscribe tag not in the rendered body | `TEMPLATE_UNSUBSCRIBE_TAG_INVALID`    |
| Postal tag absent from the body          | `TEMPLATE_POSTAL_ADDRESS_TAG_MISSING` |
| Postal tag not in the rendered body      | `TEMPLATE_POSTAL_ADDRESS_TAG_INVALID` |

Both problems are returned together. `error.code` stays `validation_failed`.

The renderer still appends its own unsubscribe link and postal footer. In-body tags are additional. At send time the worker sets both merge values from the existing signed unsubscribe URL (`buildUnsubscribeUrl`) and `sender.postal_address`, replacing any caller-supplied value, then renders. Publish validation does not sign a production unsubscribe token.

If those tags are required and missing from `merge_data`, `triggerEmail` fills postal address from the route sender and stores `https://example.com/unsubscribe/pending` so the pre-queue check can pass. That placeholder is not a token. The worker replaces it before render. Templates that do not use the tags are unchanged.

## Publish endpoint

`POST /api/templates/{id}/publish`

Body: `{ "version_id": "<uuidv7>" }`

Operator+. Machine auth is rejected by `requireTemplatesStaffAccess`. The response is the existing template JSON. Status becomes `active` and `current_version_id` points at the validated version.

`PATCH /api/templates/{id}` cannot set `status` to `active` unless `current_version_id` is already set and that version passes the same validator for the resulting category. It does not move `current_version_id`.

## Test send

`POST /api/templates/{id}/test-send`

Operator+. Runtime is Node.js because publish validation and the queue client are server-only. `@workspace/emails` is in `serverExternalPackages` so the render worker file stays outside the Next bundle.

Body:

```json
{
  "version_id": "<uuidv7>",
  "offer_id": null,
  "idempotency_key": "optional",
  "merge_data": {}
}
```

`version_id` is required, so the server does not pick a draft or the published version on its own. Draft versions are allowed. Archived templates are `409`. Unknown template or version is `404`.

The recipient is `session.email` from the staff session, checked with `emailSchema`. The body is strict, so `to`, `email`, `recipient`, and `environment` are rejected. `environment` is set in the server call as `"test"`. It is not read from `NODE_ENV`.

The template's `email_type` is passed to `triggerEmail`. Optional `offer_id` selects the offer route; omitted means the default route. The active route supplies the sender. `templateVersionId` tells `triggerEmail` to queue that version instead of the route's current version. Production callers omit it and keep the previous route behavior. There is no second queue producer: the handler uses `createEnqueueSendEmail(getSendEmailQueue())`.

Idempotency keys are stored as `test:{userId}:{client key or uuid}` so they do not collide with external API keys.

Response when the message is queued:

```json
{
  "message_id": "<uuidv7>",
  "status": "queued",
  "environment": "test"
}
```

`202` when the row was created, `200` when the idempotency key returned an existing queued row. The body does not say the message was delivered.

A skipped row (`no_route` or a send-check reason) is `409` `conflict`. The skipped row remains, which is existing `triggerEmail` behavior. `no_route` uses path `route`. Other skip reasons use path `send_check`. A missing active route is the sender-resolution failure: test-send does not invent a sender or activate a domain.

If Redis URL is missing, `getSendEmailQueue` returns `503` before `triggerEmail`. If enqueue fails after the row commits, `triggerEmail` leaves the row `queued` for the watchdog and the handler still returns `queued`.

## `environment=test`

`message.environment` is a Postgres enum `message_environment` (`production`, `test`), default `production`. Migration: `packages/db/drizzle/0012_message_environment.sql`. It was not applied as part of this task.

`triggerEmail` writes the value on queued and skipped inserts. Omitted input stays `production`, so external sends do not become tests. Test-send passes `"test"`. For `test`, the `send-email` job payload includes `environment`. The worker reads the column in `loadQueuedSend` and logs `message.send` with that value. `events.inserted` adds `environment` from the message row when events are enriched.

ClickHouse `email_events` has no message-environment column. `environment_daily` is client, device, and OS from the user agent. Those were not changed. The message classification is on the Postgres row, the send job, and the events log line.

Apply migration `0012` before deploying this code. Inserts and selects of `message.environment` fail until the column exists.

## Errors

Existing `AppError` codes and `{ error: { code, message, details } }` are unchanged. Publish and test-send specifics:

| Situation                                                                                        | HTTP | `error.code`        |
| ------------------------------------------------------------------------------------------------ | ---- | ------------------- |
| Unauthenticated                                                                                  | 401  | `unauthorized`      |
| Role too low, or machine caller on a staff route                                                 | 403  | `forbidden`         |
| Template or version missing                                                                      | 404  | `not_found`         |
| Archived template, skipped send, route missing                                                   | 409  | `conflict`          |
| Render failure, missing or invalid tags, bad merge data, missing user email, unknown JSON fields | 422  | `validation_failed` |
| Queue client not configured                                                                      | 503  | `unavailable`       |

Request ids stay on the `withApiRequest` / `handler` path.

## Logging

| Event                          | When                                                      |
| ------------------------------ | --------------------------------------------------------- |
| `template.publish_requested`   | Publish transaction started                               |
| `template.publish_blocked`     | Publish validation failed. `reason` is the detail message |
| `template.published`           | Pointer updated                                           |
| `template.test_send_requested` | Test-send accepted the session                            |
| `template.test_send_queued`    | `triggerEmail` returned `queued`                          |
| `message.queued`               | Includes `environment`                                    |
| `message.send`                 | Worker, persisted environment                             |
| `events.inserted`              | Includes message `environment` when the row has one       |

Fields used: `request_id`, `user_id`, `template_id`, `template_version_id`, `environment`, `reason`, and a masked `recipient` on test-send. There is no `workspace_id`. Logs do not include tokens, template source, merge data, or rendered bodies.

## Frontend

`/templates` is still `ModulePlaceholderPage`. No publish or test-send control exists, so no UI was added.

## Known limitations

- Migration `0012` must be applied before the new column is usable. It was not run here.
- ClickHouse events do not store message `environment`.
- The renderer footer is still appended even when the body contains the compliance tags.
- Queued `merge_data` may contain `https://example.com/unsubscribe/pending` until render replaces it. The rendered message uses the signed URL.
- Test-send needs an active route for the template email type and optional offer. It cannot choose a sender that has no route.
- A skipped test send still inserts the skipped `message` row.
- Enqueue failure after commit is reported as `queued`, matching `triggerEmail`.
- Publish placeholders do not prove every later merge payload.
- No tests were run for this task.
