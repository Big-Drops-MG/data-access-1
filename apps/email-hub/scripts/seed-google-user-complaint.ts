/**
 * One-shot local test: insert a Gmail SES complaint into feedback_item
 * the same way the SES webhook path does (applySesNotificationEvent).
 *
 * Usage (from repo root, with Hub .env loaded):
 *   npx tsx --tsconfig apps/email-hub/tsconfig.json apps/email-hub/scripts/seed-google-user-complaint.ts
 */
import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { feedbackItem, message } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { createMessage, createRecipient } from "@workspace/db/test"

import {
  applySesNotificationEvent,
  feedbackDedupeHash,
  resolveComplaintProvider,
} from "../src/lib/ses-event-effects.js"

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("DATABASE_URL is required")
  }

  const db = getDb()
  const suffix = randomUUID().slice(0, 8)
  const email = `local-google-complaint-${suffix}@gmail.com`
  const sesMessageId = `ses-local-google-complaint-${suffix}`

  const event = {
    eventType: "Complaint",
    sesMessageId,
    bounceType: null,
    complaintFeedbackType: "abuse",
    recipientEmails: [email],
  }

  const provider = resolveComplaintProvider(event)
  if (provider !== "google") {
    throw new Error(`expected provider google, got ${provider}`)
  }

  const person = await createRecipient(db, { email })
  const row = await createMessage(db, {
    recipientId: person.id,
    status: "delivered",
  })
  await db.update(message).set({ sesMessageId }).where(eq(message.id, row.id))

  await applySesNotificationEvent(event, "complained")

  const [item] = await db
    .select()
    .from(feedbackItem)
    .where(
      eq(feedbackItem.dedupeHash, feedbackDedupeHash(sesMessageId, "Complaint"))
    )
    .limit(1)

  if (!item) {
    throw new Error("feedback_item was not created")
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        feedbackId: item.id,
        provider: item.provider,
        source: item.source,
        status: item.status,
        recipientEmail: email,
        complaintsUrl: `/complaints/${item.id}`,
      },
      null,
      2
    )}\n`
  )
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  )
  process.exit(1)
})
