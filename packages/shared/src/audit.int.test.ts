import { randomUUID } from "node:crypto"

import { auditLog, user } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { eq } from "drizzle-orm"
import { describe, expect, inject, it } from "vitest"

import { writeAudit } from "./audit.js"
import { maskEmail } from "./email.js"

const templateName = inject("emailhubTemplateDatabase")

describe.skipIf(!templateName)("writeAudit (int)", () => {
  it("commits with a real user write, stores sequential redacted rows, and rolls back together", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const email = `t043-${suffix}@example.com`
    const requestId = `t043-${suffix}`

    let userId = ""
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(user)
        .values({
          email,
          name: "T-043",
          role: "admin",
          status: "active",
        })
        .returning({ id: user.id })
      if (!created) {
        throw new Error("failed to create user")
      }
      userId = created.id
      await writeAudit(tx, {
        actor: { type: "user", id: userId },
        action: "user.create",
        objectType: "user",
        objectId: userId,
        requestId,
        before: null,
        after: {
          email,
          password: "super-secret",
          access_token: "raw-token",
          apiKey: "key-1",
          note: "ping jane@example.com",
          nested: [{ replyTo: "help@example.com" }],
        },
      })
      await writeAudit(tx, {
        actor: { type: "system" },
        action: "user.job_title_set",
        objectType: "user",
        objectId: userId,
        requestId: `${requestId}-2`,
        before: { jobTitle: null },
        after: { jobTitle: "Admin" },
      })
    })

    const stored = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, userId))

    expect(stored).toHaveLength(2)
    const createdAudit = stored.find((row) => row.action === "user.create")
    const followUp = stored.find((row) => row.action === "user.job_title_set")
    expect(createdAudit).toMatchObject({
      actorType: "user",
      actorId: userId,
      entityType: "user",
      entityId: userId,
      requestId,
      before: null,
    })
    expect(createdAudit?.after).toEqual({
      email: maskEmail(email),
      note: "ping ja***@example.com",
      nested: [{ replyTo: "he***@example.com" }],
    })
    expect(JSON.stringify(createdAudit?.after)).not.toContain("super-secret")
    expect(JSON.stringify(createdAudit?.after)).not.toContain("raw-token")
    expect(JSON.stringify(createdAudit?.after)).not.toContain("key-1")
    expect(followUp).toMatchObject({
      actorType: "system",
      actorId: null,
      requestId: `${requestId}-2`,
      before: { jobTitle: null },
      after: { jobTitle: "Admin" },
    })

    const rollbackEmail = `t043-rb-${suffix}@example.com`
    const rollbackRequest = `t043-rb-${suffix}`
    await expect(
      db.transaction(async (tx) => {
        const [created] = await tx
          .insert(user)
          .values({
            email: rollbackEmail,
            name: "T-043 rollback",
            role: "viewer",
            status: "active",
          })
          .returning({ id: user.id })
        await writeAudit(tx, {
          actor: { type: "system" },
          action: "user.create",
          objectType: "user",
          objectId: created?.id ?? null,
          requestId: rollbackRequest,
          after: { email: rollbackEmail, password: "super-secret" },
        })
        throw new Error("rollback")
      })
    ).rejects.toThrow("rollback")

    const rolledBack = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(eq(auditLog.requestId, rollbackRequest))
    expect(rolledBack).toEqual([])

    const leftover = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, rollbackEmail))
    expect(leftover).toEqual([])
  })
})
