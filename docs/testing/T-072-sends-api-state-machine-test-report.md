# T-072 Sends API and state machine — QA report

Date: 2026-11-05
Branch: `feature/T-072-sends-api-state-machine`
Scope: testing only. Application source was not changed to make a failing test pass.

## 1. Executive summary

The sends API, schedule and cancel transitions, five-minute rule, version pin, optimistic version check, and audit writes are implemented and pass unit tests plus six of seven Postgres integration tests.

Draft configuration updates do not persist. `updateSend` issues an `UPDATE` while `status` is `draft`. The existing trigger `send_guard_update` allows configuration changes only while `status` is `scheduled`, and raises `P0001` (`send can only be edited while status is scheduled`). The integration test `updates a draft template version` failed on that error at `apps/email-hub/src/lib/sends/service.ts:488`. The API lock does the opposite: it allows edits in `draft` and returns 409 once the row is `scheduled`.

`pnpm --filter @workspace/email-hub typecheck` exited 2. `pnpm --filter @workspace/email-hub build` compiled, then failed on the same TypeScript errors.

SD#9.5 was not available and was not fetched. The lifecycle below is the one in `apps/email-hub/src/lib/sends/state.ts`. It is not a confirmation of SD#9.5. `queued`, `dispatching`, `completed`, and `failed` exist on the enum and have no API transition.

## 2. QA environment

- OS: Windows 10. Package manager: pnpm. Test runner: Vitest 3.2.7.
- Unit project: `email-hub`. Integration config: `vitest.int.config.ts`.
- Integration tests used the repository harness, which clones a database from `apps/email-hub/.env` and applies migrations, including `0013_send_draft_and_category.sql`. No production database was targeted. No unrestricted `DELETE` or `TRUNCATE` was run. No email was sent. Redis was not flushed.
- A separate `SELECT current_database()` was not executed. Column and enum checks ran inside the integration test through `information_schema` and `pg_enum`.
- Live HTTP calls against a signed-in staff server were not executed. Route tests mock the session and the service. Service integration tests call the service with a real database.

## 3. Files inspected

- `apps/email-hub/src/app/api/sends/route.ts`
- `apps/email-hub/src/app/api/sends/[id]/route.ts`
- `apps/email-hub/src/app/api/sends/[id]/schedule/route.ts`
- `apps/email-hub/src/app/api/sends/[id]/cancel/route.ts`
- `apps/email-hub/src/lib/sends/service.ts`
- `apps/email-hub/src/lib/sends/state.ts`
- `apps/email-hub/src/lib/sends/schemas.ts`
- `apps/email-hub/src/lib/sends/serialize.ts`
- `apps/email-hub/src/lib/sends/staff-access.ts`
- `apps/email-hub/src/lib/permission-map.ts`
- `apps/email-hub/src/lib/api-response.ts`
- `packages/db/src/schema/send.ts`
- `packages/db/src/schema/index.ts`
- `packages/db/src/index.ts`
- `packages/db/drizzle/0003_recipients_sending_feedback.sql` (`send_guard_update`)
- `packages/db/drizzle/0013_send_draft_and_category.sql`
- `packages/shared/src/postgres-errors.ts`
- `docs/implementation/T-072-sends-api-state-machine.md`
- Tests listed in section 19.

## 4. Actual API endpoints

Staff session routes. Minimum role from `permission-map.ts`:

| Method | Path                       | Role     |
| ------ | -------------------------- | -------- |
| GET    | `/api/sends`               | viewer   |
| POST   | `/api/sends`               | operator |
| GET    | `/api/sends/{id}`          | viewer   |
| PATCH  | `/api/sends/{id}`          | operator |
| DELETE | `/api/sends/{id}?version=` | operator |
| POST   | `/api/sends/{id}/schedule` | operator |
| POST   | `/api/sends/{id}/cancel`   | operator |

`GET /api/sends/{id}/schedule` and `DELETE /api/sends` are not mapped.

