# T-072 — Sends API and state machine

Status: IMPLEMENTED — AWAITING TESTING

Staff CRUD, schedule, and cancel for the existing `send` table. SD#9.5 was not available. The lifecycle below is the `send_status` enum already in this repository, plus `draft`, which the enum did not have. There is no workspace or tenant column on sends, templates, senders, categories, or offers. Isolation is the staff session and the role map. The body cannot set an actor or a workspace.

This API does not dispatch mail. Nothing in the repository reads `send.status = 'scheduled'` and enqueues a campaign job. Cancel therefore only persists `cancelled`. A later dispatcher must treat any status other than `scheduled` as ineligible before it starts work.

## Endpoints

| Method   | Path                       | Role      |
| -------- | -------------------------- | --------- |
| `GET`    | `/api/sends`               | Viewer+   |
| `POST`   | `/api/sends`               | Operator+ |
| `GET`    | `/api/sends/{id}`          | Viewer+   |
| `PATCH`  | `/api/sends/{id}`          | Operator+ |
| `DELETE` | `/api/sends/{id}?version=` | Operator+ |
| `POST`   | `/api/sends/{id}/schedule` | Operator+ |
| `POST`   | `/api/sends/{id}/cancel`   | Operator+ |

Machine-auth headers are rejected. `{id}` is the send UUID v7.

## Request schemas

Create body. `email_type` is not accepted. It is copied from the template that owns `template_version_id`.

```json
{
  "template_version_id": "<uuidv7>",
  "sender_id": "<uuidv7>",
  "category_id": "<uuidv7>",
  "offer_id": null,
  "scheduled_for": "2026-11-05T18:00:00.000Z"
}
```

`offer_id` may be omitted or `null`. `scheduled_for` is ISO-8601 UTC with a `Z` suffix, the same rule as `isoUtcTimestampSchema`. The column stays `NOT NULL`, so a draft must store a time. The five-minute lead time is not applied on create or patch.

Patch body requires `version` (positive integer) and at least one of `template_version_id`, `sender_id`, `category_id`, `offer_id`, or `scheduled_for`. Omitted fields keep their stored values. `offer_id: null` clears the offer. `status` is not patchable.

Schedule and cancel bodies:

```json
{ "version": 1 }
```

Delete takes `version` as a query parameter, not a body.

## Response schema

Create returns `201`. Every other success returns `200`. List shape is `{ "data": [], "next_cursor": null }` with `limit` (default 50, max 200) and optional `cursor`, `status`, `email_type`, `offer_id`, `sender_id`, `category_id`, and `template_version_id`. Cursor paging matches email routes: UUID v7, descending id, exclusive cursor.

```json
{
  "id": "<uuidv7>",
  "email_type": "thank_you",
  "template_version_id": "<uuidv7>",
  "sender_id": "<uuidv7>",
  "category_id": "<uuidv7>",
  "offer_id": null,
  "scheduled_for": "2026-11-05T18:00:00.000Z",
  "status": "draft",
  "dispatch_started_at": null,
  "completed_at": null,
  "version": 1,
  "created_by": "<uuidv7>",
  "created_at": "2026-11-05T12:00:00.000Z",
  "updated_at": "2026-11-05T12:00:00.000Z"
}
```

`email_type` is `thank_you`, `feedback_request`, or `engagement`.

## Data model

`send` already stored `template_version_id`, `sender_id`, optional `offer_id`, `scheduled_for`, `status`, `version`, `dispatch_started_at`, `completed_at`, and `created_by`.

Migration `packages/db/drizzle/0012_send_draft_and_category.sql` (not executed by this task):

- Adds enum value `draft` before `scheduled`.
- Adds `category_id` (not null, FK to `email_category`, `ON DELETE RESTRICT`) and index `send_category_id_idx`.
- Backfills `category_id` from the template that owns `template_version_id`.

Existing rows keep their status and `scheduled_for`. If a send cannot be joined to a template, `SET NOT NULL` fails and the migration stops. It does not delete or rewrite those rows.

`template_version` rows are immutable (subject, body, merge tags). The send stores that version id. It does not copy the template source. Category is stored on the send because `template.category_id` can change after a version exists, and the send must keep the category chosen at edit time.

