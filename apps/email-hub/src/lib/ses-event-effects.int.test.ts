import { randomUUID } from "node:crypto"

import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
  auditLog,
  feedbackItem,
  message,
  recipient,
  suppressionEntry,
} from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { createMessage, createRecipient } from "@workspace/db/test"
import { hashEmail } from "@workspace/shared"

import {
  applySesNotificationEvent,
  feedbackDedupeHash,
} from "./ses-event-effects.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

describe.skipIf(!databaseUrl)("SES hard bounce and complaint (int)", () => {
  it("hard-bounces a known message: recipient, suppression, audit", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const email = `t047-bounce-${suffix}@example.com`
    const sesMessageId = `ses-t047-bounce-${suffix}`

    const person = await createRecipient(db, { email })
    const row = await createMessage(db, {
      recipientId: person.id,
      status: "sent",
    })
    await db.update(message).set({ sesMessageId }).where(eq(message.id, row.id))

    await applySesNotificationEvent(
      {
        eventType: "Bounce",
        sesMessageId,
        bounceType: "Permanent",
        recipientEmails: [email],
      },
      "bounced"
    )

    const [updatedRecipient] = await db
      .select()
      .from(recipient)
      .where(eq(recipient.id, person.id))
    expect(updatedRecipient?.status).toBe("bounced")

    const [updatedMessage] = await db
      .select()
      .from(message)
      .where(eq(message.id, row.id))
    expect(updatedMessage?.status).toBe("bounced")

    const suppressions = await db
      .select()
      .from(suppressionEntry)
      .where(
        and(
          eq(suppressionEntry.emailHash, hashEmail(email)),
          eq(suppressionEntry.source, "hard_bounce"),
          isNull(suppressionEntry.removedAt)
        )
      )
    expect(suppressions).toHaveLength(1)
    expect(suppressions[0]).toMatchObject({
      scope: "global",
      recipientId: person.id,
    })

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, person.id))
    expect(
      audits.some((entry) => entry.action === "recipient.hard_bounce")
    ).toBe(true)
  })

  it("creates a pending feedback_item for a known complaint and suppresses nothing", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const email = `t047-complaint-${suffix}@example.com`
    const sesMessageId = `ses-t047-complaint-${suffix}`

    const person = await createRecipient(db, { email })
    const row = await createMessage(db, {
      recipientId: person.id,
      status: "delivered",
    })
    await db.update(message).set({ sesMessageId }).where(eq(message.id, row.id))

    await applySesNotificationEvent(
      {
        eventType: "Complaint",
        sesMessageId,
        bounceType: null,
        recipientEmails: [email],
      },
      "complained"
    )

    const items = await db
      .select()
      .from(feedbackItem)
      .where(
        eq(
          feedbackItem.dedupeHash,
          feedbackDedupeHash(sesMessageId, "Complaint")
        )
      )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      recipientId: person.id,
      messageId: row.id,
      source: "provider_fbl",
      status: "pending",
      provider: "ses",
    })

    const [updatedRecipient] = await db
      .select()
      .from(recipient)
      .where(eq(recipient.id, person.id))
    expect(updatedRecipient?.status).toBe("active")

    const suppressions = await db
      .select()
      .from(suppressionEntry)
      .where(eq(suppressionEntry.emailHash, hashEmail(email)))
    expect(suppressions).toHaveLength(0)
  })

  it("hard-suppresses by email when SES message id is unknown", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const email = `t047-orphan-bounce-${suffix}@example.com`
    const person = await createRecipient(db, { email })

    await applySesNotificationEvent(
      {
        eventType: "Bounce",
        sesMessageId: `ses-missing-${suffix}`,
        bounceType: null,
        recipientEmails: [email],
      },
      "bounced"
    )

    const [updatedRecipient] = await db
      .select()
      .from(recipient)
      .where(eq(recipient.id, person.id))
    expect(updatedRecipient?.status).toBe("bounced")

    const suppressions = await db
      .select()
      .from(suppressionEntry)
      .where(
        and(
          eq(suppressionEntry.emailHash, hashEmail(email)),
          eq(suppressionEntry.source, "hard_bounce"),
          isNull(suppressionEntry.removedAt)
        )
      )
    expect(suppressions).toHaveLength(1)
  })

  it("creates an orphan feedback_item when complaint SES message id is unknown", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const sesMessageId = `ses-orphan-complaint-${suffix}`

    await applySesNotificationEvent(
      {
        eventType: "Complaint",
        sesMessageId,
        bounceType: null,
        recipientEmails: [],
      },
      "complained"
    )

    const items = await db
      .select()
      .from(feedbackItem)
      .where(
        eq(
          feedbackItem.dedupeHash,
          feedbackDedupeHash(sesMessageId, "Complaint")
        )
      )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      recipientId: null,
      messageId: null,
      status: "pending",
      source: "provider_fbl",
    })
  })
})
