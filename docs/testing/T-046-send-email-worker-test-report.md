# T-046 send-email worker test report

Date: 2026-10-30
Branch: `feature/T-046-send-email-worker`
Overall status: **PARTIAL**

Local queue, database, suppression, retry, pause, Mailpit, and one approved SES simulator send passed. A provider accept that is not saved no longer sends a second copy: the row stays `sending`.

## 1. Overall T-046 status

PARTIAL

## 2. Tests executed

32 T-046 tests, plus the related regression suites below.

- `apps/worker/src/send-email.test.ts`: 18 unit tests
- `apps/worker/src/send-email.int.test.ts`: 14 integration tests
- Regression: `apps/worker/src/queues.test.ts` (2) and `packages/shared` unit suite (112)

Commands:

```text
pnpm --filter @workspace/worker test
pnpm --filter @workspace/shared test
pnpm exec vitest run --config vitest.int.config.ts apps/worker/src/send-email.int.test.ts
```

The integration file was then rerun in two slices after the database reads were serialized:

```text
pnpm exec vitest run --config vitest.int.config.ts apps/worker/src/send-email.int.test.ts -t "delivery database|Mailpit"
pnpm exec vitest run --config vitest.int.config.ts apps/worker/src/send-email.int.test.ts -t "Mailpit"
```

## 3. Passed

32 of 32 T-046 tests passed on their latest run.

- Worker unit suite: 20 passed (18 send-email, 2 queue registry), 19:58
- Shared unit suite: 112 passed, 19:57
- Full integration file: 14 passed, 19:56, 45.5s of test time
- Database slice after the query serialization fix: 7 passed, 19:59
- Mailpit slice after the timeout change: 1 passed in 2.3s, 20:00

Redis cases were not repeated after the query change. That change is only in `loadQueuedSend` and `gatherSendCheckFacts`, which those Redis cases do not call.

## 4. Failed

0 remaining failures.

One Mailpit run at 19:59 hit Vitest's default 5 second limit (5042ms) while the rest of the database slice passed. The test limit was raised to 20 seconds. The same test then passed in 2276ms. That was a harness timeout, not a send failure.

## 5. Skipped or blocked

Vitest skipped 0 tests in the full integration run.

Blocked, not executed:

- Stopping Redis or PostgreSQL, expiring a BullMQ lock, and forcing a transport timeout. Those were not simulated against the running containers.

## 6. Queue configuration verification

PASS, from the producer options, worker options, and a real Redis job on an isolated prefix.

| Setting     | Expected                                     | Observed                                                                                                |
| ----------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Queue name  | `send-email`                                 | `SEND_EMAIL_QUEUE_NAME` is `send-email`. The integration queue uses that name.                          |
| Job name    | `send-email`                                 | `job.name` was `send-email`                                                                             |
| Payload     | `{ message_id }`                             | Matched                                                                                                 |
| Concurrency | 10                                           | `sendEmailWorkerOptions` returns `concurrency: 10` for SMTP and SES                                     |
| Limiter     | `SES_MAX_SEND_RATE` per second, only for SES | `{ max: 2, duration: 1000 }` when the test rate is `"2"`. SMTP omits the limiter.                       |
| Attempts    | 5                                            | Stored on the job by `enqueueSendEmailJob`, not on the Worker                                           |
| Backoff     | exponential, 2000ms                          | `job.opts.backoff` equals `{ type: "exponential", delay: 2000 }`                                        |
| Redis       | Existing connection settings                 | Isolated prefix `bdt046` plus random hex. Queue name stays `send-email`. Live prefix `bd` was not used. |
| Transport   | T-042 `MailTransport`                        | Worker calls `createMailTransport(env)` and `transport.send`                                            |

A duplicate `enqueueSendEmailJob` for the same id left `waiting = 1`.

After the suite, `bd:send-email:wait`, `active`, `delayed`, and `paused` were absent.

## 7. Concurrency test results

PASS for one worker.

25 jobs, worker concurrency taken from `sendEmailWorkerOptions` (10). A gate held the first 10 until all 10 had started. `maxActive` was 10 and all 25 completed. The case took 391ms on the full run and 764ms on the later full run.

This is per worker instance. BullMQ does not apply that cap across multiple worker processes. A second process can run another 10 at the same time.

## 8. Rate-limiter results

PASS for one worker at `SES_MAX_SEND_RATE=2`.

10 jobs, real BullMQ limiter `{ max: 2, duration: 1000 }`, mocked processor. The test required the tenth start to be at least 3500ms after the first. It passed. The case took 4237ms, which matches 2 jobs per second across 10 jobs.

