# T-062 — Implement Events Writer Job (BullMQ + ClickHouse)

Status: IMPLEMENTED

## 1. Queue Architecture

The events-writer pipeline asynchronously persists verified SES/SNS email events into ClickHouse for analytics and reporting without blocking HTTP webhook responses or coupling analytics persistence to transactional message status updates.

```
AWS SES Event
    |
    v
AWS SNS Notification
    |
    v
Next.js SES Webhook Route (apps/email-hub/src/app/api/ext/webhooks/ses/route.ts)
    |
    +--> Verify SNS signature & TopicArn
    +--> Redis dedupe claim (bd:sns:ses:<MessageId>)
    |
    +--> 1. Stage C: Transactional status & bounce/complaint suppression in PostgreSQL
    |
    +--> 2. Queue Producer: Normalizes event and enqueues BullMQ job (jobId = sns_message_id)
    |
    +--> Redis dedupe complete
    |
    v
Redis Queue: "bd:events"
    |
    v
Worker Process (apps/worker)
    |
    +--> BullMQ Worker: "events" (concurrency: 10, attempts: 10, exponential 5s backoff)
    +--> Batch metadata enrichment: PostgreSQL (domain, offer, template, environment)
    +--> Map to ClickHouse email_events schema
    +--> ClickHouse Insert: emailhub.email_events (async_insert=1, wait_for_async_insert=1)
    +--> Calculate lag_ms (insert_acknowledged_at - event_occurred_at)
    +--> Structured Pino Log: "events.inserted"
```

## 2. Queue Name

- **Queue Name:** `events` (`EVENTS_QUEUE_NAME = "events"`)
- **BullMQ Key Prefix:** `bd` (`BULLMQ_PREFIX = "bd"`)
- **Full Redis Key Prefix:** `bd:events`
- **Job Name:** `events-writer` (`EVENTS_JOB_NAME = "events-writer"`)

This conforms to the existing `QUEUE_NAMES` list in `apps/worker/src/queues.ts`.

## 3. Producer Integration

The queue producer is integrated directly into the verified SES webhook lifecycle in `apps/email-hub/src/lib/ses-webhook.ts`.

- **Location:** Inside `handleSesWebhook` when `envelope.Type === "Notification"`.
- **Pre-conditions:**
  - Content-Type and payload size validated.
  - SNS cryptographic signature verified against Amazon SNS certificate.
  - Topic ARN verified against configured `SNS_TOPIC_ARN`.
  - SNS message claimed via `claimMessage` (`bd:sns:ses:<MessageId>`).
- **Execution:**
  - Executes existing `applyNotification` for transactional Postgres updates.
  - Calls `enqueueNotificationEvents` which maps SES event payloads to `EventsJobData`.
  - Uses `getEventsQueue()` with short connect timeouts (2s) to fail fast on Redis downtime.
  - If enqueuing fails, the error is caught, the dedupe key is released, and `SesWebhookError("unavailable", "redis")` is thrown so SNS retries delivery.
  - Idempotent duplicate job errors (`isDuplicateJob`) are treated as safe success.
  - Only after both PostgreSQL application and queue submission succeed is `dedupe.complete` invoked.

## 4. Job-Data Contract

Defined in `@workspace/shared` (`packages/shared/src/events-queue.ts`):

```ts
export type NormalizedEmailEventRecord = {
  event_id: string
  event_type: EmailEventType
  event_time: string
  ses_message_id: string
  recipient_emails?: string[]
  bounce_type?: string | null
  bounce_subtype?: string | null
  smtp_status?: string | null
  smtp_diagnostic?: string | null
  delay_type?: string | null
  complaint_type?: string | null
  link_url?: string | null
  user_agent?: string | null
  raw_payload?: string
}

export type EventsJobData = {
  sns_message_id: string
  message_id?: string
  request_id?: string
  workspace_id?: string
  environment?: string
  event_type?: string
  event_timestamp?: string
  records: NormalizedEmailEventRecord[]
}
```

## 5. Job ID Strategy

- **BullMQ Job ID:** `jobId = sns_message_id`
- The `sns_message_id` comes directly from the cryptographically verified SNS envelope `MessageId` (UUID string matching `^[A-Za-z0-9-]{1,128}$`).
- Because SNS message IDs contain only alphanumeric characters and hyphens, they are fully compliant with BullMQ job ID format requirements (no colon delimiters).
- Multiple event records from the same SNS message are stored inside a single BullMQ job payload `records[]`, preventing event loss from duplicate job IDs.

