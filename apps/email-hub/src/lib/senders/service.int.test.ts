import { randomUUID } from "node:crypto"

import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { emailRoute, sender } from "@workspace/db"
import { getDb } from "@workspace/db/client"
import {
  createDomain,
  createSender as seedSender,
  createTemplate,
  createUser,
} from "@workspace/db/test"
import { AppError } from "@workspace/shared"

import { createSender, getSender, updateSender } from "./service.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

describe.skipIf(!databaseUrl)("senders service (int)", () => {
  it("rejects create when the domain is not verified", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const pending = await createDomain(db, {
      name: `pending-${suffix}.example.com`,
      status: "pending",
      createdBy: user.id,
    })

    await expect(
      createSender(
        {
          domainId: pending.id,
          fromName: "Ops",
          localPart: `noreply-${suffix}`,
        },
        { userId: user.id },
        db
      )
    ).rejects.toMatchObject({ code: "validation_failed", status: 422 })
  })

  it("creates on a verified domain and enforces local-part uniqueness", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const verified = await createDomain(db, {
      name: `ok-${suffix}.example.com`,
      status: "verified",
      createdBy: user.id,
    })

    const created = await createSender(
      {
        domainId: verified.id,
        fromName: "Ops",
        localPart: `hello-${suffix}`,
        replyTo: `reply-${suffix}@example.com`,
      },
      { userId: user.id, requestId: `t057-create-${suffix}` },
      db
    )

    expect(created.status).toBe("active")
    expect(created.version).toBe(1)
    expect(created.from_email).toBe(`hello-${suffix}@ok-${suffix}.example.com`)
    expect(created.reply_to).toBe(`reply-${suffix}@example.com`)

    const detail = await getSender(created.id, db)
    expect(detail.id).toBe(created.id)

    await expect(
      createSender(
        {
          domainId: verified.id,
          fromName: "Dup",
          localPart: `hello-${suffix}`,
        },
        { userId: user.id },
        db
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
  })

  it("persists optional reply_to and allows clearing it on update", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const verified = await createDomain(db, {
      name: `reply-${suffix}.example.com`,
      status: "verified",
      createdBy: user.id,
    })

    const created = await createSender(
      {
        domainId: verified.id,
        fromName: "Ops",
        localPart: `noreply-${suffix}`,
        replyTo: `ops-${suffix}@example.com`,
      },
      { userId: user.id },
      db
    )
    expect(created.reply_to).toBe(`ops-${suffix}@example.com`)

    const cleared = await updateSender(
      created.id,
      { version: created.version, replyTo: null },
      { userId: user.id },
      db
    )
    expect(cleared.reply_to).toBeNull()
    expect(cleared.version).toBe(2)
  })

  it("enforces optimistic version locking on edit", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const verified = await createDomain(db, {
      name: `ver-${suffix}.example.com`,
      status: "verified",
      createdBy: user.id,
    })

    const created = await createSender(
      {
        domainId: verified.id,
        fromName: "Ops",
        localPart: `lock-${suffix}`,
      },
      { userId: user.id },
      db
    )

    const updated = await updateSender(
      created.id,
      { version: 1, fromName: "Renamed" },
      { userId: user.id, requestId: `t057-lock-${suffix}` },
      db
    )
    expect(updated.version).toBe(2)
    expect(updated.from_name).toBe("Renamed")

    await expect(
      updateSender(
        created.id,
        { version: 1, fromName: "Stale" },
        { userId: user.id },
        db
      )
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AppError)
      const appError = error as AppError
      expect(appError.code).toBe("conflict")
      expect(appError.status).toBe(409)
      expect(appError.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: "version", message: "2" }),
        ])
      )
      return true
    })
  })

  it("blocks disable when an active route uses the sender and lists routes", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const verified = await createDomain(db, {
      name: `route-${suffix}.example.com`,
      status: "verified",
      createdBy: user.id,
    })
    const created = await createSender(
      {
        domainId: verified.id,
        fromName: "Ops",
        localPart: `route-${suffix}`,
      },
      { userId: user.id },
      db
    )
    const { template: tpl } = await createTemplate(db, {
      name: `t057-route-${suffix}`,
      createdBy: user.id,
      status: "active",
      emailType: "thank_you",
    })

    await db
      .update(emailRoute)
      .set({ status: "inactive" })
      .where(
        and(
          eq(emailRoute.emailType, "thank_you"),
          eq(emailRoute.status, "active"),
          isNull(emailRoute.offerId)
        )
      )

    const [route] = await db
      .insert(emailRoute)
      .values({
        emailType: "thank_you",
        templateId: tpl.id,
        senderId: created.id,
        status: "active",
        createdBy: user.id,
      })
      .returning()

    await expect(
      updateSender(
        created.id,
        { version: created.version, status: "inactive" },
        { userId: user.id },
        db
      )
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AppError)
      const appError = error as AppError
      expect(appError.code).toBe("conflict")
      expect(appError.status).toBe(409)
      expect(appError.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: "email_route",
            message: route!.id,
          }),
        ])
      )
      return true
    })

    await db
      .update(emailRoute)
      .set({ status: "inactive" })
      .where(eq(emailRoute.id, route!.id))

    const disabled = await updateSender(
      created.id,
      { version: created.version, status: "inactive" },
      { userId: user.id },
      db
    )
    expect(disabled.status).toBe("inactive")
    expect(disabled.deactivated_at).not.toBeNull()
    expect(disabled.version).toBe(created.version + 1)

    const [row] = await db
      .select()
      .from(sender)
      .where(eq(sender.id, created.id))
      .limit(1)
    expect(row?.status).toBe("inactive")
    expect(row?.deactivatedAt).not.toBeNull()
  })

  it("allows disable when only inactive routes reference the sender", async () => {
    const db = getDb()
    const suffix = randomUUID().slice(0, 8)
    const user = await createUser(db)
    const seeded = await seedSender(db, {
      createdBy: user.id,
      fromEmail: `seed-${suffix}@factory.example.com`,
      status: "active",
    })

    const disabled = await updateSender(
      seeded.id,
      { version: seeded.version, status: "inactive" },
      { userId: user.id },
      db
    )
    expect(disabled.status).toBe("inactive")
  })
})