Create body: `template_version_id`, `sender_id`, `category_id`, optional `offer_id`, `scheduled_for` (UTC `Z` datetime). Update and schedule/cancel require `version`. List filters: `status`, `email_type`, `offer_id`, `sender_id`, `category_id`, `template_version_id`, `cursor`, `limit`.

## 5. Actual lifecycle states

Enum order persisted in the integration database:

`draft`, `scheduled`, `queued`, `dispatching`, `completed`, `cancelled`, `failed`.

Create sets `draft` and `version` 1. `email_type` is copied from the template. `category_id` is stored on `send`. There is no `workspace_id`.

`queued`, `dispatching`, `completed`, and `failed` are not reachable through this API. No code in the sends service enqueues a BullMQ job for a send id. Cancellation updates status only. Whether an already queued message job would still send mail is not implemented on this path, so that check is BLOCKED.

## 6. State transition matrix

Source: `TRANSITIONS` in `state.ts`. Confirmed by `state.test.ts` for every pair of the seven statuses.

| From           | To        | API                          | Result                                      |
| -------------- | --------- | ---------------------------- | ------------------------------------------- |
| draft          | scheduled | POST schedule                | Allowed                                     |
| scheduled      | cancelled | POST cancel                  | Allowed                                     |
| Any other pair |           | schedule, cancel, or neither | 409 `Cannot transition from {from} to {to}` |

Edit rule in the API: `assertSendEditable` allows configuration changes only when `status` is `draft`.

Database rule in `send_guard_update`: if `OLD.status` is `scheduled`, the update proceeds. Otherwise a change to `email_type`, `template_version_id`, `sender_id`, `offer_id`, `scheduled_for`, `created_by`, `created_at`, or `id` raises P0001. `status`, `version`, `updated_at`, and `category_id` are not in that list. That is why schedule and cancel succeed and a draft template-version update fails.

## 7. CRUD results

| ID      | Description                                            | Expected                                            | Actual                                                                                                                                                 | Status | Evidence                                       |
| ------- | ------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------- |
| CRUD-C1 | Valid create                                           | 201, status draft, version 1, relations stored      | Unit service and route tests passed. Integration create persisted a draft and wrote `send.create`.                                                     | PASS   | `service.test.ts` create case; int create case |
| CRUD-C2 | Create does not send mail                              | No queue write                                      | Service create path has no queue call. Unit test asserts no schedule update.                                                                           | PASS   | `service.ts` `createSend`; unit create case    |
| CRUD-C3 | Bad sender, domain, category                           | 422, no row                                         | Integration rejected inactive sender, inactive domain (`Sender must be on an active domain`), and mismatched category.                                 | PASS   | int create case                                |
| CRUD-L1 | List and filters                                       | Own rows, filters, cursor page                      | Unit list passed. Integration list with `status=cancelled` and `sender_id` found the cancelled row.                                                    | PASS   | unit list; int schedule case                   |
| CRUD-R1 | Read and unknown id                                    | 200 or 404, no stack in 404 body                    | Route test 404 passed.                                                                                                                                 | PASS   | `[id]/route.test.ts`                           |
| CRUD-U1 | Update a draft template version                        | Version 2, new template version, status stays draft | Postgres P0001 from `send_guard_update`. Transaction aborted. Error is not an `AppError`.                                                              | FAIL   | int test, exit 1, `service.ts:488`             |
| CRUD-U2 | Omitted fields and stale version                       | Omitted fields kept; stale version 409              | Unit mock passed. Integration stale version (version bumped with raw SQL, then PATCH version 1) returned 409 and left `template_version_id` unchanged. | PASS   | unit update/stale cases; int stale case        |
| CRUD-D1 | Delete unlinked draft                                  | Row gone                                            | Integration delete succeeded and the following read was 404.                                                                                           | PASS   | int delete case                                |
| CRUD-D2 | Delete scheduled, cancelled, or a draft with a message | 409, row remains                                    | Unit rejected scheduled and linked drafts. Integration rejected a draft that has a message and a cancelled send.                                       | PASS   | unit delete; int delete and schedule cases     |
| CRUD-X  | Cross-workspace references                             | Rejected                                            | No workspace column exists.                                                                                                                            | FAIL   | int column query `workspace_id` absent         |

