import type { SuppressionEntry } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { hashEmail, normaliseEmail } from "./email.js"
import { isAppError } from "./errors.js"

const writeAudit = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("./audit.js", () => ({
  writeAudit,
}))

import {
  erasePrivacyData,
  exportPrivacyData,
  pickSuppressionToKeep,
  privacyErasedEmail,
  PRIVACY_ERASURE_REASON,
} from "./privacy.js"

function entry(
  overrides: Partial<SuppressionEntry> & Pick<SuppressionEntry, "id" | "source">
): SuppressionEntry {
  return {
    emailHash: "abc",
    recipientId: null,
    scope: "global",
    offerId: null,
    reason: null,
    addedBy: null,
    syncRunId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    removedAt: null,
    ...overrides,
  }
}

function thenableRows<T>(rows: T[]) {
  const promise = Promise.resolve(rows)
  return {
    limit: async () => rows.slice(0, 1),
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
}

type FakeDbOptions = {
  selectQueue: unknown[][]
  updateReturning?: unknown[]
  insertReturning?: unknown[]
}

function fakeDb(options: FakeDbOptions) {
  const selectQueue = [...options.selectQueue]
  const updates: Array<{ set: Record<string, unknown> }> = []
  const inserts: Array<Record<string, unknown>> = []

  const db = {
    select() {
      const chain = {
        from() {
          return chain
        },
        where() {
          const rows = (selectQueue.shift() ?? []) as unknown[]
          return thenableRows(rows)
        },
      }
      return chain
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          updates.push({ set: values })
          return {
            where() {
              const rows = options.updateReturning ?? []
              return {
                returning: async () => rows,
                then: Promise.resolve(undefined).then.bind(
                  Promise.resolve(undefined)
                ),
              }
            },
          }
        },
      }
    },
    insert() {
      return {
        values(row: Record<string, unknown>) {
          inserts.push(row)
          const rows = options.insertReturning ?? []
          return {
            onConflictDoNothing() {
              return {
                returning: async () => rows,
              }
            },
            returning: async () => rows,
          }
        },
      }
    },
    async transaction<T>(fn: (tx: Database) => Promise<T>): Promise<T> {
      return fn(db as unknown as Database)
    },
  }

  return { db: db as unknown as Database, updates, inserts }
}

const EMAIL = "Pat.Lee@Example.com"
const EMAIL_HASH = hashEmail(EMAIL)
const RECIPIENT_ID = "01900000-0000-7000-8000-000000000109"

function recipientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RECIPIENT_ID,
    email: normaliseEmail(EMAIL),
    emailHash: EMAIL_HASH,
    firstName: "Pat",
    lastName: "Lee",
    externalUserId: "ext-1",
    tier: "standard",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    lastEmailedAt: null,
    tierUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