## 6. Worker Registration

Registered in `apps/worker/src/index.ts`:

- The generic dummy worker pool explicitly excludes `SEND_EMAIL_QUEUE_NAME` and `EVENTS_QUEUE_NAME`.
- A dedicated `Worker<EventsJobData>` is instantiated for `EVENTS_QUEUE_NAME`.
- Wrapped with `withJobLogs` for automatic request-id propagation, attempt tracking, and structured execution logging.
- Registered in the `workers` array for coordinated graceful shutdown.

## 7. Concurrency Configuration

- **Concurrency:** `10`
- Worker configuration:
  ```ts
  new Worker<EventsJobData>(EVENTS_QUEUE_NAME, processor, {
    connection,
    prefix: BULLMQ_PREFIX,
    concurrency: 10,
  })
  ```
- Each worker instance processes up to 10 events concurrently without artificial rate limiters.

## 8. Retry Configuration

Configured on job submission via `EVENTS_JOB_OPTIONS`:

```ts
export const EVENTS_JOB_OPTIONS = {
  attempts: 10,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 86_400, count: 50_000 },
  removeOnFail: { age: 1_209_600 },
} satisfies JobsOptions
```

- **Attempts:** 10 total attempts (initial attempt + up to 9 retries).
- **Backoff Strategy:** BullMQ exponential backoff starting at 5,000 ms (5 s, 10 s, 20 s, 40 s, etc.).
- Retention: Succeeded jobs kept for 24 hours (up to 50k); failed jobs retained for 14 days for debugging.

## 9. Event Enrichment Sources

Metadata enrichment occurs in `apps/worker/src/events-writer.ts` prior to ClickHouse insertion:

1. **Domain Enrichment:**
   - Primary: Resolved sending domain name (`domain.name`) by joining `message.senderId -> sender.domainId -> domain.id`.
   - Fallback: Sender from-address domain extracted via `extractDomain(sender.fromEmail)` or SES `mail.source`.
   - Recipient Domain: Extracted from `recipient.email` or `record.recipient_emails[0]` via `extractDomain`.
2. **Offer Enrichment:**
   - Resolved from `message.offerId`. Legitimate nulls are preserved as `null`.
3. **Template Enrichment:**
   - Resolved from historical `message.templateVersionId` persisted at send time, guaranteeing historical version accuracy.
4. **Environment Enrichment:**
   - Client Environment: Parsed from `record.user_agent` using `parseUserAgentEnvironment` (`client`, `device_type`, `os`, `country`, `region`, `is_machine`, `machine_reason`).
   - Deployment Environment: Captured from `process.env.EMAILHUB_ENV ?? process.env.NODE_ENV ?? "development"` and bound to structured logs.
5. **N+1 Query Prevention:**
   - All `ses_message_id`s in a job batch are queried together using `inArray(message.sesMessageId, uniqueIds)`.

## 10. ClickHouse Schema Mapping

Target table: `emailhub.email_events` (created in `packages/db/clickhouse/0001_create_email_events.sql`).

