import { beforeEach, describe, expect, it, vi } from "vitest"

import { auditLog, feedbackItem, suppressionEntry } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import { hashEmail } from "@workspace/shared"

import {
  applyComplaintEffects,
  applyHardBounceEffects,
  applySesNotificationEvent,
  feedbackDedupeHash,
  isComplaintEvent,
  isHardBounceEvent,
  type ParsedSesEvent,
  type SesMessageContext,
} from "@/lib/ses-event-effects"

const RECIPIENT_ID = "01900000-0000-7000-8000-000000000011"
const MESSAGE_ID = "01900000-0000-7000-8000-000000000022"
const EMAIL = "bounce@example.com"
const EMAIL_HASH = hashEmail(EMAIL)
const SES_ID = "0100018c-ses-message-id"

const ctx: SesMessageContext = {
  messageId: MESSAGE_ID,
  recipientId: RECIPIENT_ID,
  emailHash: EMAIL_HASH,
  recipientStatus: "active",
}

function hardBounceEvent(
  bounceType: string | null = "Permanent",
  emails: string[] = [EMAIL]
): ParsedSesEvent {
  return {
    eventType: "Bounce",
    sesMessageId: SES_ID,
    bounceType,
    recipientEmails: emails,
  }
}

function complaintEvent(emails: string[] = [EMAIL]): ParsedSesEvent {
  return {
    eventType: "Complaint",
    sesMessageId: SES_ID,
    bounceType: null,
    recipientEmails: emails,
  }
}

function createEffectsDb(options?: {
  messageContext?: SesMessageContext | null
  emailContext?: SesMessageContext | null
}) {
  const recipientUpdates: Record<string, unknown>[] = []
  const suppressionInserts: Record<string, unknown>[] = []
  const feedbackInserts: Record<string, unknown>[] = []
  const auditInserts: Record<string, unknown>[] = []
  const messageUpdates: Record<string, unknown>[] = []
  const onConflictDoNothing = vi.fn(async () => undefined)

  const tx = {
    update() {
      return {
        set(values: Record<string, unknown>) {
          return {
            async where() {
              messageUpdates.push(values)
              if (values.status === "bounced") {
                recipientUpdates.push(values)
              }
            },
          }
        },
      }
    },
    insert(table: unknown) {
      return {
        values(row: Record<string, unknown>) {
          if (table === suppressionEntry) {
            suppressionInserts.push(row)
            return { onConflictDoNothing }
          }
          if (table === feedbackItem) {
            feedbackInserts.push(row)
            return { onConflictDoNothing }
          }
          if (table === auditLog) {
            auditInserts.push(row)
            return {
              returning: async () => [
                {
                  id: "01900000-0000-7000-8000-0000000000aa",
                  createdAt: new Date("2026-10-29T00:00:00.000Z"),
                  ...row,
                },
              ],
            }
          }
          throw new Error("unexpected insert table")
        },
      }
    },
    select() {
      return {
        from() {
          return {
            innerJoin() {
              return {
                where() {
                  return {
                    limit: async () =>
                      options?.messageContext ? [options.messageContext] : [],
                  }
                },
              }
            },
            where() {
              return {
                limit: async () =>
                  options?.emailContext
                    ? [
                        {
                          recipientId: options.emailContext.recipientId,
                          emailHash: options.emailContext.emailHash,
                          recipientStatus: options.emailContext.recipientStatus,
                        },
                      ]
                    : [],
              }
            },
          }
        },
      }
    },
  }

  const db = {
    ...tx,
    transaction: async (fn: (inner: typeof tx) => Promise<void>) => fn(tx),
  }

  return {
    db: db as unknown as Database,
    recipientUpdates,
    suppressionInserts,
    feedbackInserts,
    auditInserts,
    messageUpdates,
    onConflictDoNothing,
  }
}

describe("SES event classifiers", () => {
  it("treats Permanent and missing bounceType as bounce_hard", () => {
    expect(isHardBounceEvent(hardBounceEvent("Permanent"))).toBe(true)
    expect(isHardBounceEvent(hardBounceEvent("permanent"))).toBe(true)
    expect(isHardBounceEvent(hardBounceEvent(null))).toBe(true)
    expect(isHardBounceEvent(hardBounceEvent(""))).toBe(true)
  })

  it("treats Transient and Undetermined as soft", () => {
    expect(isHardBounceEvent(hardBounceEvent("Transient"))).toBe(false)
    expect(isHardBounceEvent(hardBounceEvent("Undetermined"))).toBe(false)
    expect(isHardBounceEvent(complaintEvent())).toBe(false)
  })

  it("detects complaint events", () => {
    expect(isComplaintEvent(complaintEvent())).toBe(true)
    expect(isComplaintEvent(hardBounceEvent())).toBe(false)
  })

  it("builds a stable feedback dedupe hash from SES id and event type", () => {
    expect(feedbackDedupeHash(SES_ID, "Complaint")).toBe(
      feedbackDedupeHash(SES_ID, "complaint")
    )
    expect(feedbackDedupeHash(SES_ID, "Complaint")).not.toBe(
      feedbackDedupeHash("other", "Complaint")
    )
  })
})