## 8. Scheduling boundary results

The rule is application time: `scheduledFor < now + 5 minutes` is 422. It does not use PostgreSQL `now()`. Unit tests freeze time at `2026-11-05T12:00:00.000Z`.

| ID       | Scheduled time                    | Expected          | Actual                                                                                                                                                       | Status | Evidence                                         |
| -------- | --------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------ |
| TIME-01  | Past                              | Reject            | `assertScheduleLeadTime` and mocked `scheduleSend` throw 422. Update is not called.                                                                          | PASS   | `state.test.ts`, `service.test.ts`               |
| TIME-02  | Now                               | Reject            | Same                                                                                                                                                         | PASS   | same                                             |
| TIME-03  | Now + 1 minute                    | Reject            | Same. Integration schedule of a +1 minute draft returned `validation_failed` and left status `draft`.                                                        | PASS   | unit plus int schedule case                      |
| TIME-04  | Now + 4 minutes 59 seconds        | Reject            | Unit reject                                                                                                                                                  | PASS   | unit                                             |
| TIME-05  | Now + 5 minutes                   | Accept            | Unit accept                                                                                                                                                  | PASS   | unit fake clock                                  |
| TIME-06  | Now + 5 minutes 1 second          | Accept            | Unit accept                                                                                                                                                  | PASS   | unit                                             |
| TIME-07  | Now + 30 minutes                  | Accept            | Unit accept. Integration +30 minutes schedule returned `scheduled`.                                                                                          | PASS   | unit plus int                                    |
| TIME-08  | Invalid timestamp                 | Reject            | Schema and `assertScheduleLeadTime` reject                                                                                                                   | PASS   | `schemas.test.ts`, `state.test.ts`               |
| TIME-09  | Missing `scheduled_for`           | Reject            | Schema and route 422                                                                                                                                         | PASS   | `schemas.test.ts`, `route.test.ts`               |
| TIME-10  | Offset timestamp                  | UTC handling      | `z.iso.datetime` accepts `Z` and rejects a numeric offset. Offsets are not converted.                                                                        | PASS   | `schemas.test.ts` against the implemented schema |
| TIME-EXP | Valid at draft, stale at schedule | Schedule rejected | Unit: +6 minutes passes at T0 and fails when `now` is T0+2 minutes. Integration did not move a clock; it created a +1 minute draft and schedule rejected it. | PASS   | `state.test.ts`; int +1 minute case              |

## 9. Schedule endpoint results

| ID     | Description                                    | Expected                                        | Actual                                                                                                                                                  | Status  | Evidence                           |
| ------ | ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------- |
| SCH-01 | Draft to scheduled                             | Status `scheduled`, time unchanged, version + 1 | Integration passed                                                                                                                                      | PASS    | int schedule case                  |
| SCH-02 | Template must be the current published version | 422                                             | Unit rejected a non-current version and did not write audit                                                                                             | PASS    | `service.test.ts`                  |
| SCH-03 | Second schedule                                | 409, one success audit                          | Unit rejected. Integration `Promise.allSettled` of two schedules: one fulfilled, one rejected, status `scheduled`, version 2, one `send.schedule` audit | PASS    | unit plus int concurrency case     |
| SCH-04 | Lost conditional update                        | 409                                             | Unit passed                                                                                                                                             | PASS    | `service.test.ts`                  |
| SCH-05 | Viewer                                         | 403                                             | Route test passed                                                                                                                                       | PASS    | `schedule/route.test.ts`           |
| SCH-06 | Queue job                                      | Follow existing send execution                  | No send-id job is enqueued                                                                                                                              | BLOCKED | `scheduleSend` only updates status |
| SCH-07 | Database failure leaves no partial row         | Atomic with audit                               | Unit: audit throw propagates and the function does not return the send. A killed Postgres connection was not injected.                                  | BLOCKED | `service.test.ts` audit case       |

## 10. Cancel endpoint results

