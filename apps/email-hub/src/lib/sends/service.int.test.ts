import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
  auditLog,
  message,
  offer,
  send,
  template,
  templateVersion,
} from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"
import {
  createCategory,
  createDomain,
  createMessage,
  createSender,
  createTemplate,
  createUser,
} from "@workspace/db/test"

import {
  cancelSend,
  createSend,
  deleteSend,
  getSend,
  listSends,
  scheduleSend,
  updateSend,
  type SendActor,
} from "./service.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

type Fixture = {
  db: Database
  actor: SendActor
  userId: string
  versionAId: string
  versionBId: string
  templateId: string
  draftVersionId: string
  senderId: string
  inactiveSenderId: string
  badDomainSenderId: string
  categoryId: string
  otherCategoryId: string
  offerId: string
}

async function fixture(): Promise<Fixture> {
  const db = getDb()
  const suffix = randomUUID().slice(0, 8)
  const user = await createUser(db)
  const verified = await createDomain(db, {
    name: `t072-ok-${suffix}.example.com`,
    status: "verified",
    createdBy: user.id,
  })
  const inactiveDomain = await createDomain(db, {
    name: `t072-off-${suffix}.example.com`,
    status: "inactive",
    createdBy: user.id,
  })
  const activeSender = await createSender(db, {
    domainId: verified.id,
    status: "active",
    createdBy: user.id,
    fromEmail: `ok-${suffix}@t072-ok-${suffix}.example.com`,
  })
  const inactiveSender = await createSender(db, {
    domainId: verified.id,
    status: "inactive",
    createdBy: user.id,
    fromEmail: `off-${suffix}@t072-ok-${suffix}.example.com`,
  })
  const badDomainSender = await createSender(db, {
    domainId: inactiveDomain.id,
    status: "active",
    createdBy: user.id,
    fromEmail: `bad-${suffix}@t072-off-${suffix}.example.com`,
  })
  const category = await createCategory(db, { createdBy: user.id })
  const otherCategory = await createCategory(db, { createdBy: user.id })
  const { template: published, version: versionA } = await createTemplate(db, {
    name: `t072-published-${suffix}`,
    emailType: "thank_you",
    status: "active",
    categoryId: category.id,
    createdBy: user.id,
  })
  const [versionB] = await db
    .insert(templateVersion)
    .values({
      templateId: published.id,
      versionNo: 2,
      subject: "Version B",
      bodySource: "<p>Version B</p>",
      createdBy: user.id,
    })
    .returning()
  if (!versionB) {
    throw new Error("version B was not inserted")
  }
  const { version: draftVersion } = await createTemplate(db, {
    name: `t072-draft-${suffix}`,
    emailType: "thank_you",
    status: "draft",
    categoryId: category.id,
    createdBy: user.id,
  })
  const [createdOffer] = await db
    .insert(offer)
    .values({
      name: `Offer ${suffix}`,
      externalRef: `t072-${suffix}`,
      status: "active",
    })
    .returning()
  if (!createdOffer) {
    throw new Error("offer was not inserted")
  }

  return {
    db,
    actor: { userId: user.id, requestId: `t072-${suffix}` },
    userId: user.id,
    versionAId: versionA.id,
    versionBId: versionB.id,
    templateId: published.id,
    draftVersionId: draftVersion.id,
    senderId: activeSender.id,
    inactiveSenderId: inactiveSender.id,
    badDomainSenderId: badDomainSender.id,
    categoryId: category.id,
    otherCategoryId: otherCategory.id,
    offerId: createdOffer.id,
  }
}

function ahead(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000)
}

