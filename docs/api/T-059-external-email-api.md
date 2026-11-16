# External email API

Machine clients submit email and read its current status. Sending goes through the existing `triggerEmail` path and the `send-email` BullMQ queue. These routes do not call SES or SMTP.

## Authentication

Both routes use the existing machine HMAC headers:

| Header        | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| `x-key-id`    | API client id                                                          |
| `x-timestamp` | Unix time in seconds. Allowed skew is 5 minutes.                       |
| `x-signature` | Hex HMAC-SHA256 of `timestamp.METHOD.path_with_query.sha256_hex(body)` |

The signature is checked against the current secret, or the immediately previous secret until 24 hours after `rotated_at`. A later rotation drops any older secret at once. The plaintext secret is not stored; verification decrypts the ciphertext held for that client. A bad signature uses the same `401` body as an unknown client.

A signed-in staff session cannot call these routes. A request with no machine headers is `401`. A staff session without machine headers is `403`.

An unknown, revoked, undecryptable, or badly signed key is `401` with `error.code` `unauthorized` and detail path `x-key-id`. An active key whose `expires_at` is in the past is `401` with detail message `API client expired`, after the signature matches. An empty IP allowlist allows any address. A non-empty allowlist is exact IPv4 or IPv6 (CIDR is not accepted). The client address is the `TRUSTED_PROXY_HOPS` entry from the right of `X-Forwarded-For` (default 1, the address Coolify/Traefik appends). A spoofed leftmost value is ignored. A client IP outside that allowlist is `403`.

## Scopes

| Route                              | Scope         |
| ---------------------------------- | ------------- |
| `POST /api/ext/emails/send`        | `emails:send` |
| `GET /api/ext/emails/{message_id}` | `emails:read` |

Scopes come from the `api_client` row. A body field cannot grant a scope. `emails:read` does not allow send, and `emails:send` does not allow read. A missing scope is `403` `forbidden`.

## POST /api/ext/emails/send

Creates one message for an active email route, then enqueues `send-email` when the message is `queued`.

The caller does not choose a template version or sender. `triggerEmail` resolves the active route for `email_type` and optional `offer_id`, checks merge tags, and runs the existing recipient, suppression, opt-out, and frequency checks.

### Request

`Content-Type` is not required. The raw body must be JSON and at most 64 KiB. Unknown fields are rejected.

| Field              | Required | Rule                                                                                                                                                                     |
| ------------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `to`               | yes      | Email, trimmed and lowercased, max 254 characters                                                                                                                        |
| `email_type`       | yes      | `thank_you`, `feedback_request`, or `engagement`                                                                                                                         |
| `idempotency_key`  | yes      | Trimmed string, 1–255 characters                                                                                                                                         |
| `offer_id`         | no       | UUID v7, or `null`                                                                                                                                                       |
| `external_user_id` | no       | Trimmed string, 1–255 characters, or `null`                                                                                                                              |
| `merge_data`       | no       | Flat object, at most 50 keys. Keys match `^[A-Za-z_][A-Za-z0-9_]*$` and are at most 64 characters. Values are strings up to 2000 characters, finite numbers, or booleans |

`merge_data` is checked against the route template's required tags. The `message` table has no merge-data column, so the values are not stored and the worker sends the template source as stored.

Example:

```json
{
  "to": "recipient@example.com",
  "email_type": "thank_you",
  "idempotency_key": "order-1001-thank-you",
  "offer_id": null,
  "external_user_id": "user-42",
  "merge_data": {
    "first_name": "Alex"
  }
}
```

### Success

Newly created messages with status `queued` return `202`.

```json
{
  "message_id": "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44",
  "status": "queued"
}
```

`message_id` is the persisted message id. `202` is returned only after that row is committed and a `send-email` job has been added. The job id is the message id. Job data is `{ "message_id", "request_id" }`.

