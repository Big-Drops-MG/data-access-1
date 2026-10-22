import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  domain,
  emailCategory,
  message,
  recipient,
  sender,
  template,
  templateVersion,
  user,
} from "@workspace/db"
import { getDb, getPool } from "@workspace/db/client"
import { count, eq } from "drizzle-orm"

import {
  triggerEmail,
  type TriggerEmailCreateContext,
} from "./trigger-email.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

describe.skipIf(!databaseUrl)("triggerEmail (int)", () => {
  const suffix = randomUUID().slice(0, 8)
  let templateVersionId = ""
  let senderId = ""
  let seeded = false

  beforeAll(async () => {
    try {
      const db = getDb()
      const [staff] = await db
        .insert(user)
        .values({
          email: `t026-staff-${suffix}@example.com`,
          name: "T-026 Staff",
          role: "admin",
          status: "active",
        })
        .returning()

      if (!staff) {
        throw new Error("failed to seed user")
      }

      const [category] = await db
        .insert(emailCategory)
        .values({
          key: `t026_${suffix}`,
          name: "T-026 category",
          kind: "transactional",
        })
        .returning()

      if (!category) {
        throw new Error("failed to seed category")
      }

      const [tpl] = await db
        .insert(template)
        .values({
          name: `t026-template-${suffix}`,
          emailType: "thank_you",
          categoryId: category.id,
          status: "active",
          createdBy: staff.id,
        })
        .returning()

      if (!tpl) {
        throw new Error("failed to seed template")
      }

      const [version] = await db
        .insert(templateVersion)
        .values({
          templateId: tpl.id,
          versionNo: 1,
          subject: "Hello {{name}}",
          bodySource: "<p>Hello</p>",
          mergeTags: { name: "string" },
          createdBy: staff.id,
        })
        .returning()

      if (!version) {
        throw new Error("failed to seed template version")
      }

      await db
        .update(template)
        .set({ currentVersionId: version.id })
        .where(eq(template.id, tpl.id))

      templateVersionId = version.id

      const [dom] = await db
        .insert(domain)
        .values({
          name: `t026-${suffix}.example.com`,
          status: "verified",
          createdBy: staff.id,
        })
        .returning()

      if (!dom) {
        throw new Error("failed to seed domain")
      }

      const [from] = await db
        .insert(sender)
        .values({
          domainId: dom.id,
          fromName: "T-026",
          fromEmail: `noreply-${suffix}@t026.example.com`,
          status: "active",
          createdBy: staff.id,
        })
        .returning()

      if (!from) {
        throw new Error("failed to seed sender")
      }

      senderId = from.id
      seeded = true
    } catch (error) {
      console.warn(
        "[triggerEmail int] seed skipped (need app-role DATABASE_URL):",
        error
      )
    }
  }, 60_000)

  afterAll(async () => {
    if (!seeded) {
      return
    }
    await getPool().end()
  })

  it("creates one message for two parallel calls with the same idempotency key", async ({
    skip,
  }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const idempotencyKey = `t026-parallel-${suffix}`
    const email = `Person+${suffix}@Example.COM`

    const createMessage = async ({
      tx,
      recipient: row,
      idempotencyKey: key,
    }: TriggerEmailCreateContext) => {
      // Hold the lock briefly so the sibling call waits on the advisory lock.
      await new Promise((resolve) => setTimeout(resolve, 50))
      const [created] = await tx
        .insert(message)
        .values({
          recipientId: row.id,
          emailType: "thank_you",
          templateVersionId,
          senderId,
          idempotencyKey: key,
          status: "queued",
          queuedAt: new Date(),
        })
        .returning()
      if (!created) {
        throw new Error("insert message failed")
      }
      return created
    }

    const [first, second] = await Promise.all([
      triggerEmail(
        db,
        { email, idempotencyKey, externalUserId: `ext-${suffix}` },
        createMessage
      ),
      triggerEmail(
        db,
        { email, idempotencyKey, externalUserId: `ext-${suffix}` },
        createMessage
      ),
    ])

    expect(first.message.id).toBe(second.message.id)
    expect([first.created, second.created].filter(Boolean)).toHaveLength(1)

    const [{ value: messageCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(message)
      .where(eq(message.idempotencyKey, idempotencyKey))

    expect(messageCount).toBe(1)

    const recipients = await db
      .select()
      .from(recipient)
      .where(eq(recipient.email, `person+${suffix}@example.com`))

    expect(recipients).toHaveLength(1)
    expect(recipients[0]?.emailHash).toMatch(/^[a-f0-9]{64}$/)
  }, 60_000)
})