| ID     | Description                                | Expected                                          | Actual                                                                                                       | Status  | Evidence                               |
| ------ | ------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- | -------------------------------------- |
| CAN-01 | Scheduled to cancelled                     | Status `cancelled`, row kept, `send.cancel` audit | Integration passed                                                                                           | PASS    | int schedule case                      |
| CAN-02 | Cancel completed, or schedule after cancel | 409, status unchanged                             | Unit rejects completed. Integration reschedule of cancelled returned conflict and status stayed `cancelled`. | PASS    | unit cancel; int schedule case         |
| CAN-03 | Viewer                                     | 403                                               | Route test passed                                                                                            | PASS    | `cancel/route.test.ts`                 |
| CAN-04 | Cancel prevents a queued execution         | Job checks status before send                     | No dispatcher reads this send row before delivery                                                            | BLOCKED | sends service has no queue integration |
| CAN-05 | Other workspace                            | Rejected                                          | No workspace column                                                                                          | FAIL    | int schema check                       |

## 11. Edit-lock results

| ID      | Description                   | Expected                             | Actual                                                                                                                                                                                                                        | Status | Evidence                                                                                  |
| ------- | ----------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------- |
| LOCK-01 | Each field on a scheduled row | 409, no SQL update, no success audit | Unit covered template version, sender, category, offer, and `scheduled_for`. Integration covered sender on a real scheduled row and received 409 `Send configuration is locked` before SQL.                                   | PASS   | `service.test.ts`; int schedule case                                                      |
| LOCK-02 | Same fields on a draft        | Update persists                      | Template version update failed with P0001. Sender, offer, and `scheduled_for` are in the same trigger list, so the same failure applies to those columns. `category_id` is not in the trigger list and was not updated alone. | FAIL   | int `updates a draft template version`; trigger in `0003_recipients_sending_feedback.sql` |
| LOCK-03 | Direct SQL while scheduled    | Backend lock holds                   | The trigger returns NEW when `OLD.status` is `scheduled`, so a direct update of configuration is allowed. The API 409 does not apply to SQL.                                                                                  | FAIL   | `send_guard_update` lines 386–388                                                         |

## 12. Template-version locking results

| ID     | Description                                | Expected                                                                     | Actual                                                                                                                                     | Status | Evidence                      |
| ------ | ------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------- |
| VER-01 | Schedule pins version A                    | `template_version_id` stays A after `template.current_version_id` moves to B | Integration updated the template current version and the send still referenced A                                                           | PASS   | int schedule case             |
| VER-02 | PATCH cannot replace A after schedule      | 409                                                                          | Integration sender patch was 409. Template-version patch on a scheduled row was covered by the unit lock loop, not by a second SQL update. | PASS   | int lock plus unit field loop |
| VER-03 | Draft can move from A to B before schedule | Persisted B                                                                  | Integration update threw P0001                                                                                                             | FAIL   | int update case               |

## 13. Concurrency results

| ID    | Description                  | Expected                  | Actual                                                                                          | Status  | Evidence                              |
| ----- | ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- | ------- | ------------------------------------- |
| CON-A | Stale update                 | 409, winner unchanged     | Integration: raw `version` set to 2, then update with version 1 returned 409 and kept version A | PASS    | int stale case                        |
| CON-B | Two schedules                | One transition, one audit | Integration passed                                                                              | PASS    | int concurrency case                  |
| CON-C | Update and schedule together | No stale config scheduled | Not executed                                                                                    | BLOCKED | no test issued both calls in one race |

## 14. Audit logging results

Actions used: `send.create`, `send.update`, `send.delete`, `send.schedule`, `send.cancel`. Object type `send`.