No message was sent to AWS. Multiple workers were not rate-limited together. Each worker has its own limiter, so two workers can exceed `SES_MAX_SEND_RATE` in aggregate.

## 9. Retry and backoff results

PASS against real BullMQ scheduling. Fake timers were not used.

Throttling (`ThrottlingException`, HTTP 429), concurrency 1:

- 5 attempts, then the job failed
- `attemptsMade` was 5
- Gaps were asserted against 2000, 4000, 8000, and 16000ms, with tolerance -400ms / +2500ms
- The case took 30582ms, in line with 30s of backoff

Retryable 5xx (`InternalServerException`, HTTP 503): the second attempt succeeded and `attempts` was 2. The case took 2845ms, including the first 2s delay.

Unit tests also classify `ThrottlingException`, HTTP 500, and a socket error as `retry`, and they assert the processor rethrows without `markFailed`.

## 10. Suppression results

PASS on the cloned test database.

- Active recipient: one send, status `sent`, `ses_message_id` `provider-1`
- Recipient status `bounced`: status `skipped`, `skip_reason` `recipient_bounced`, transport not called
- Global `manual` suppression inserted after the row was queued, engagement mail: status `skipped`, `skip_reason` `suppressed`, transport not called
- Rows already `skipped` or `failed`: transport not called

There is no `cancelled` status. A non-queued row returns before send. Thank-you and feedback-request still ignore engagement suppression; that is existing Stage A behavior, and the suppression case used `engagement` so the block applies.

The recheck is the full `runSendChecks` path, including the suppression lookup, immediately before `transport.send`.

## 11. Duplicate-send prevention results

PARTIAL. Concurrent workers do not double-send. A crash after acceptance can.

- Second delivery of a row already `sent`: no second provider call
- Two overlapping `runSendEmailExclusive` calls, with the send delayed 150ms: `sends === 1`, status `sent`, id `provider-once`
- The lock is `pg_advisory_xact_lock(hashtext(message_id))` inside the same transaction as the status update
- The claim is a committed `queued` -> `sending` update before the provider call. `sent` and `failed` are written from `sending`.

Crash case, retested after the fix: the provider returned an id and the status write threw. The row stayed `sending`, `ses_message_id` stayed empty, and a second delivery did not send. `sends === 1`.

The worker commits `queued` -> `sending` before the provider call. A retryable provider error releases that claim back to `queued`. A successful provider response does not. A crash after the claim and before the provider answers also leaves `sending`, so that retry does not send either.

## 12. SES error classification results

PASS for the classified cases. No live SES errors were produced.

| Failure                                                        | Classification               | Database                                                              |
| -------------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------- |
| `ThrottlingException` / HTTP 429                               | retry                        | row stays queued                                                      |
| HTTP 500 / `InternalServerException`                           | retry                        | row stays queued                                                      |
| `MessageRejected`                                              | `UnrecoverableError`         | status `failed`, reason contains `MessageRejected`, one provider call |
| Other HTTP 4xx, including `MailFromDomainNotVerifiedException` | rejected                     | unit coverage                                                         |
| Local `MailTransportError` with no cause (empty body)          | rejected                     | SMTP sender not called; `markFailed` plus `UnrecoverableError`        |
| `AccountSendingPausedException` even with HTTP 400             | account paused, not rejected | see section 13                                                        |

Failure text is sliced to 500 characters. The tests do not log credentials.

## 13. Account-paused behavior

PASS for the implemented pause. The real AWS account was not paused.

Redis test, two workers, mocked transport:

1. The first send threw `AccountSendingPausedException`.
2. `queue.pause()` ran. `queue.isPaused()` was true.
3. A second worker started after the pause and did not send. `sends` stayed 1 for 400ms.
4. `queue.resume()` let both jobs complete. `sends` was at least 2.

`Queue.pause()` is stored in Redis for that queue name and prefix. It is not `Worker.pause()`, so another worker on the same prefix also stops taking jobs. Pending jobs stayed in the queue and completed after resume.

Database test, real `openSesAccountPausedAlert`:

- Message stayed `queued`
- `ses_message_id` stayed null
- One open alert, type `ses_account_paused`, severity `critical`, dedupe key `ses_account_paused`

Recovery that was tested: `queue.resume()`, then the worker retries the paused job under the normal exponential backoff. No separate resume API was added.

## 14. Mailpit integration results

PASS.

Mailpit was healthy on SMTP `127.0.0.1:1025` and API `127.0.0.1:8025`. PostgreSQL and Redis from `docker-compose.dev.yml` were healthy. The test used the Vitest template clone, not the shared `emailhub` database.

