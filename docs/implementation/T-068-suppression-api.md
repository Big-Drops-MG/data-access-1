# T-068 — Suppression API

Status: IMPLEMENTED — AWAITING TESTING

Staff routes read and manually add rows in the existing `suppression_entry` table, and admins soft-remove a row by setting `removed_at`. No migration was added. Sending already reads active `suppression_entry` rows, so a new manual row is enforced on the next send check with no sync job.

This repository has no workspace column on suppressions. Isolation is the staff session and the role map.

## Endpoints

| Method | Path                            | Role      |
| ------ | ------------------------------- | --------- |
| `GET`  | `/api/suppressions`             | Viewer+   |
| `POST` | `/api/suppressions`             | Operator+ |
| `POST` | `/api/suppressions/{id}/remove` | Admin     |

Machine-auth headers are rejected. There is no hard-delete route. Remove sets `removed_at` and leaves the row in place.

## Request schemas

Create body:

```json
{
  "email": "recipient@example.com",
  "offer_id": null,
  "reason": "manual"
}
```

`email` is trimmed and lowercased (`emailSchema`, max 254). `offer_id` may be omitted or `null` for a global suppression. A present `offer_id` must be an existing offer uuid. An empty string is `422`, and it is not treated as global.

`reason` is required and must be the literal `manual`. That value is stored in `suppression_entry.source`. The free-text `reason` column is left null. `hard_bounce`, `optizmo`, `list_unsub`, and `feedback_review` are rejected here. Those sources stay on their existing writers (SES hard bounce, unsubscribe, and future sync). `added_by`, `source`, `scope`, and any other key are rejected. `added_by` is the authenticated user id.

The remove route ignores any body. The stored `source` is what the `hard_bounce` check uses.

List query uses staff pagination: `limit` default 50, max 200, optional uuidv7 `cursor`. Optional filters: `source`, `scope`, `offer_id`, `email`, `include_removed` (`true` or `false`). Unknown query keys are rejected. `email` is normalised and matched on `email_hash`, and also on the linked recipient email.

Omitted `include_removed` lists active rows only (`removed_at` is null). `include_removed=true` includes removed rows as well.

## Response schema

```json
{
  "id": "<uuidv7>",
  "email": "recipient@example.com",
  "recipient_id": "<uuidv7-or-null>",
  "scope": "global",
  "offer_id": null,
  "source": "manual",
  "reason": null,
  "added_by": "<user-uuid-or-null>",
  "created_at": "2026-11-05T12:00:00.000Z",
  "removed_at": null
}
```

`email` on a list row is the linked recipient's email, or null when `recipient_id` is null. `suppression_entry` stores `email_hash`, not the plaintext address, and the hash is not returned. Create and duplicate responses set `email` from the normalised request address so the caller sees the address they submitted.

Create returns `201` and the resource plus `"created": true`. An identical active manual suppression returns `200` and the original resource plus `"created": false`. List shape is `{ "data": [], "next_cursor": null }`. Ordering is `id` descending. Ids are uuidv7, so that is newest first with a unique cursor. Remove returns `200` and the resource with `removed_at` set.

Viewer responses pass through `jsonForRole`, which masks `email`. Operators and admins receive the address unchanged.

## Authentication and authorization

`requireSuppressionsStaffAccess` rejects machine keys, then uses `STAFF_API_MIN_ROLE`. Missing map entries are forbidden. List is Viewer+. Manual add is Operator+. Remove is Admin, including when a Viewer or Operator calls `POST /api/suppressions/{id}/remove`. The session user id is stored as `added_by` and as the audit actor.

Unauthenticated calls are `401`. A role below the map entry is `403`. Those responses come from the existing session helpers and are not written to `audit_log`.

## Suppression reason rules

| Request `reason` | Stored `source` | Allowed on this API |
| ---------------- | --------------- | ------------------- |
| `manual`         | `manual`        | yes                 |
| any other value  | —               | `422`               |

`hard_bounce` cannot be created here and cannot be removed. The remove update's `WHERE` excludes `source = 'hard_bounce'`, so a request body cannot rename the row and then delete it. A `hard_bounce` id returns `409` and the row is unchanged. A rejected hard-bounce remove is a warning log `suppression.remove_rejected`, not an audit row, because the row did not change.

Admin remove is allowed for every other active source (`manual`, `optizmo`, `list_unsub`, `feedback_review`). That sets `removed_at` only. It does not change `recipient.status`, preferences, or the text `reason`.

Removing an already removed non-`hard_bounce` row returns the current row and does not write another audit row.

## Global versus offer-specific

Scope is chosen from `offer_id`, not from a client `scope` field.

- Omitted or null `offer_id`: `scope = global`, `offer_id` null. Send checks treat this like other global engagement suppressions (`manual` blocks engagement mail, not thank-you or feedback-request).
- Present `offer_id`: `scope = offer` and that offer id. Send checks apply it to engagement mail for that offer, in addition to global and `list_unsub` rows. The offer must already exist. Offer status is not a separate gate.

A global row is not rewritten into an offer row, and an offer row is not rewritten into a global row. They are different active keys, so both may exist for one address.

`list_unsub` is not created by this API. Unsubscribe still inserts that scope itself.

## Duplicate-ignore behavior