| ID     | Description                      | Expected                                                            | Actual                                                                                                                 | Status | Evidence                            |
| ------ | -------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------- |
| AUD-01 | Create                           | One row, actor id, entity type send, no template source or password | Integration matched `send.create`, `actorId`, `entityType`. JSON of `after` did not match `body_source` or `password`. | PASS   | int create case                     |
| AUD-02 | Schedule and cancel              | Both actions present                                                | Integration `expect.arrayContaining` found both, plus create                                                           | PASS   | int schedule case                   |
| AUD-03 | Rejected schedule or locked edit | No success audit                                                    | Unit asserts `writeAudit` is not called                                                                                | PASS   | unit schedule reject and lock cases |
| AUD-04 | Update audit                     | `send.update` with before and after                                 | Not persisted. The update transaction aborted on P0001.                                                                | FAIL   | int update case                     |
| AUD-05 | Delete audit                     | `send.delete`                                                       | Unit mock writes it. Integration confirmed the row was gone and did not assert the audit row.                          | PASS   | unit delete; int delete of the row  |

Rejected operations log `sends.transition_rejected` or `sends.version_conflict` at warn. Those lines appeared in the integration log for the locked edit, the reschedule, and the version conflict.

## 15. Authentication results

| ID      | Description                              | Expected   | Actual                                      | Status  | Evidence                          |
| ------- | ---------------------------------------- | ---------- | ------------------------------------------- | ------- | --------------------------------- |
| AUTH-01 | Missing session                          | 401        | Route test on GET `/api/sends`              | PASS    | `route.test.ts`                   |
| AUTH-02 | Expired session                          | 401        | Not executed as a distinct expired cookie   | BLOCKED | only a missing session was mocked |
| AUTH-03 | Viewer write, schedule, cancel, delete   | 403        | Route tests passed                          | PASS    | route tests                       |
| AUTH-04 | Operator create, patch, schedule, cancel | 201 or 200 | Route tests passed against a mocked service | PASS    | route tests                       |
| AUTH-05 | Machine `x-key-id` on staff create       | 401        | Route test passed                           | PASS    | `route.test.ts`                   |

## 16. Workspace isolation results

| ID     | Description                                                                 | Expected             | Actual                                                                                                       | Status | Evidence        |
| ------ | --------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ | ------ | --------------- |
| ISO-01 | Workspace column and cross-workspace read, update, schedule, cancel, delete | Rejected, no leakage | `information_schema` for `public.send` does not contain `workspace_id`. Staff role is the only access check. | FAIL   | int column test |

Cross-workspace template, sender, category, and offer cases cannot be constructed. Reference checks are existence, status, domain verification, and category match inside one database.

## 17. PostgreSQL verification

| ID    | Description                       | Expected             | Actual                                                                                                                               | Status | Evidence                              |
| ----- | --------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------- |
| PG-01 | Table `send` and required columns | Present              | Integration saw `template_version_id`, `sender_id`, `category_id`, `offer_id`, `scheduled_for`, `status`, `version`                  | PASS   | int column test                       |
| PG-02 | Enum includes `draft` first       | Order matches schema | Integration enum order matched section 5                                                                                             | PASS   | int enum query                        |
| PG-03 | FKs and version check             | In Drizzle schema    | `send.ts` FKs are restrict. Check `send_version_positive`. Migration `0012` adds `draft` and `category_id`. Schema unit test passed. | PASS   | `packages/db/src/schema/send.test.ts` |
| PG-04 | Trigger vs API                    | Same edit rule       | Trigger and API disagree. See section 6.                                                                                             | FAIL   | `0003` function and `state.ts`        |

`pnpm --filter @workspace/db typecheck` exited 0.

## 18. Error handling results

| ID     | Description                  | Expected                         | Actual                                                                                                                                                                                                                                                               | Status | Evidence                                              |
| ------ | ---------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| ERR-01 | Invalid JSON                 | 400                              | Route test                                                                                                                                                                                                                                                           | PASS   | `route.test.ts`                                       |
| ERR-02 | Unknown id                   | 404, body has no stack           | Route test                                                                                                                                                                                                                                                           | PASS   | `[id]/route.test.ts`                                  |
| ERR-03 | Bad timestamp and short lead | 422                              | Route and service tests                                                                                                                                                                                                                                              | PASS   | route plus TIME cases                                 |
| ERR-04 | Illegal transition and lock  | 409                              | Route schedule/cancel conflict tests and service tests                                                                                                                                                                                                               | PASS   | route tests                                           |
| ERR-05 | Stale version                | 409                              | Integration                                                                                                                                                                                                                                                          | PASS   | int stale case                                        |
| ERR-06 | Draft update hits trigger    | Safe API error, no partial write | Raw Postgres error, SQLSTATE P0001. `appErrorFromPostgresConstraint` maps only `23505` and `23503`, so this code is not turned into 409. HTTP status was not observed because the integration test called the service. The transaction did not return a success row. | FAIL   | int failure; `packages/shared/src/postgres-errors.ts` |
| ERR-07 | Request id                   | `x-request-id` on success        | Route tests passed a valid incoming id through                                                                                                                                                                                                                       | PASS   | route tests                                           |

