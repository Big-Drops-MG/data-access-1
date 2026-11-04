# T-060 — Email routes API

Status: IMPLEMENTED — AWAITING TESTING

The staff API creates, updates, and archives rows in the existing `email_route` table. This repository has no workspace or tenant column on routes, templates, senders, domains, or offers. Isolation is the staff session and the role map, not a caller-supplied workspace id.

## Endpoints

| Method  | Path                             | Role      |
| ------- | -------------------------------- | --------- |
| `GET`   | `/api/email-routes`              | Viewer+   |
| `POST`  | `/api/email-routes`              | Operator+ |
| `GET`   | `/api/email-routes/{id}`         | Viewer+   |
| `PATCH` | `/api/email-routes/{id}`         | Operator+ |
| `POST`  | `/api/email-routes/{id}/archive` | Operator+ |

Machine-auth headers are rejected. There is no delete route. Archive does not remove the row.

## Request schemas

Create body:

```json
{
  "email_type": "thank_you",
  "offer_id": null,
  "template_id": "<uuidv7>",
  "sender_id": "<uuidv7>"
}
```

`email_type` is `thank_you`, `feedback_request`, or `engagement`. `offer_id` may be omitted or `null` for the default route. The route is always inserted as `active`.

Patch body requires `version` and at least one of `email_type`, `offer_id`, `template_id`, `sender_id`, or `status`. Omitted fields keep their stored values. `offer_id: null` clears the offer. `status` is `active` or `inactive`.

Archive takes no body.

## Response schema

```json
{
  "id": "<uuidv7>",
  "email_type": "thank_you",
  "offer_id": null,
  "template_id": "<uuidv7>",
  "sender_id": "<uuidv7>",
  "status": "active",
  "version": 1,
  "created_by": "<uuidv7>",
  "created_at": "2026-11-03T12:00:00.000Z",
  "updated_at": "2026-11-03T12:00:00.000Z"
}
```

Create returns `201`. Patch, get, list, and archive return `200`. List shape is `{ "data": [], "next_cursor": null }` with `limit` (default 50, max 200) and optional `cursor`, `status`, `email_type`, `offer_id`, `template_id`, and `sender_id`.

## Authentication and authorization

`requireEmailRoutesStaffAccess` rejects machine keys, then uses `STAFF_API_MIN_ROLE`. Missing map entries are forbidden. Reads are Viewer+. Writes, including archive, are Operator+. The session user id is stored as `created_by` and as the audit actor. The body cannot set an actor or a workspace.

## Published template

An active route, and any create, must point at a template whose `status` is `active` and whose `current_version_id` is set. That is the state `publishTemplateVersion` writes. Draft and archived templates are rejected. The template's `email_type` must equal the route's `email_type`. The API stores `template_id`, which is the column on `email_route`. It does not publish a template or swap in another version.

## Active sender and domain

The sender must exist and have `status` `active`. Its domain must exist and have `status` `verified`. In this schema `verified` is the active sending domain; `pending`, `verifying`, `failed`, and `inactive` are rejected. Senders and domains are not activated by this API.

`offer_id`, when set, must reference an existing offer. Offer status is not a separate gate.

## Unique active route

Partial unique indexes already on `email_route` (no new migration):

- `email_route_active_offer_unique` on `(email_type, offer_id)` where `status = 'active'` and `offer_id` is not null
- `email_route_active_default_unique` on `(email_type)` where `status = 'active'` and `offer_id` is null

Inactive rows are outside both indexes, so an archived route does not block a new active pair. The null-offer index is required because PostgreSQL would otherwise treat two null `offer_id` values as distinct.

Create and patch catch Postgres `23505` only and return `409` `conflict`. Other database errors are not mapped to that conflict. The body follows the existing error shape:

```json
{
  "error": {
    "code": "conflict",
    "message": "Conflict",
    "details": [
      {
        "path": "email_type",
        "message": "An active route already exists for this email type and offer"
      },
      { "path": "offer_id", "message": "<offer uuid or empty>" },
      { "path": "email_route", "message": "<existing route id>" }
    ]
  }
}
```

A stale `version` on patch is also `409`, with the current route fields in `details`.

## Patch semantics

The service merges the body onto the stored row, then validates that effective route. Changing only the sender still checks that sender and its domain, and still requires the existing template to be published, because the result stays active. Changing `email_type` or `offer_id` is covered by the unique indexes.

An inactive route cannot be set back to `active` (`409`, path `status`). Replace it by creating a new active route after archive. Patching an inactive route's template, sender, email type, or offer still checks those references. A patch that only sets `status` to `inactive` does not re-check them, so a route can be archived after its template or sender is no longer eligible.

## Archive

`inactive` is the archive state. There is no `archived_at` column and none was added. `POST /api/email-routes/{id}/archive` sets `status` to `inactive`, increments `version`, writes audit action `email_route.archive`, and does not delete the route or any template, sender, domain, offer, or message.

A second archive of an already inactive route returns the current row and does not bump `version` or write another audit row. A concurrent archive that loses the update does the same.

`PATCH` with `status: "inactive"` performs the same transition, including the archive audit action.

## Active resolution

`resolveEmailRoute` already selects `status = 'active'` for `(email_type, offer_id)`, then falls back to the active route with a null offer. Inactive rows are not returned. This task does not change that fallback.

## Errors

| Case                                                                                                      | Status | Code                |
| --------------------------------------------------------------------------------------------------------- | ------ | ------------------- |
| Missing session                                                                                           | 401    | `unauthorized`      |
| Machine key on this API                                                                                   | 401    | `unauthorized`      |
| Role too low, or unmapped method                                                                          | 403    | `forbidden`         |
| Unknown route id                                                                                          | 404    | `not_found`         |
| Invalid JSON                                                                                              | 400    | `bad_request`       |
| Invalid body or id                                                                                        | 422    | `validation_failed` |
| Missing or unpublished template, email type mismatch, inactive sender, domain not verified, missing offer | 422    | `validation_failed` |
| Duplicate active pair, stale version, or reactivation                                                     | 409    | `conflict`          |

Responses do not include SQL or stack traces.

## Logging

Handlers run inside `withApiRequest`, so `getContextLogger()` already carries `request_id`. Events:

- `email_route.created`
- `email_route.updated`
- `email_route.archived`
- `email_route.conflict` (warn)

Fields are `route_id`, `email_type`, and `offer_id`. There is no `workspace_id` on this model. Audit log rows use the same actions `email_route.create`, `email_route.update`, and `email_route.archive`.

## Limitations

- Single tenant. Cross-workspace checks do not apply.
- The route stores `template_id`, not `template_version_id`. Sending still loads `template.current_version_id`.
- Reactivation is rejected. A new active row is required after archive.
- No migration was added. Uniqueness is the existing partial indexes.