Active uniqueness is already enforced by partial unique indexes. Source is not part of the key.

- `suppression_entry_global_active_unique` on `(email_hash, scope)` where `removed_at` is null and `offer_id` is null
- `suppression_entry_offer_active_unique` on `(email_hash, scope, offer_id)` where `removed_at` is null and `offer_id` is not null

Insert uses `ON CONFLICT DO NOTHING` against the matching partial index, then reads the active row. A second manual add with the same email and the same global or offer scope returns the original row (`created: false`) and does not change `added_by`, `created_at`, `recipient_id`, or `source`. Concurrent identical inserts cannot both create a row. Duplicate ignores are logged as `suppression.duplicate_ignored` and are not audited.

If the active row for that key has a different `source` (including `hard_bounce`), the insert does not update it. The API returns `409` `conflict` with the existing `source` and `id`. That covers the case where a global `hard_bounce` already occupies the global slot: the manual add does not downgrade or delete it.

A removed row is outside the partial index, so a later manual add inserts a new active row instead of reviving the removed one.

## Recipient linking

The route schema trims and lowercases `email`. The service runs `normaliseEmail` again before the recipient lookup and the hash, so a padded or mixed-case address still matches. The lookup uses `recipient.email` (the same column `findOrCreateRecipient` uses). When a row exists, `recipient_id` is set and `email_hash` is that recipient's `email_hash`, so `runSendChecks` finds the suppression. When no recipient exists, `recipient_id` is null and `email_hash` is `hashEmail` of the normalised address. No recipient is inserted, and recipient status and preferences are not changed.

Linking happens only on the inserted row. A duplicate ignore does not backfill `recipient_id` onto the original row.

Create and the audit write run in one transaction.

## Hard-bounce removal

`POST /api/suppressions/{id}/remove` updates `removed_at` only when the row is still active and `source` is not `hard_bounce`. The check is in the `UPDATE` predicate. A missing id is `404`. `hard_bounce` is `409` and is not modified. Audit action `suppression_entry.remove` is written only when this call sets `removed_at`.

`removed_at` is the existing removal column. No soft-delete column was added, and the row is not deleted.

## Errors

| Case                                      | Status | Code                |
| ----------------------------------------- | ------ | ------------------- |
| Missing session                           | 401    | `unauthorized`      |
| Machine key on this API                   | 401    | `unauthorized`      |
| Role too low, or unmapped method          | 403    | `forbidden`         |
| Unknown suppression id                    | 404    | `not_found`         |
| Invalid JSON                              | 400    | `bad_request`       |
| Invalid email, reason, offer id, or query | 422    | `validation_failed` |
| Offer id does not exist                   | 422    | `validation_failed` |
| Active row exists with a different source | 409    | `conflict`          |
| Remove of `hard_bounce`                   | 409    | `conflict`          |

Responses do not include SQL or stack traces. Conflict details do not include the email address.

## Logging and audit

Handlers run inside `withApiRequest`. Events:

- `suppression.created`
- `suppression.duplicate_ignored`
- `suppression.removed`
- `suppression.conflict` (warn)
- `suppression.remove_rejected` (warn)

Fields are `suppression_id`, `source`, `scope`, `offer_id`, and `email_hash`. The plaintext email is not logged. Audit actions are `suppression_entry.create` and `suppression_entry.remove`. Audit payloads store `email_hash`, not the plaintext email. The actor is `{ type: "user", id: <session user> }`.

## Database schema changes

None. `suppression_entry` already has `email_hash`, `recipient_id`, `scope`, `offer_id`, `source`, `reason`, `added_by`, `created_at`, and `removed_at`, plus the partial unique indexes and the scope/offer check.

No migration file was added. Nothing was applied to a database.

## Files

Created:

- `apps/email-hub/src/app/api/suppressions/route.ts`
- `apps/email-hub/src/app/api/suppressions/[id]/remove/route.ts`
- `apps/email-hub/src/lib/suppressions/schemas.ts`
- `apps/email-hub/src/lib/suppressions/serialize.ts`
- `apps/email-hub/src/lib/suppressions/service.ts`
- `apps/email-hub/src/lib/suppressions/staff-access.ts`
- `docs/implementation/T-068-suppression-api.md`

Modified:

- `apps/email-hub/src/lib/permission-map.ts`

The send pipeline (`runSendChecks`, SES hard bounce, unsubscribe) was not changed.

## Limitations

- Single tenant.
- List email is null when the suppression has no `recipient_id`, because the table does not store plaintext email.
- The active unique key does not include `source`. A global `manual` row and a global `hard_bounce` row cannot both be active. This API will not replace `hard_bounce`. The existing SES hard-bounce insert still uses `ON CONFLICT DO NOTHING` on that same global key, so an older global row of another source can still prevent a later `hard_bounce` insert. Known recipients are still marked `bounced` by that SES path. This task does not change that path.
- Manual add cannot create `hard_bounce`, `optizmo`, `list_unsub`, or `feedback_review`.
- Duplicate ignores and rejected hard-bounce removes are not audit rows.
- `403` responses are not audit rows.
- Focused Vitest and ESLint were run later. See `docs/testing/T-068-qa-report.md`. Migrations were not run. `tsc --noEmit` failed on a stale `.next/types` cache.