describe.skipIf(!databaseUrl)("sends service (int)", () => {
  it("persists send columns and the draft enum without a workspace column", async () => {
    const db = getDb()
    const columns = await db.execute<{ column_name: string }>(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'send'
    `)
    const names = columns.rows.map((row) => row.column_name)
    expect(names).toEqual(
      expect.arrayContaining([
        "template_version_id",
        "sender_id",
        "category_id",
        "offer_id",
        "scheduled_for",
        "status",
        "version",
      ])
    )
    expect(names).not.toContain("workspace_id")

    const enums = await db.execute<{ enumlabel: string }>(sql`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'send_status'
      ORDER BY e.enumsortorder
    `)
    expect(enums.rows.map((row) => row.enumlabel)).toEqual([
      "draft",
      "scheduled",
      "queued",
      "dispatching",
      "completed",
      "cancelled",
      "failed",
    ])
  })

  it("creates a draft and rejects inactive senders, inactive domains, and a mismatched category", async () => {
    const fx = await fixture()
    const created = await createSend(
      {
        templateVersionId: fx.versionAId,
        senderId: fx.senderId,
        categoryId: fx.categoryId,
        offerId: fx.offerId,
        scheduledFor: ahead(30),
      },
      fx.actor,
      fx.db
    )
    expect(created).toMatchObject({
      status: "draft",
      version: 1,
      template_version_id: fx.versionAId,
      sender_id: fx.senderId,
      category_id: fx.categoryId,
      offer_id: fx.offerId,
      created_by: fx.userId,
    })

    await expect(
      createSend(
        {
          templateVersionId: fx.versionAId,
          senderId: fx.inactiveSenderId,
          categoryId: fx.categoryId,
          scheduledFor: ahead(30),
        },
        fx.actor,
        fx.db
      )
    ).rejects.toMatchObject({ code: "validation_failed", status: 422 })
    await expect(
      createSend(
        {
          templateVersionId: fx.versionAId,
          senderId: fx.badDomainSenderId,
          categoryId: fx.categoryId,
          scheduledFor: ahead(30),
        },
        fx.actor,
        fx.db
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [
        expect.objectContaining({
          message: "Sender must be on an active domain",
        }),
      ],
    })
    await expect(
      createSend(
        {
          templateVersionId: fx.versionAId,
          senderId: fx.senderId,
          categoryId: fx.otherCategoryId,
          scheduledFor: ahead(30),
        },
        fx.actor,
        fx.db
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [
        expect.objectContaining({
          message: "Category must match the template",
        }),
      ],
    })

    const audits = await fx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id))
    expect(audits).toEqual([
      expect.objectContaining({
        action: "send.create",
        actorId: fx.userId,
        entityType: "send",
      }),
    ])
    expect(JSON.stringify(audits[0]?.after)).not.toMatch(/body_source|password/)
  })

  it("updates a draft template version", async () => {
    const fx = await fixture()
    const created = await createSend(
      {
        templateVersionId: fx.versionAId,
        senderId: fx.senderId,
        categoryId: fx.categoryId,
        offerId: fx.offerId,
        scheduledFor: ahead(30),
      },
      fx.actor,
      fx.db
    )
    const updated = await updateSend(
      created.id,
      { version: 1, templateVersionId: fx.versionBId },
      fx.actor,
      fx.db
    )
    expect(updated).toMatchObject({
      template_version_id: fx.versionBId,
      offer_id: fx.offerId,
      version: 2,
      status: "draft",
    })
  })

  it("schedules a draft, pins the template version, cancels, and keeps history", async () => {
    const fx = await fixture()
    const tooSoon = await createSend(
      {
        templateVersionId: fx.versionAId,
        senderId: fx.senderId,
        categoryId: fx.categoryId,
        offerId: fx.offerId,
        scheduledFor: ahead(1),
      },
      fx.actor,
      fx.db
    )
    await expect(
      scheduleSend(tooSoon.id, tooSoon.version, fx.actor, fx.db)
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [expect.objectContaining({ path: "scheduled_for" })],
    })
    expect((await getSend(tooSoon.id, fx.db)).status).toBe("draft")

    const created = await createSend(
      {
        templateVersionId: fx.versionAId,
        senderId: fx.senderId,
        categoryId: fx.categoryId,
        scheduledFor: ahead(30),
      },
      fx.actor,
      fx.db
    )
    const scheduled = await scheduleSend(
      created.id,
      created.version,
      fx.actor,
      fx.db
    )
    expect(scheduled).toMatchObject({
      status: "scheduled",
      template_version_id: fx.versionAId,
      scheduled_for: created.scheduled_for,
    })

    await fx.db
      .update(template)
      .set({ currentVersionId: fx.versionBId })
      .where(eq(template.id, fx.templateId))
    expect((await getSend(created.id, fx.db)).template_version_id).toBe(
      fx.versionAId
    )

    await expect(
      updateSend(
        created.id,
        { version: scheduled.version, senderId: fx.senderId },
        fx.actor,
        fx.db
      )
    ).rejects.toMatchObject({
      code: "conflict",
      details: [
        expect.objectContaining({ message: "Send configuration is locked" }),
      ],
    })

    const cancelled = await cancelSend(
      created.id,
      scheduled.version,
      fx.actor,
      fx.db
    )
    expect(cancelled.status).toBe("cancelled")
    await expect(
      scheduleSend(created.id, cancelled.version, fx.actor, fx.db)
    ).rejects.toMatchObject({ code: "conflict" })
    await expect(
      deleteSend(created.id, cancelled.version, fx.actor, fx.db)
    ).rejects.toMatchObject({ code: "conflict" })
    expect((await getSend(created.id, fx.db)).status).toBe("cancelled")

    const listed = await listSends(
      { limit: 20, status: "cancelled", senderId: fx.senderId },
      fx.db
    )
    expect(listed.data.some((row) => row.id === created.id)).toBe(true)

    const audits = await fx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id))
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining(["send.create", "send.schedule", "send.cancel"])
    )
  })

  it("lets only one concurrent schedule commit", async () => {
    const fx = await fixture()
    const created = await createSend(
      {
        templateVersionId: fx.versionAId,
        senderId: fx.senderId,
        categoryId: fx.categoryId,
        scheduledFor: ahead(40),
      },
      fx.actor,
      fx.db
    )
    const raced = await Promise.allSettled([
      scheduleSend(created.id, created.version, fx.actor, fx.db),
      scheduleSend(created.id, created.version, fx.actor, fx.db),
    ])
    expect(raced.filter((row) => row.status === "fulfilled")).toHaveLength(1)
    expect(raced.filter((row) => row.status === "rejected")).toHaveLength(1)
    const [row] = await fx.db
      .select()
      .from(send)
      .where(eq(send.id, created.id))
      .limit(1)
    expect(row?.status).toBe("scheduled")
    expect(row?.version).toBe(2)
    const audits = await fx.db
      .select()
      .from(auditLog)
      .where(eq(auditLog.entityId, created.id))
    expect(
      audits.filter((entry) => entry.action === "send.schedule")
    ).toHaveLength(1)
  })

  it("deletes an unlinked draft and refuses a draft that has a message", async () => {
    const fx = await fixture()
    const created = await createSend(
      {
        templateVersionId: fx.draftVersionId,
        senderId: fx.senderId,
        categoryId: fx.categoryId,
        scheduledFor: ahead(40),
      },
      fx.actor,
      fx.db
    )
    await expect(
      scheduleSend(created.id, created.version, fx.actor, fx.db)
    ).rejects.toMatchObject({ code: "validation_failed" })
    const removed = await deleteSend(
      created.id,
      created.version,
      fx.actor,
      fx.db
    )
    expect(removed.status).toBe("draft")
    await expect(getSend(created.id, fx.db)).rejects.toMatchObject({
      code: "not_found",
    })

    const linked = await createSend(
      {
        templateVersionId: fx.versionAId,
        senderId: fx.senderId,
        categoryId: fx.categoryId,
        scheduledFor: ahead(50),
      },
      fx.actor,
      fx.db
    )
    const linkedMessage = await createMessage(fx.db, {
      senderId: fx.senderId,
      templateVersionId: fx.versionAId,
      emailType: "thank_you",
      status: "skipped",
      skipReason: "frequency_cap",
    })
    await fx.db
      .update(message)
      .set({ sendId: linked.id })
      .where(eq(message.id, linkedMessage.id))
    await expect(
      deleteSend(linked.id, linked.version, fx.actor, fx.db)
    ).rejects.toMatchObject({ code: "conflict" })
    expect((await getSend(linked.id, fx.db)).id).toBe(linked.id)
  })

  it("rejects a stale version before writing", async () => {
    const fx = await fixture()
    const created = await createSend(
      {
        templateVersionId: fx.versionAId,
        senderId: fx.senderId,
        categoryId: fx.categoryId,
        scheduledFor: ahead(30),
      },
      fx.actor,
      fx.db
    )
    await fx.db.update(send).set({ version: 2 }).where(eq(send.id, created.id))
    await expect(
      updateSend(
        created.id,
        { version: 1, templateVersionId: fx.versionBId },
        fx.actor,
        fx.db
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
    const [row] = await fx.db
      .select()
      .from(send)
      .where(eq(send.id, created.id))
      .limit(1)
    expect(row?.version).toBe(2)
    expect(row?.templateVersionId).toBe(fx.versionAId)
  })
})