Any other persisted outcome returns `200` with the same body shape and the stored status. That includes a skipped message (`no_route`, suppression, opt-out, frequency, and the other existing skip reasons) and a repeat of an existing key.

There is no separate public idempotency header. The key is stored as `ext:{api_client_id}:{idempotency_key}`, so keys do not collide across API clients. The same client and key returns the original message even when `to`, `email_type`, or `merge_data` differ. That mismatch is not a `409`. Concurrent calls for the same recipient are serialized by the existing recipient lock. If two requests still insert the same key, the loser reads the committed row and is treated as a replay.

If the row is still `queued` and the job is missing, a repeat request enqueues it again. A job that already exists for that message id is left in place. Redis or queue failure after the row exists returns `503`. A retry with the same key enqueues again while the status is still `queued`. `202` is not returned for that failure.

## GET /api/ext/emails/{message_id}

Reads the current `message.status`. It does not send mail or call AWS.

`message_id` must be a UUID v7. A valid id with no row is `404`.

```json
{
  "message_id": "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44",
  "status": "sent"
}
```

### Status values

| Status       | Meaning                                                    |
| ------------ | ---------------------------------------------------------- |
| `queued`     | Accepted and waiting for the send worker                   |
| `sending`    | Worker claimed the row                                     |
| `sent`       | Transport accepted the message. This is not inbox delivery |
| `delivered`  | Delivery was recorded later                                |
| `bounced`    | Bounce was recorded                                        |
| `complained` | Complaint was recorded                                     |
| `skipped`    | Not sent. The skip reason is not part of this response     |
| `failed`     | Send failed and will not be retried by this request        |

## Errors

Error bodies use the existing shape:

```json
{
  "error": {
    "code": "validation_failed",
    "message": "Validation failed",
    "details": [{ "path": "to", "message": "Invalid email address" }]
  }
}
```

| HTTP | `error.code`        | When                                                                        |
| ---- | ------------------- | --------------------------------------------------------------------------- |
| 200  |                     | Status read, replay, or a persisted non-queued send result                  |
| 202  |                     | New message committed and queued                                            |
| 400  | `bad_request`       | Body is not JSON, including an empty body                                   |
| 401  | `unauthorized`      | Missing or invalid machine auth, revoked key, expired key                   |
| 403  | `forbidden`         | Missing scope, staff session, or IP not allowlisted                         |
| 404  | `not_found`         | Message id is a UUID v7 and no row exists                                   |
| 413  | `bad_request`       | Body larger than 64 KiB. Detail path is `body`                              |
| 422  | `validation_failed` | Body or `message_id` failed schema validation, including missing merge tags |
| 429  | `rate_limited`      | More than 600 requests in 60 seconds for this key. `Retry-After: 60`        |
| 500  | `internal`          | Unexpected failure. No stack trace is returned                              |
| 503  | `unavailable`       | Rate-limit Redis is down, or the send queue could not accept the job        |

`409` is not used. The shared error catalog has no payload-too-large code, so `413` uses `bad_request`.

## Rate limiting

Machine auth already applies a sliding window of 600 requests per minute per API client (`rl:ext:{api_client_id}`). These routes do not add a second limiter. That limit is separate from the worker's SES send rate.

## Request id

`withApiRequest` keeps the incoming `x-request-id` when it is valid, otherwise generates one, and sets `X-Request-Id` on the response. The same id is stored on the `send-email` job as `request_id`. Logs use that request context. Recipient addresses are masked. API keys, signatures, raw bodies, and merge data are not logged. The API client id is logged.

## Workspace isolation

`api_client` and `message` have no workspace column. The application is one tenant. A client with `emails:read` can read any message id in this database. Send idempotency is the only client boundary, and it applies only to repeated POST keys.

## Queue

Queue name `send-email`, prefix `bd`, job name `send-email`. Attempts, backoff, and removal settings are the existing send-email job options. The worker still renders and transports the message. This API does not change worker concurrency or the SES limiter.