## 19. Regression test results

| ID     | Command                                                                                                                                        | Exit | Result                                                                                                                                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| REG-01 | `pnpm exec vitest run --project email-hub src/lib/sends src/app/api/sends src/lib/permission-map.test.ts --project db src/schema/send.test.ts` | 0    | 9 files, 69 tests passed                                                                                                                                                                                                                                                                                                                  |
| REG-02 | `pnpm exec vitest run --config vitest.int.config.ts apps/email-hub/src/lib/sends/service.int.test.ts`                                          | 1    | 6 passed, 1 failed                                                                                                                                                                                                                                                                                                                        |
| REG-03 | `pnpm exec vitest run --project email-hub`                                                                                                     | 1    | 92 files passed, 1 failed. 534 tests passed, 1 failed. Failure: `src/proxy.test.ts` expected a generated request id not to contain `bbb`. The id was `978834d1-4829-480e-bbbe-d21a555d1d00`. Sends files in that run passed. Re-run of `src/proxy.test.ts` alone exited 0 (3 tests). The assertion is probabilistic and is outside T-072. |

External email send route tests in the full unit run passed (`src/app/api/ext/emails/send/route.test.ts`, 5 tests). That path is separate from the send row state machine.

## 20. Typecheck results

| Package                | Command                                        | Exit |
| ---------------------- | ---------------------------------------------- | ---- |
| `@workspace/email-hub` | `pnpm --filter @workspace/email-hub typecheck` | 2    |
| `@workspace/db`        | `pnpm --filter @workspace/db typecheck`        | 0    |

`Send` is exported from `packages/db/src/schema/index.ts` and is omitted from the package root `packages/db/src/index.ts`. `canTransition` indexes `TRANSITIONS[from]` under `noUncheckedIndexedAccess`.

## 21. Lint results

| Run                                          | Exit | Notes                                                 |
| -------------------------------------------- | ---- | ----------------------------------------------------- |
| First ESLint of sends paths                  | 1    | 7 `vitest/no-conditional-expect` errors in test files |
| ESLint after splitting those test assertions | 0    | Application files were not edited for lint            |

Command: `pnpm --filter @workspace/email-hub exec eslint src/lib/sends src/app/api/sends src/lib/permission-map.ts src/lib/permission-map.test.ts`

## 22. Build results

`pnpm --filter @workspace/email-hub build` exited 1. Next.js 16.4.2 compiled in 2.4 minutes, then TypeScript failed with the four errors in section 20.

## 23. Screenshot evidence

No screenshots were captured. No staff UI exercises these calls, and no image was fabricated.

Command transcripts: `docs/testing/evidence/T-072/command-results.txt`

Manual capture steps: `docs/testing/evidence/T-072/screenshot-instructions.txt`

| Shot                    | Status                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| 1 Create send           | Not captured. Integration create passed.                                |
| 2 Five-minute rejection | Not captured. Integration +1 minute schedule rejected.                  |
| 3 Successful schedule   | Not captured. Integration +30 minute schedule passed.                   |
| 4 Edit lock             | Not captured. Integration scheduled PATCH returned 409.                 |
| 5 Template version pin  | Not captured. Integration row stayed on version A.                      |
| 6 Cancellation          | Not captured. Integration status became `cancelled`.                    |
| 7 Audit record          | Not captured. Integration queried `audit_log`.                          |
| 8 Automated tests       | Not captured. Transcript shows 6 passed, 1 failed.                      |
| 9 Typecheck and build   | Not captured. Both commands failed. Transcript is in the evidence file. |