- Transport: SMTP via `createMailTransport`
- Recipient: disposable `@example.com` address
- Worker path: `runSendEmailExclusive` and `processSendEmailJob`
- PostgreSQL status: `sent`
- Provider id: non-empty SMTP message id stored in `ses_message_id`
- Mailpit API: subject matched the unique `T046` subject, HTML and text both contained `Mailpit body`
- The Mailpit message was deleted afterward

The first filtered rerun exceeded 5 seconds and was rerun with a 20 second limit. The rerun passed in 2.3 seconds.

## 15. Database verification and AWS

Database checks asserted rows, not logs: `sent` plus `ses_message_id`, `skipped` plus `skip_reason`, `failed` plus `failure_reason`, and the account-paused alert row.

AWS SES integration: **PASS**, one approved simulator send on 2026-10-30.

The script `apps/worker/scripts/send-email-ses-simulator.ts` inserted one queued thank-you message, enqueued it with `enqueueSendEmailJob`, and processed that job with `processSendEmailJob` and the SES transport. The local env file uses SMTP, so this process set `MAIL_TRANSPORT=ses` only for itself. Credentials came from the repo root `.env`. Nothing was printed from that file.

Observed before the test row was removed:

- region `us-east-1`
- configuration set `emailhub-dev-ses`
- from domain `e.quotifii.com`
- to `success@simulator.amazonses.com`
- message id `01a18d4a-c07c-7bde-aaad-a2b670945780`
- status `sent`
- `ses_message_id` `010001a18d4ac957-dd39fa59-7b58-44db-b130-84d8783e8fbb-000000`
- skip reason and failure reason empty

The queue was idle before the send. Afterward `waiting`, `active`, and `delayed` were 0 and the queue was not paused. The simulator message and the rows this run created were removed. No other queue job was present.

The process hung while closing Redis after that result. It was stopped, and a follow-up check found no leftover simulator template, recipient, or sender from the last 30 minutes. The script now force-closes the worker so a later run does not wait forever. Do not run it again unless another single simulator send is intended.

## 16. TypeScript and lint results

PASS.

- `pnpm --filter @workspace/shared typecheck`
- `pnpm --filter @workspace/worker typecheck`
- `pnpm --filter @workspace/db typecheck` (includes `tsconfig.test.json`)
- ESLint on the worker send-email files, `send-email-delivery.ts`, `send-checks.ts`, `env.ts`, shared `index.ts`, and the db test factory files

## 17. Files changed

Branch: `feature/T-046-send-email-worker`.

Modified:

- `apps/worker/src/index.ts`
- `packages/shared/src/env.ts`
- `packages/shared/src/env.test.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/send-checks.ts`
- `packages/db/test/factories.ts`
- `packages/db/test/index.ts`
- `turbo.json`

Added:

- `apps/worker/src/send-email.ts`
- `apps/worker/src/send-email.test.ts`
- `apps/worker/src/send-email.int.test.ts`
- `packages/shared/src/send-email-delivery.ts`
- `docs/testing/T-046-send-email-worker-test-report.md`
- `apps/worker/scripts/send-email-ses-simulator.ts`

No schema migration. `drizzle-orm` was not added to the worker package.

`send-checks` and `loadQueuedSend` now run their lookups one after another on the transaction connection. The integration run had warned that `pg` will reject overlapping queries on one client. The database rerun after that change did not print the warning. Send-check behavior is unchanged; the shared send-check unit tests still passed (28).

## 18. Remaining risks

- A crash after the `sending` claim and before SES answers leaves the row `sending` with no provider id. The retry does not send it. That message needs a person to decide whether to queue it again.
- The rate limit and the concurrency cap are per worker process.
- Rendering copies the stored subject and HTML. Merge tags such as `{{first_name}}` are not substituted. `unsubscribeUrl` is not set, so the SES List-Unsubscribe header is not added. There is no `merge_data` column and no unsubscribe token helper. Invalid or empty rendered bodies are rejected locally and are not handed to the provider.
- Redis outage, PostgreSQL outage, lock expiry, and transport timeout were not injected.
- The account-pause alert and the Redis pause were proven in two tests, not one combined outage.
- A worker started with `MAIL_TRANSPORT=ses` will send every waiting `bd:send-email` job. The queue was empty after these tests.

## 19. Ready for a pull request

Yes, for review. The branch is not pushed. The report should stay with the PR.

## 20. Safe to merge

No.

The approved simulator send passed, and the duplicate-send crash case now stays on one send. A row left in `sending` after a crash still needs a human decision before it can be queued again.