## State enum

`draft`, `scheduled`, `queued`, `dispatching`, `completed`, `cancelled`, `failed`.

`queued`, `dispatching`, `completed`, and `failed` were already on the enum. This API does not move a send into those states. No worker does either.

## Transitions

Implemented in `apps/email-hub/src/lib/sends/state.ts`. Handlers do not apply a status change except through `scheduleSend` and `cancelSend`.

| From        | To          | How                             |
| ----------- | ----------- | ------------------------------- |
| `draft`     | `scheduled` | `POST /api/sends/{id}/schedule` |
| `scheduled` | `cancelled` | `POST /api/sends/{id}/cancel`   |

Every other pair is rejected with `409` `conflict` and `details[].path` `status`. That includes scheduling a send that is already `scheduled`, `cancelled`, `queued`, `dispatching`, `completed`, or `failed`, and cancelling anything that is not `scheduled`. There is no reschedule path. A cancelled send stays cancelled.

The update is conditional on `id`, `version`, and the status read in the transaction. A concurrent schedule and cancel cannot both commit. The loser gets `409`. The winner's audit row is the only audit row.

## Edit lock

Only `draft` accepts changes to `template_version_id`, `sender_id`, `category_id`, `offer_id`, `scheduled_for`, and the derived `email_type`. `PATCH` on any other status returns `409` with message `Send configuration is locked`. The same fields are not accepted by schedule or cancel. Delete is not a substitute for cancel: only a `draft` with no `message.send_id` row can be deleted. A draft that already has a message returns `409`.

Migration `0013_send_editable_while_draft.sql` replaces `send_guard_update`. The function from `0003` allowed those column changes only while the old status was `scheduled`, which blocked every draft update after `draft` was added. The replacement allows a full update while the old status is `draft`, and raises `send can only be edited while status is draft` when a later status changes `email_type`, `template_version_id`, `sender_id`, `category_id`, `offer_id`, `scheduled_for`, `created_by`, `created_at`, or `id`. Status, version, and dispatch timestamps stay writable, so schedule and cancel still commit. The trigger is renamed to `send_only_while_draft`. A `P0001` with that message is mapped to `409` `Send configuration is locked`. Other `P0001` errors, including audit and template-version immutability, stay unmapped.

## Template version lock

On schedule, the stored `template_version_id` must be the template's `current_version_id`, and the template `status` must be `active`. That is the published state `publishTemplateVersion` writes. Draft and archived templates are rejected. The API does not publish a template and does not replace the stored version with a newer one.

A draft may point at a version that is not yet the current published version. Schedule then returns `422` and leaves the row `draft`. After a successful schedule, a later publish does not change `send.template_version_id`.

Create and patch reject an archived template. They do not require the version to be the current published one.

`category_id` must equal that template's `category_id`, and the category must exist with `is_active = true`. Categories are global in this schema. There is no per-workspace category table.

## Record version

`send.version` starts at `1` and increments on patch, schedule, cancel, and is checked on delete. The client sends the version it last read. A mismatch returns `409` `conflict`. `details` are the current row flattened to `{ path, message }`, the same shape as email-route conflicts, so the caller can retry with the new version. The database row is not written when the version does not match.

## Scheduling time

`scheduled_for` is stored as `timestamptz`. Draft create and patch only check that the timestamp parses. Schedule compares the stored instant to the application clock:

`scheduled_for >= now + 5 minutes`

`now` is `new Date()` after the other schedule checks, in the same transaction, immediately before the status update. An equal five-minute lead is accepted. A past time, or a time less than five minutes ahead, returns `422` `validation_failed` on `scheduled_for`. The status stays `draft`. The stored instant is not rewritten when the schedule succeeds. A time that was valid when the draft was saved can fail at schedule if the clock has moved.

## Schedule

`POST /api/sends/{id}/schedule` authenticates, requires Operator+, loads the send, checks `version`, requires `draft → scheduled`, revalidates template version, sender, domain, category, and offer, enforces the lead time, then updates `status` and `version` in one transaction and writes audit `send.schedule`. Validation failure rolls the transaction back. No queue job is added. A second schedule of the same version loses the conditional update and returns `409`.