## 24. Bugs discovered

1. Draft configuration updates raise P0001. `send_guard_update` allows those column changes only while status is `scheduled`. The API only attempts them while status is `draft`. Integration test `updates a draft template version` failed. This blocks the update half of CRUD.
2. The API edit lock and the database trigger are inverted. A scheduled row is locked by the API and editable in SQL. A draft row is editable by the API and rejected by the trigger for the guarded columns.
3. email-hub does not typecheck or build. `Send` is not exported from `@workspace/db`, and `TRANSITIONS[from]` is possibly undefined.
4. P0001 is not mapped to an API error. A route that reached this trigger would not return the 409 used for other conflicts. That HTTP response was not executed.

These were not fixed.

## 25. Blocked checks

- Live signed-in HTTP walkthrough (phase 17).
- Expired session as a distinct cookie.
- Concurrent update and schedule (CON-C).
- Injected database outage during schedule.
- Execution prevention for an already queued job. No send-id dispatcher exists.
- `category_id`-only draft update. That column is outside the trigger list and was not updated by itself.
- SD#9.5 comparison. The document was not fetched. Transitions for `queued`, `dispatching`, `completed`, and `failed` are absent from the API and are not claimed to match that document.

## 26. PR readiness

Not ready. Draft updates fail against the existing trigger, and the email-hub typecheck and production build fail.

## Final results

| Requirement                               | Status | Evidence                                                                                                                                          |
| ----------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create send                               | PASS   | Integration create plus unit/route tests. Command section 19 REG-01 and REG-02.                                                                   |
| List sends                                | PASS   | Unit list and integration cancelled filter.                                                                                                       |
| Read send                                 | PASS   | Route 200/404 tests.                                                                                                                              |
| Update send                               | FAIL   | Integration `updates a draft template version`, P0001, `service.ts:488`.                                                                          |
| Delete send                               | PASS   | Integration unlinked draft deleted; linked and cancelled deletes rejected.                                                                        |
| Template/sender/category/offer validation | PASS   | Integration inactive sender, inactive domain, mismatched category.                                                                                |
| Five-minute scheduling rule               | PASS   | TIME-01 through TIME-10 and TIME-EXP in unit tests; +1 minute and +30 minutes on Postgres.                                                        |
| POST schedule                             | PASS   | Integration draft to `scheduled`, duplicate schedule yields one audit.                                                                            |
| POST cancel                               | PASS   | Integration `cancelled`, reschedule 409, history kept. Queue prevention is BLOCKED and is not counted as a pass.                                  |
| State machine                             | PASS   | `state.test.ts` matrix. Only draft to scheduled and scheduled to cancelled.                                                                       |
| Edit locking                              | FAIL   | API 409 on scheduled rows passed. Draft updates fail the trigger, and the trigger allows scheduled SQL edits.                                     |
| Template-version locking                  | FAIL   | Pin after schedule passed. Replacing the version on a draft failed with P0001.                                                                    |
| Concurrency protection                    | PASS   | Stale version and dual schedule on Postgres. Concurrent update plus schedule was not run.                                                         |
| Audit logging                             | FAIL   | Create, schedule, and cancel rows passed. Update never committed, so `send.update` was not written.                                               |
| Authentication                            | PASS   | 401 missing session, 403 viewer, operator success on mocked routes. Expired session not run.                                                      |
| Workspace isolation                       | FAIL   | No `workspace_id`. Cross-workspace cases cannot be rejected because the model has no workspace.                                                   |
| PostgreSQL consistency                    | FAIL   | Columns and enum match the Drizzle schema. Trigger rule contradicts the API.                                                                      |
| Regression checks                         | FAIL   | Full email-hub unit run exited 1 on `proxy.test.ts`. Isolated re-run exited 0. Sends unit files passed. Integration exited 1 on the draft update. |
| Typecheck, lint, build                    | FAIL   | email-hub typecheck exit 2. Build exit 1. db typecheck exit 0. Final sends ESLint exit 0.                                                         |

QA FAILED
