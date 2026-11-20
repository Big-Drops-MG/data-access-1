import { randomUUID } from "node:crypto"

import { auditLog, message, recipient, suppressionEntry } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { createMessage, createRecipient } from "@workspace/db/test"
import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, inject, it } from "vitest"

import { hashEmail, normaliseEmail } from "./email.js"
import { erasePrivacyData, exportPrivacyData } from "./privacy.js"

const templateName = inject("emailhubTemplateDatabase")

describe.skipIf(!templateName)("privacy export/erase (int)", () => {
  it("exports recipient data and erases while keeping suppression", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const email = `t109-${suffix}@example.com`
    const created = await createRecipient(db, {
      email,
      externalUserId: `ext-${suffix}`,
    })
    await db
      .update(recipient)
      .set({ firstName: "Pat", lastName: "Lee" })
      .where(eq(recipient.id, created.id))

    await createMessage(db, {
      recipientId: created.id,
      status: "sent",
      mergeData: {
        email,
        first_name: "Pat",
        campaign: "welcome",
      },
    })

    const exported = await exportPrivacyData(db, email)
    expect(exported.recipient.id).toBe(created.id)
    expect(exported.recipient.email).toBe(normaliseEmail(email))
    expect(exported.messages).toHaveLength(1)
    expect(exported.messages[0]).not.toHaveProperty("merge_data")

    const erased = await erasePrivacyData(db, email)
    expect(erased.email_hash).toBe(hashEmail(email))
    expect(erased.erased_email).toBe(hashEmail(email))
    expect(erased.suppression_id).toBeTruthy()

    const [after] = await db
      .select()
      .from(recipient)
      .where(eq(recipient.id, created.id))
      .limit(1)
    expect(after?.email).toBe(hashEmail(email))
    expect(after?.emailHash).toBe(hashEmail(email))
    expect(after?.firstName).toBeNull()
    expect(after?.lastName).toBeNull()
    expect(after?.externalUserId).toBeNull()
    expect(after?.status).toBe("bounced")

    const active = await db
      .select()
      .from(suppressionEntry)
      .where(
        and(
          eq(suppressionEntry.emailHash, hashEmail(email)),
          isNull(suppressionEntry.removedAt)
        )
      )
    expect(active.length).toBeGreaterThanOrEqual(1)

    const [msg] = await db
      .select()
      .from(message)
      .where(eq(message.recipientId, created.id))
      .limit(1)
    expect(msg?.mergeData).toEqual({ campaign: "welcome" })

    const audits = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id))
    expect(
      audits.some((row) => row.action === "recipient.privacy.export")
    ).toBe(true)
    expect(audits.some((row) => row.action === "recipient.privacy.erase")).toBe(
      true
    )
  })
})