## Cancel

`POST /api/sends/{id}/cancel` is the same transaction shape for `scheduled → cancelled`, with audit `send.cancel`. It does not remove messages and does not call a provider. There is no BullMQ job keyed by send id to remove. `queued` and later statuses are not cancellable here, because those states mean execution has moved past the scheduled row and this codebase has no recall path.

## CRUD

Create inserts `status = draft`, `version = 1`, `created_by` from the session. It does not schedule or send.

List and get return every send. There is no second tenant to hide. An unknown id is `404` `not_found`.

Patch updates configuration only while `draft`, then increments `version`.

Delete hard-deletes a `draft` when `version` matches and no message references the send. Scheduled and later rows are kept. The response is the deleted JSON. Audit `send.delete` stores that JSON as `before` and `null` as `after`.

## Configuration checks

| Field            | Create / patch draft                                 | Schedule                                              |
| ---------------- | ---------------------------------------------------- | ----------------------------------------------------- |
| Template version | Row exists; template is not archived                 | Also `status = active` and id is `current_version_id` |
| Sender           | Exists, `status = active`                            | Same                                                  |
| Domain           | Sender's domain `status = verified`                  | Same                                                  |
| Category         | Exists, active, equals the template category         | Same                                                  |
| Offer            | If set, the offer row exists. Status is not checked. | Same                                                  |
| `scheduled_for`  | Valid UTC timestamp                                  | Also at least 5 minutes ahead                         |

Missing related rows are `422` `validation_failed`, matching email routes. The send id itself is the only `404`.

`verified` is the active sending domain. `pending`, `verifying`, `failed`, and `inactive` are rejected. The message text matches email routes: "Sender must be on an active domain".

## Authorization

`requireSendsStaffAccess` rejects machine keys, then uses `STAFF_API_MIN_ROLE`. Missing map entries are forbidden. Reads are Viewer+. Create, patch, delete, schedule, and cancel are Operator+.

## Audit

`writeAudit` runs in the same transaction as the mutation. Actions follow the existing dotted form (`email_route.create`), not the `send.created` spelling:

- `send.create`
- `send.update`
- `send.delete`
- `send.schedule`
- `send.cancel`

Actor type is `user`, actor id is the session user, object type is `send`, object id is the send id. `before` / `after` are the serialized send. The audit helper redacts secrets. These payloads do not include recipient lists, merge data, or credentials. `requestId` is the request id from the logger context.

## Logging

Pino events, with `request_id`, `actor_id`, `send_id`, `previous_status`, and `new_status` when known:

- `sends.created`
- `sends.updated`
- `sends.scheduled`
- `sends.cancelled`
- `sends.deleted`
- `sends.transition_rejected`
- `sends.version_conflict`

There is no `workspace_id` field on the send.

## Decisions made without SD#9.5

- Added `draft` because the existing enum started at `scheduled`, and schedule is a separate POST. Create must not mean scheduled.
- Kept the existing later statuses and did not add `sending`. `dispatching` is the in-progress value already on the enum.
- Did not add API transitions into `queued`, `dispatching`, `completed`, or `failed`.
- Stored `category_id` on `send` instead of reading it only through the mutable template row.
- Derived `email_type` from the template.
- Did not check `offer.status`. Email routes only require the offer to exist.
- Enforced the published-version rule at schedule, not when saving a draft.
- Used `422` for bad related records and bad timestamps, and `409` for version, lock, and illegal transitions.
- Did not enqueue or remove jobs, because no send scheduler exists.

## Limitations

- Migration `0012_send_draft_and_category.sql` is not applied.
- No tests were run.
- Cancelling a `scheduled` send cannot recall mail, and it cannot see a queue job that this API never creates.
- A send left in `queued` or `dispatching` by a future worker cannot be cancelled or edited here.
- Clock skew between this process and Postgres is not reconciled. The lead-time decision uses the application clock. `updated_at` is also set from that clock; the existing `send_set_updated_at` trigger may overwrite it with the database clock.
- PostgreSQL allows `ADD VALUE` inside a transaction on version 12 and newer, but the new enum value cannot be used until that transaction commits. This migration does not insert `draft` rows.