describe("privacy helpers", () => {
  it("uses the email hash as the erased address", () => {
    expect(privacyErasedEmail("deadbeef")).toBe("deadbeef")
  })

  it("prefers hard_bounce when keeping one active suppression", () => {
    const kept = pickSuppressionToKeep([
      entry({ id: "1", source: "manual" }),
      entry({ id: "2", source: "hard_bounce" }),
      entry({
        id: "3",
        source: "optizmo",
        removedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ])
    expect(kept?.id).toBe("2")
  })

  it("falls back to the first active row when sources are unknown order", () => {
    const kept = pickSuppressionToKeep([
      entry({ id: "only", source: "manual" }),
    ])
    expect(kept?.id).toBe("only")
  })

  it("returns null when every suppression is removed", () => {
    expect(
      pickSuppressionToKeep([
        entry({
          id: "1",
          source: "manual",
          removedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
      ])
    ).toBeNull()
  })

  it("exposes the privacy erasure reason constant", () => {
    expect(PRIVACY_ERASURE_REASON).toBe("privacy_erasure")
  })
})

describe("exportPrivacyData", () => {
  beforeEach(() => {
    writeAudit.mockClear()
  })

  it("throws not found when the recipient is missing", async () => {
    const { db } = fakeDb({
      selectQueue: [[], [], []],
    })
    await expect(exportPrivacyData(db, EMAIL)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === "not_found"
    )
  })

  it("exports recipient relations and writes an audit row", async () => {
    const row = recipientRow()
    const { db } = fakeDb({
      selectQueue: [
        [row],
        [
          {
            id: "pref-1",
            recipientId: RECIPIENT_ID,
            categoryId: "cat-1",
            optedOut: true,
            source: "admin",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        ],
        [
          {
            id: "msg-1",
            sendId: null,
            offerId: null,
            emailType: "thank_you",
            status: "sent",
            skipReason: null,
            failureReason: null,
            sesMessageId: null,
            environment: "production",
            queuedAt: null,
            sentAt: new Date("2026-01-03T00:00:00.000Z"),
            createdAt: new Date("2026-01-03T00:00:00.000Z"),
            updatedAt: new Date("2026-01-03T00:00:00.000Z"),
            mergeData: { email: EMAIL },
          },
        ],
        [
          {
            id: "fb-1",
            messageId: "msg-1",
            source: "provider_fbl",
            provider: "ses",
            status: "pending",
            decision: null,
            createdAt: new Date("2026-01-04T00:00:00.000Z"),
            updatedAt: new Date("2026-01-04T00:00:00.000Z"),
          },
        ],
        [
          entry({
            id: "sup-1",
            source: "manual",
            emailHash: EMAIL_HASH,
            recipientId: RECIPIENT_ID,
          }),
        ],
      ],
    })

    const exported = await exportPrivacyData(db, EMAIL)
    expect(exported.email_hash).toBe(EMAIL_HASH)
    expect(exported.recipient.email).toBe(normaliseEmail(EMAIL))
    expect(exported.preferences).toHaveLength(1)
    expect(exported.messages).toHaveLength(1)
    expect(exported.messages[0]).not.toHaveProperty("merge_data")
    expect(exported.feedback_items).toHaveLength(1)
    expect(exported.suppressions).toHaveLength(1)
    expect(writeAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: "recipient.privacy.export",
        objectId: RECIPIENT_ID,
      })
    )
  })

  it("resolves an already-erased recipient by email hash", async () => {
    const row = recipientRow({ email: EMAIL_HASH })
    const { db } = fakeDb({
      selectQueue: [[], [row], [], [], [], []],
    })
    const exported = await exportPrivacyData(db, EMAIL)
    expect(exported.recipient.id).toBe(RECIPIENT_ID)
    expect(exported.recipient.email).toBe(EMAIL_HASH)
  })
})

describe("erasePrivacyData", () => {
  beforeEach(() => {
    writeAudit.mockClear()
  })

  it("throws not found when the recipient is missing", async () => {
    const { db } = fakeDb({ selectQueue: [[], [], []] })
    await expect(erasePrivacyData(db, EMAIL)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === "not_found"
    )
  })

  it("hashes the email, clears PII, keeps one suppression, and audits", async () => {
    const row = recipientRow()
    const updated = {
      ...row,
      email: EMAIL_HASH,
      firstName: null,
      lastName: null,
      externalUserId: null,
      status: "bounced",
    }
    const keep = entry({
      id: "sup-keep",
      source: "hard_bounce",
      emailHash: EMAIL_HASH,
      recipientId: RECIPIENT_ID,
    })
    const drop = entry({
      id: "sup-drop",
      source: "manual",
      emailHash: EMAIL_HASH,
      recipientId: RECIPIENT_ID,
    })

    const { db, updates, inserts } = fakeDb({
      selectQueue: [
        [row],
        [
          {
            id: "msg-1",
            mergeData: {
              email: EMAIL,
              first_name: "Pat",
              campaign: "welcome",
              score: 3,
            },
          },
          {
            id: "msg-2",
            mergeData: { campaign: "keep" },
          },
        ],
        [keep, drop],
      ],
      updateReturning: [updated],
    })

    const result = await erasePrivacyData(db, EMAIL)
    expect(result.email_hash).toBe(EMAIL_HASH)
    expect(result.erased_email).toBe(EMAIL_HASH)
    expect(result.suppression_id).toBe("sup-keep")
    expect(result.suppressions_removed).toBe(1)
    expect(result.messages_scrubbed).toBe(1)
    expect(inserts).toHaveLength(0)
    expect(updates.some((u) => u.set.email === EMAIL_HASH)).toBe(true)
    expect(updates.some((u) => u.set.removedAt instanceof Date)).toBe(true)
    expect(writeAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: "recipient.privacy.erase",
        objectId: RECIPIENT_ID,
      })
    )
  })

  it("inserts a manual suppression when none are active", async () => {
    const row = recipientRow({ firstName: null, lastName: null })
    const updated = {
      ...row,
      email: EMAIL_HASH,
      externalUserId: null,
      status: "bounced",
    }
    const inserted = entry({
      id: "sup-new",
      source: "manual",
      reason: PRIVACY_ERASURE_REASON,
      emailHash: EMAIL_HASH,
      recipientId: RECIPIENT_ID,
    })

    const { db, inserts } = fakeDb({
      selectQueue: [[row], [], []],
      updateReturning: [updated],
      insertReturning: [inserted],
    })

    const result = await erasePrivacyData(db, EMAIL)
    expect(result.suppression_id).toBe("sup-new")
    expect(inserts[0]).toMatchObject({
      emailHash: EMAIL_HASH,
      source: "manual",
      reason: PRIVACY_ERASURE_REASON,
      scope: "global",
    })
  })

  it("throws conflict when the recipient update returns nothing", async () => {
    const row = recipientRow()
    const { db } = fakeDb({
      selectQueue: [[row]],
      updateReturning: [],
    })
    await expect(erasePrivacyData(db, EMAIL)).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === "conflict"
    )
  })
})
