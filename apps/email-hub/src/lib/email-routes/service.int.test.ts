import { randomUUID } from "node:crypto"

import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { emailRoute, offer } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import {
  createDomain,
  createSender,
  createTemplate,
  createUser,
} from "@workspace/db/test"

import { resolveEmailRoute } from "@workspace/shared"

import {
  archiveEmailRoute,
  createEmailRoute,
  updateEmailRoute,
} from "./service.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

describe.skipIf(!databaseUrl)("email routes service (int)", () => {
  it("rejects a draft template, an inactive sender, and a sender on an inactive domain", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const verified = await createDomain(db, {
      name: `t060-ok-${suffix}.example.com`,
      status: "verified",
      createdBy: user.id,
    })
    const activeSender = await createSender(db, {
      domainId: verified.id,
      status: "active",
      createdBy: user.id,
      fromEmail: `ok-${suffix}@t060-ok-${suffix}.example.com`,
    })
    const { template: published } = await createTemplate(db, {
      name: `t060-published-${suffix}`,
      emailType: "thank_you",
      status: "active",
      createdBy: user.id,
    })
    const { template: draft } = await createTemplate(db, {
      name: `t060-draft-${suffix}`,
      emailType: "thank_you",
      status: "draft",
      createdBy: user.id,
    })

    await expect(
      createEmailRoute(
        {
          emailType: "thank_you",
          templateId: draft.id,
          senderId: activeSender.id,
        },
        { userId: user.id },
        db
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      status: 422,
      details: [
        expect.objectContaining({
          path: "template_id",
          message: "Template must be published",
        }),
      ],
    })

    const inactiveSender = await createSender(db, {
      domainId: verified.id,
      status: "inactive",
      createdBy: user.id,
      fromEmail: `off-${suffix}@t060-ok-${suffix}.example.com`,
    })
    await expect(
      createEmailRoute(
        {
          emailType: "thank_you",
          templateId: published.id,
          senderId: inactiveSender.id,
        },
        { userId: user.id },
        db
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [
        expect.objectContaining({
          path: "sender_id",
          message: "Sender must be active",
        }),
      ],
    })

    const pending = await createDomain(db, {
      name: `t060-pending-${suffix}.example.com`,
      status: "pending",
      createdBy: user.id,
    })
    const senderOnPending = await createSender(db, {
      domainId: pending.id,
      status: "active",
      createdBy: user.id,
      fromEmail: `pending-${suffix}@t060-pending-${suffix}.example.com`,
    })
    await expect(
      createEmailRoute(
        {
          emailType: "thank_you",
          templateId: published.id,
          senderId: senderOnPending.id,
        },
        { userId: user.id },
        db
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [
        expect.objectContaining({
          path: "sender_id",
          message: "Sender must be on an active domain",
        }),
      ],
    })
  })

  it("returns 409 for a second active (email_type, offer_id) and allows another after archive", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const verified = await createDomain(db, {
      name: `t060-route-${suffix}.example.com`,
      status: "verified",
      createdBy: user.id,
    })
    const activeSender = await createSender(db, {
      domainId: verified.id,
      status: "active",
      createdBy: user.id,
      fromEmail: `route-${suffix}@t060-route-${suffix}.example.com`,
    })
    const { template: published } = await createTemplate(db, {
      name: `t060-route-${suffix}`,
      emailType: "engagement",
      status: "active",
      createdBy: user.id,
    })
    const [createdOffer] = await db
      .insert(offer)
      .values({
        name: `T060 ${suffix}`,
        externalRef: `t060-${suffix}`,
      })
      .returning()
    if (!createdOffer) {
      throw new Error("offer was not created")
    }

    const input = {
      emailType: "engagement" as const,
      offerId: createdOffer.id,
      templateId: published.id,
      senderId: activeSender.id,
    }
    const actor = { userId: user.id, requestId: `t060-${suffix}` }

    const created = await createEmailRoute(input, actor, db)
    expect(created.status).toBe("active")
    expect(created.version).toBe(1)
    expect(created.offer_id).toBe(createdOffer.id)

    await expect(createEmailRoute(input, actor, db)).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: expect.arrayContaining([
        expect.objectContaining({ path: "email_route", message: created.id }),
        expect.objectContaining({
          path: "offer_id",
          message: createdOffer.id,
        }),
      ]),
    })

    const archived = await updateEmailRoute(
      created.id,
      { version: created.version, status: "inactive" },
      actor,
      db
    )
    expect(archived.status).toBe("inactive")
    expect(archived.version).toBe(2)

    const [stored] = await db
      .select()
      .from(emailRoute)
      .where(eq(emailRoute.id, created.id))
      .limit(1)
    expect(stored?.status).toBe("inactive")
    await expect(
      resolveEmailRoute(db, "engagement", createdOffer.id)
    ).resolves.toBeNull()

    const replacement = await createEmailRoute(input, actor, db)
    expect(replacement.status).toBe("active")
    expect(replacement.id).not.toBe(created.id)

    await expect(
      updateEmailRoute(
        created.id,
        { version: archived.version, status: "active" },
        actor,
        db
      )
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: [
        expect.objectContaining({
          path: "status",
          message: "Archived email routes cannot be reactivated",
        }),
      ],
    })

    const viaArchive = await archiveEmailRoute(replacement.id, actor, db)
    expect(viaArchive.status).toBe("inactive")
    expect(viaArchive.version).toBe(replacement.version + 1)
    const repeated = await archiveEmailRoute(replacement.id, actor, db)
    expect(repeated.version).toBe(viaArchive.version)

    const resolved = await resolveEmailRoute(db, "engagement", createdOffer.id)
    expect(resolved).toBeNull()
  })

  it("returns 409 for a second active default route until the first is archived", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const verified = await createDomain(db, {
      name: `t060-default-${suffix}.example.com`,
      status: "verified",
      createdBy: user.id,
    })
    const activeSender = await createSender(db, {
      domainId: verified.id,
      status: "active",
      createdBy: user.id,
      fromEmail: `default-${suffix}@t060-default-${suffix}.example.com`,
    })
    const { template: published } = await createTemplate(db, {
      name: `t060-default-${suffix}`,
      emailType: "feedback_request",
      status: "active",
      createdBy: user.id,
    })

    const [previous] = await db
      .select({ id: emailRoute.id })
      .from(emailRoute)
      .where(
        and(
          eq(emailRoute.emailType, "feedback_request"),
          eq(emailRoute.status, "active"),
          isNull(emailRoute.offerId)
        )
      )
      .limit(1)

    if (previous) {
      await db
        .update(emailRoute)
        .set({ status: "inactive" })
        .where(eq(emailRoute.id, previous.id))
    }

    const input = {
      emailType: "feedback_request" as const,
      offerId: null,
      templateId: published.id,
      senderId: activeSender.id,
    }
    const actor = { userId: user.id }

    try {
      const created = await createEmailRoute(input, actor, db)
      await expect(createEmailRoute(input, actor, db)).rejects.toMatchObject({
        code: "conflict",
        status: 409,
        details: expect.arrayContaining([
          expect.objectContaining({ path: "offer_id", message: "" }),
        ]),
      })
      const archived = await updateEmailRoute(
        created.id,
        { version: created.version, status: "inactive" },
        actor,
        db
      )
      expect(archived.status).toBe("inactive")
    } finally {
      await db
        .update(emailRoute)
        .set({ status: "inactive" })
        .where(
          and(
            eq(emailRoute.emailType, "feedback_request"),
            eq(emailRoute.status, "active"),
            isNull(emailRoute.offerId)
          )
        )
      if (previous) {
        await db
          .update(emailRoute)
          .set({ status: "active" })
          .where(eq(emailRoute.id, previous.id))
      }
    }
  })
})