describe("applyHardBounceEffects", () => {
  it("sets recipient bounced, inserts hard_bounce suppression, writes audit", async () => {
    const harness = createEffectsDb()

    await applyHardBounceEffects(harness.db, ctx)

    expect(harness.recipientUpdates).toEqual([
      expect.objectContaining({ status: "bounced" }),
    ])
    expect(harness.suppressionInserts).toEqual([
      expect.objectContaining({
        emailHash: EMAIL_HASH,
        recipientId: RECIPIENT_ID,
        scope: "global",
        source: "hard_bounce",
      }),
    ])
    expect(harness.onConflictDoNothing).toHaveBeenCalled()
    expect(harness.auditInserts).toEqual([
      expect.objectContaining({
        actorType: "system",
        actorId: null,
        action: "recipient.hard_bounce",
        entityType: "recipient",
        entityId: RECIPIENT_ID,
      }),
    ])
    expect(harness.feedbackInserts).toEqual([])
  })

  it("inserts suppression without a recipient when only an email hash is known", async () => {
    const harness = createEffectsDb()
    await applyHardBounceEffects(harness.db, {
      messageId: null,
      recipientId: null,
      emailHash: EMAIL_HASH,
      recipientStatus: null,
    })

    expect(harness.suppressionInserts[0]).toMatchObject({
      emailHash: EMAIL_HASH,
      recipientId: null,
      source: "hard_bounce",
    })
    expect(harness.auditInserts[0]).toMatchObject({
      entityType: "suppression_entry",
      entityId: null,
    })
  })
})

describe("applyComplaintEffects", () => {
  it("creates a pending feedback_item and does not suppress", async () => {
    const harness = createEffectsDb()

    await applyComplaintEffects(harness.db, ctx, complaintEvent())

    expect(harness.feedbackInserts).toEqual([
      expect.objectContaining({
        recipientId: RECIPIENT_ID,
        messageId: MESSAGE_ID,
        source: "provider_fbl",
        provider: "ses",
        status: "pending",
        dedupeHash: feedbackDedupeHash(SES_ID, "Complaint"),
      }),
    ])
    expect(harness.suppressionInserts).toEqual([])
    expect(harness.recipientUpdates).toEqual([])
    expect(harness.auditInserts).toEqual([])
  })

  it("creates an orphan pending feedback_item when message is unknown", async () => {
    const harness = createEffectsDb()
    await applyComplaintEffects(
      harness.db,
      {
        messageId: null,
        recipientId: null,
        emailHash: "",
        recipientStatus: null,
      },
      complaintEvent([])
    )

    expect(harness.feedbackInserts[0]).toMatchObject({
      recipientId: null,
      messageId: null,
      status: "pending",
      source: "provider_fbl",
    })
    expect(harness.suppressionInserts).toEqual([])
  })
})

describe("applySesNotificationEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("runs the hard bounce path for Permanent Bounce", async () => {
    const harness = createEffectsDb({ messageContext: ctx })

    await applySesNotificationEvent(
      hardBounceEvent("Permanent"),
      "bounced",
      harness.db
    )

    expect(harness.messageUpdates.length).toBeGreaterThan(0)
    expect(harness.suppressionInserts[0]).toMatchObject({
      source: "hard_bounce",
    })
    expect(harness.auditInserts[0]).toMatchObject({
      action: "recipient.hard_bounce",
    })
    expect(harness.feedbackInserts).toEqual([])
  })

  it("hard-suppresses Bounce events that omit bounceType", async () => {
    const harness = createEffectsDb({ messageContext: ctx })

    await applySesNotificationEvent(
      hardBounceEvent(null),
      "bounced",
      harness.db
    )

    expect(harness.suppressionInserts[0]).toMatchObject({
      source: "hard_bounce",
    })
  })

  it("does not suppress on Transient bounce", async () => {
    const harness = createEffectsDb({ messageContext: ctx })

    await applySesNotificationEvent(
      hardBounceEvent("Transient"),
      "bounced",
      harness.db
    )

    expect(harness.suppressionInserts).toEqual([])
    expect(harness.auditInserts).toEqual([])
    expect(harness.feedbackInserts).toEqual([])
  })

  it("runs the complaint path without auto-suppression", async () => {
    const harness = createEffectsDb({ messageContext: ctx })

    await applySesNotificationEvent(complaintEvent(), "complained", harness.db)

    expect(harness.feedbackInserts[0]).toMatchObject({
      status: "pending",
      source: "provider_fbl",
    })
    expect(harness.suppressionInserts).toEqual([])
    expect(harness.recipientUpdates).toEqual([])
  })

  it("creates orphan complaint feedback when SES message id is unknown", async () => {
    const harness = createEffectsDb({
      messageContext: null,
      emailContext: null,
    })

    await applySesNotificationEvent(
      complaintEvent([]),
      "complained",
      harness.db
    )

    expect(harness.feedbackInserts[0]).toMatchObject({
      recipientId: null,
      messageId: null,
      status: "pending",
    })
  })
})