| ClickHouse Column     | Type                   | Source                                                                                                                                               |
| --------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id`            | UUID                   | Generated UUID (`record.event_id` or `randomUUID()`)                                                                                                 |
| `event_type`          | LowCardinality(String) | Mapped `EmailEventType` (`sent`, `delivered`, `bounce_hard`, `bounce_soft`, `complaint`, `reject`, `delivery_delay`, `open`, `click`, `unsubscribe`) |
| `event_time`          | DateTime64(3, 'UTC')   | Formatted timestamp string from SES event                                                                                                            |
| `ingested_at`         | DateTime64(3, 'UTC')   | ClickHouse column default (`now64(3)`)                                                                                                               |
| `message_id`          | UUID                   | Enriched from PostgreSQL `message.id`                                                                                                                |
| `ses_message_id`      | String                 | SES message ID from `mail.messageId`                                                                                                                 |
| `recipient_id`        | UUID                   | Enriched from PostgreSQL `message.recipientId`                                                                                                       |
| `send_id`             | Nullable(UUID)         | Enriched from PostgreSQL `message.sendId` (null preserved)                                                                                           |
| `offer_id`            | Nullable(UUID)         | Enriched from PostgreSQL `message.offerId` (null preserved)                                                                                          |
| `email_type`          | LowCardinality(String) | Enriched from PostgreSQL `message.emailType`                                                                                                         |
| `template_version_id` | UUID                   | Enriched from PostgreSQL `message.templateVersionId`                                                                                                 |
| `sender_id`           | UUID                   | Enriched from PostgreSQL `message.senderId`                                                                                                          |
| `sending_domain`      | LowCardinality(String) | Enriched from `domain.name`                                                                                                                          |
| `recipient_domain`    | LowCardinality(String) | Extracted domain from recipient email                                                                                                                |
| `provider`            | LowCardinality(String) | Hardcoded `"ses"`                                                                                                                                    |
| `bounce_type`         | LowCardinality(String) | SES `bounce.bounceType` or empty string                                                                                                              |
| `bounce_subtype`      | LowCardinality(String) | SES `bounce.bounceSubType` or empty string                                                                                                           |
| `smtp_status`         | LowCardinality(String) | Extracted SMTP response code (e.g. `250`, `5.1.1`) or empty string                                                                                   |
| `smtp_diagnostic`     | String CODEC(ZSTD(3))  | Full SMTP diagnostic response or empty string                                                                                                        |
| `delay_type`          | LowCardinality(String) | SES `deliveryDelay.delayType` or empty string                                                                                                        |
| `complaint_type`      | LowCardinality(String) | SES `complaint.complaintFeedbackType` or empty string                                                                                                |
| `link_url`            | String CODEC(ZSTD(3))  | SES `click.link` or empty string                                                                                                                     |
| `user_agent`          | String CODEC(ZSTD(3))  | SES `open.userAgent` / `click.userAgent` or empty string                                                                                             |
| `client`              | LowCardinality(String) | Parsed client ("Apple Mail", "Gmail", "Outlook", etc.)                                                                                               |
| `device_type`         | LowCardinality(String) | Parsed device type ("mobile", "desktop", "tablet")                                                                                                   |
| `os`                  | LowCardinality(String) | Parsed OS ("iOS", "Android", "macOS", "Windows", "Linux")                                                                                            |
| `country`             | LowCardinality(String) | Geo country or empty string                                                                                                                          |
| `region`              | LowCardinality(String) | Geo region or empty string                                                                                                                           |
| `is_machine`          | UInt8                  | `1` if bot/proxy/Apple MPP detected, else `0`                                                                                                        |
| `machine_reason`      | LowCardinality(String) | Machine reason ("apple_mpp", "google_proxy", etc.)                                                                                                   |
| `raw_payload`         | String CODEC(ZSTD(3))  | Sanitized JSON payload string                                                                                                                        |

## 11. ClickHouse Async Insert Settings

Inserts use `packages/db/src/clickhouse/email-events-schema.ts` (`insertEmailEvents`) or `clickhouseInsert`:

```ts
await client.insert({
  table: "email_events",
  values: rows,
  format: "JSONEachRow",
  clickhouse_settings: {
    async_insert: 1,
    wait_for_async_insert: 1,
  },
})
```

- `async_insert = 1`: Instructs ClickHouse to buffer small inserts into larger part writes on the server side.
- `wait_for_async_insert = 1`: Ensures the HTTP request blocks until data has been flushed to the table part, guaranteeing durable persistence before the BullMQ job succeeds.

## 12. lag_ms Calculation

Calculated in milliseconds immediately following successful ClickHouse insert acknowledgment:

$$\text{lag\_ms} = \max(0, \text{insert\_acknowledged\_at} - \text{event\_occurred\_at})$$

- `insert_acknowledged_at`: Timestamp (`Date.now()`) when `client.insert` returns.
- `event_occurred_at`: Original event timestamp parsed from the SES event payload (`Date.parse(record.event_time)`).
- Fallback: Defaults to `insert_acknowledged_at` (resulting in `lag_ms = 0`) if the timestamp is missing or malformed.

## 13. Structured Logging

Logged via `@workspace/logger` after successful ClickHouse write acknowledgment:

```json
{
  "service": "emailhub-worker",
  "event": "events.inserted",
  "sns_message_id": "4f3a6d5c-1b2e-4a9f-8c7d-6e5f4a3b2c1d",
  "job_id": "4f3a6d5c-1b2e-4a9f-8c7d-6e5f4a3b2c1d",
  "message_id": "018f8c8e-aaaa-7000-8000-000000000001",
  "workspace_id": "ws-123",
  "inserted_count": 1,
  "lag_ms": 1420
}
```

Forbidden fields (`email`, raw recipient addresses, secrets, authentication tokens) are omitted.

## 14. Error Handling and Retries

- **Retryable Errors:**
  - ClickHouse network timeout or connection refused.
  - PostgreSQL connectivity issues during enrichment.
  - Uncommitted message context: if `lookupMessageContext` does not find the `message` record (due to replication lag or out-of-order webhook delivery), a retryable `Error` is thrown so BullMQ reattempts with exponential delay (5s base).
- **Non-retryable Errors:**
  - Malformed job data (missing `sns_message_id` or empty records) throws BullMQ `UnrecoverableError`.
  - Unsupported event types that cannot be mapped are filtered prior to queueing.

## 15. Retry Exhaustion Behavior

When all 10 attempts are exhausted:

- BullMQ moves the job to the failed set.
- Job is retained in Redis for 14 days (`removeOnFail: { age: 1_209_600 }`).
- Pino logger emits structured `job.failed` with the error stack and job correlation context.

## 16. Deduplication Strategy & Limitations

1. **SNS Webhook Layer:** Redis key `bd:sns:ses:<MessageId>` deduplicates duplicate HTTP webhooks from SNS.
2. **BullMQ Layer:** `jobId = sns_message_id` deduplicates re-enqueued jobs in BullMQ.
3. **ClickHouse Storage Semantics:** ClickHouse `email_events` uses `MergeTree`. Because BullMQ retries operate under at-least-once delivery semantics, a network partition occurring after ClickHouse acknowledgment but before BullMQ marks the job complete could cause a retry and duplicate row in ClickHouse. Downstream reporting queries use `uniqStateIf(message_id, ...)` or appropriate deduplication views to handle duplicate rows safely.

## 17. Worker Shutdown Behavior

- Listens for `SIGTERM` and `SIGINT`.
- Stops accepting new jobs by closing BullMQ workers: `await Promise.all(workers.map(w => w.close()))`.
- Gracefully waits for in-flight jobs to complete.
- Closes ClickHouse client connection (`closeClickHouseClient()`).
- Closes Redis connections (`connection.quit()`, `queueConnection.quit()`).
- Exits cleanly with code 0.

## 18. Configuration Requirements

Reuses existing environment variables:

- `REDIS_URL`: Redis connection string for BullMQ.
- `CLICKHOUSE_URL`: ClickHouse connection endpoint.
- `CLICKHOUSE_DATABASE`: ClickHouse database name (defaults to `"emailhub"`).
- `DATABASE_URL`: PostgreSQL connection string.
- `SNS_TOPIC_ARN`: Configured SNS topic ARN for SES webhook verification.
- `LOG_LEVEL` & `LOG_FORMAT`: Structured logger configuration.

## 19. Dependencies on Existing Modules

- `@workspace/db`: Schema definitions (`message`, `recipient`, `sender`, `domain`) and client.
- `@workspace/db/clickhouse`: ClickHouse client, `email_events` table constants, and `insertEmailEvents`.
- `@workspace/logger`: Context logger, request-ID propagation, redaction, and `withJobLogs`.
- `@workspace/shared`: `EVENTS_QUEUE_NAME`, `EVENTS_JOB_OPTIONS`, `enqueueEventsJob`, `extractDomain`, `parseUserAgentEnvironment`.
- `apps/email-hub`: SES webhook handler (`apps/email-hub/src/lib/ses-webhook.ts`).
- `apps/worker`: BullMQ worker entry point (`apps/worker/src/index.ts`).

## 20. Known Limitations

- ClickHouse `MergeTree` does not perform synchronous deduplication on insert; exactly-once semantics are not guaranteed at the storage engine level during worker failure recovery.
- If an email event is generated for an external send that never had a corresponding record in the PostgreSQL `message` table (e.g. manual SES console test sends), the worker will exhaust all 10 retry attempts before failing because non-nullable UUID columns (`message_id`, `recipient_id`, `template_version_id`, `sender_id`) cannot be fabricated.
