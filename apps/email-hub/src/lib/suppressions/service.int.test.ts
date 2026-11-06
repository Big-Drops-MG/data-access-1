import { randomUUID } from "node:crypto"

import { and, eq, isNull } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import {
  auditLog,
  offer,
  recipient,
  recipientPreference,
  suppressionEntry,
} from "@workspace/db"
import { getDb } from "@workspace/db/client"
import { createCategory, createRecipient, createUser } from "@workspace/db/test"
import { hashEmail, runSendChecks } from "@workspace/shared"

import {
  addManualSuppression,
  listSuppressions,
  removeSuppression,
} from "./service.js"

function isolatedCloneDatabase(): boolean {
  const raw = process.env.DATABASE_URL?.trim()
  if (!raw) {
    return false
  }
  try {
    const url = new URL(raw)
    const host = url.hostname
    const loopback =
      host === "127.0.0.1" || host === "localhost" || host === "::1"
    const name = decodeURIComponent(url.pathname.replace(/^\//, ""))
    return loopback && name.startsWith("eh_w_")
  } catch {
    return false
  }
}

describe.skipIf(!isolatedCloneDatabase())(
  "suppression service (isolated clone)",
  () => {
    it("creates a global manual row, links a recipient, and ignores a duplicate", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const email = `t068-link-${suffix}@example.com`
      const creator = await createUser(db, { role: "operator" })
      const other = await createUser(db, { role: "admin" })
      const linked = await createRecipient(db, { email })
      const beforeRecipients = await db
        .select({ id: recipient.id })
        .from(recipient)
        .where(eq(recipient.email, email))

      const created = await addManualSuppression(
        { email: `  ${email.toUpperCase()} `, offerId: null },
        { userId: creator.id, requestId: "req-create" },
        db
      )

      expect(created.created).toBe(true)
      expect(created.email).toBe(email)
      expect(created.recipient_id).toBe(linked.id)
      expect(created.scope).toBe("global")
      expect(created.offer_id).toBeNull()
      expect(created.source).toBe("manual")
      expect(created.reason).toBeNull()
      expect(created.added_by).toBe(creator.id)
      expect(created).not.toHaveProperty("email_hash")

      const [row] = await db
        .select()
        .from(suppressionEntry)
        .where(eq(suppressionEntry.id, created.id))
      expect(row).toMatchObject({
        recipientId: linked.id,
        emailHash: linked.emailHash,
        scope: "global",
        offerId: null,
        source: "manual",
        reason: null,
        addedBy: creator.id,
        removedAt: null,
      })

      const duplicate = await addManualSuppression(
        { email, offerId: null },
        { userId: other.id, requestId: "req-dup" },
        db
      )
      expect(duplicate.created).toBe(false)
      expect(duplicate.id).toBe(created.id)
      expect(duplicate.added_by).toBe(creator.id)
      expect(duplicate.created_at).toBe(created.created_at)

      const rows = await db
        .select()
        .from(suppressionEntry)
        .where(eq(suppressionEntry.emailHash, linked.emailHash))
      expect(rows).toHaveLength(1)

      const afterRecipients = await db
        .select({ id: recipient.id })
        .from(recipient)
        .where(eq(recipient.email, email))
      expect(afterRecipients).toEqual(beforeRecipients)

      const prefs = await db
        .select({ id: recipientPreference.id })
        .from(recipientPreference)
        .where(eq(recipientPreference.recipientId, linked.id))
      expect(prefs).toHaveLength(0)

      const audits = await db
        .select()
        .from(auditLog)
        .where(eq(auditLog.entityId, created.id))
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        actorType: "user",
        actorId: creator.id,
        action: "suppression_entry.create",
        entityType: "suppression_entry",
        requestId: "req-create",
      })
      expect(JSON.stringify(audits[0]?.after)).not.toContain(email)
    })

    it("does not create a recipient when none exists", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const email = `t068-missing-${suffix}@example.com`
      const actor = await createUser(db, { role: "operator" })

      const created = await addManualSuppression(
        { email, offerId: null },
        { userId: actor.id },
        db
      )

      expect(created.recipient_id).toBeNull()
      expect(created.scope).toBe("global")
      const found = await db
        .select({ id: recipient.id })
        .from(recipient)
        .where(eq(recipient.email, email))
      expect(found).toHaveLength(0)
      const [row] = await db
        .select()
        .from(suppressionEntry)
        .where(eq(suppressionEntry.id, created.id))
      expect(row?.emailHash).toBe(hashEmail(email))
    })

    it("keeps offer scope and still links the recipient", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const email = `t068-offer-${suffix}@example.com`
      const actor = await createUser(db, { role: "operator" })
      const linked = await createRecipient(db, { email })
      const [createdOffer] = await db
        .insert(offer)
        .values({
          name: `T068 ${suffix}`,
          externalRef: `t068-${suffix}`,
        })
        .returning()
      if (!createdOffer) {
        throw new Error("offer was not created")
      }

      const globalRow = await addManualSuppression(
        { email, offerId: null },
        { userId: actor.id },
        db
      )
      const offerRow = await addManualSuppression(
        { email, offerId: createdOffer.id },
        { userId: actor.id },
        db
      )

      expect(globalRow.scope).toBe("global")
      expect(globalRow.offer_id).toBeNull()
      expect(offerRow.created).toBe(true)
      expect(offerRow.scope).toBe("offer")
      expect(offerRow.offer_id).toBe(createdOffer.id)
      expect(offerRow.recipient_id).toBe(linked.id)
      expect(offerRow.id).not.toBe(globalRow.id)

      await expect(
        addManualSuppression(
          {
            email,
            offerId: "019a0000-0000-7000-8000-000000000099",
          },
          { userId: actor.id },
          db
        )
      ).rejects.toMatchObject({ code: "validation_failed", status: 422 })
    })

    it("ignores concurrent duplicate inserts", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const email = `t068-race-${suffix}@example.com`
      const first = await createUser(db, { role: "operator" })
      const second = await createUser(db, { role: "admin" })

      const [left, right] = await Promise.all([
        addManualSuppression(
          { email, offerId: null },
          { userId: first.id },
          db
        ),
        addManualSuppression(
          { email, offerId: null },
          { userId: second.id },
          db
        ),
      ])

      const winner = left.created ? left : right
      const loser = left.created ? right : left
      expect(winner.created).toBe(true)
      expect(loser.created).toBe(false)
      expect(loser.id).toBe(winner.id)
      expect(loser.added_by).toBe(winner.added_by)
      expect(loser.created_at).toBe(winner.created_at)

      const rows = await db
        .select()
        .from(suppressionEntry)
        .where(eq(suppressionEntry.emailHash, hashEmail(email)))
      expect(rows).toHaveLength(1)
    })

    it("does not downgrade or remove a hard bounce", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const email = `t068-bounce-${suffix}@example.com`
      const admin = await createUser(db, { role: "admin" })
      const linked = await createRecipient(db, { email, status: "active" })
      const [bounce] = await db
        .insert(suppressionEntry)
        .values({
          emailHash: linked.emailHash,
          recipientId: linked.id,
          scope: "global",
          source: "hard_bounce",
          reason: "ses_bounce_permanent",
        })
        .returning()
      if (!bounce) {
        throw new Error("hard bounce was not created")
      }

      await expect(
        addManualSuppression({ email, offerId: null }, { userId: admin.id }, db)
      ).rejects.toMatchObject({
        code: "conflict",
        status: 409,
        details: expect.arrayContaining([
          expect.objectContaining({ path: "source", message: "hard_bounce" }),
        ]),
      })

      await expect(
        removeSuppression(bounce.id, { userId: admin.id }, db)
      ).rejects.toMatchObject({
        code: "conflict",
        status: 409,
      })
      await expect(
        removeSuppression(bounce.id, { userId: admin.id }, db)
      ).rejects.toMatchObject({ code: "conflict" })

      const [row] = await db
        .select()
        .from(suppressionEntry)
        .where(eq(suppressionEntry.id, bounce.id))
      expect(row).toMatchObject({
        source: "hard_bounce",
        reason: "ses_bounce_permanent",
        removedAt: null,
        addedBy: null,
        recipientId: linked.id,
      })
      const [person] = await db
        .select()
        .from(recipient)
        .where(eq(recipient.id, linked.id))
      expect(person?.status).toBe("active")
    })

    it("soft-removes a manual suppression once and writes one audit row", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const email = `t068-remove-${suffix}@example.com`
      const actor = await createUser(db, { role: "admin" })
      const created = await addManualSuppression(
        { email, offerId: null },
        { userId: actor.id },
        db
      )

      const removed = await removeSuppression(
        created.id,
        { userId: actor.id, requestId: "req-remove" },
        db
      )
      expect(removed.removed_at).not.toBeNull()
      expect(removed.source).toBe("manual")

      const again = await removeSuppression(
        created.id,
        { userId: actor.id },
        db
      )
      expect(again.removed_at).toBe(removed.removed_at)

      const audits = await db
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.entityId, created.id),
            eq(auditLog.action, "suppression_entry.remove")
          )
        )
      expect(audits).toHaveLength(1)
      expect(audits[0]).toMatchObject({
        actorId: actor.id,
        requestId: "req-remove",
      })

      await expect(
        removeSuppression(
          "019a0000-0000-7000-8000-000000000077",
          {
            userId: actor.id,
          },
          db
        )
      ).rejects.toMatchObject({ code: "not_found", status: 404 })

      const hidden = await listSuppressions(
        { limit: 50, email, includeRemoved: false },
        db
      )
      expect(hidden.data).toHaveLength(0)
      const shown = await listSuppressions(
        { limit: 50, email, includeRemoved: true },
        db
      )
      expect(shown.data.map((row) => row.id)).toContain(created.id)
    })

    it("pages newest-first and returns an empty list", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const actor = await createUser(db, { role: "operator" })
      const emails = [1, 2, 3].map(
        (index) => `t068-page-${suffix}-${index}@example.com`
      )
      const created = []
      for (const email of emails) {
        created.push(
          await addManualSuppression(
            { email, offerId: null },
            { userId: actor.id },
            db
          )
        )
      }

      const first = await listSuppressions(
        {
          limit: 2,
          email: undefined,
          source: "manual",
          includeRemoved: false,
        },
        db
      )
      const ours = created.map((row) => row.id)
      const pageIds = first.data
        .map((row) => row.id)
        .filter((id) => ours.includes(id))
      expect(first.data.length).toBeLessThanOrEqual(2)
      expect(first.next_cursor).toBe(first.data.at(-1)?.id ?? null)
      const ordered = [...first.data.map((row) => row.id)].sort().reverse()
      expect(first.data.map((row) => row.id)).toEqual(ordered)

      const second = await listSuppressions(
        {
          limit: 50,
          cursor: first.next_cursor ?? undefined,
          includeRemoved: false,
        },
        db
      )
      const seen = new Set([
        ...first.data.map((row) => row.id),
        ...second.data.map((row) => row.id),
      ])
      for (const id of ours) {
        expect(seen.has(id)).toBe(true)
      }
      expect(pageIds.length).toBeGreaterThan(0)

      const empty = await listSuppressions(
        {
          limit: 50,
          email: `t068-none-${suffix}@example.com`,
          includeRemoved: false,
        },
        db
      )
      expect(empty).toEqual({ data: [], next_cursor: null })
    })

    it("follows send-check scope for manual, offer, removed, and hard bounce rows", async () => {
      const db = getDb()
      const suffix = randomUUID().slice(0, 8)
      const actor = await createUser(db, { role: "operator" })
      const category = await createCategory(db, { createdBy: actor.id })
      const email = `t068-send-${suffix}@example.com`
      const person = await createRecipient(db, { email, status: "active" })
      const [createdOffer] = await db
        .insert(offer)
        .values({
          name: `T068 send ${suffix}`,
          externalRef: `t068-send-${suffix}`,
        })
        .returning()
      const [otherOffer] = await db
        .insert(offer)
        .values({
          name: `T068 other ${suffix}`,
          externalRef: `t068-other-${suffix}`,
        })
        .returning()
      if (!createdOffer || !otherOffer) {
        throw new Error("offers were not created")
      }

      const check = async (
        emailType: "engagement" | "thank_you",
        offerId: string | null
      ) =>
        db.transaction((tx) =>
          runSendChecks(tx, {
            recipient: person,
            emailType,
            offerId,
            categoryId: category.id,
          })
        )

      expect(await check("engagement", null)).toBeNull()

      const manual = await addManualSuppression(
        { email, offerId: null },
        { userId: actor.id },
        db
      )
      expect(await check("engagement", null)).toBe("suppressed")
      expect(await check("thank_you", null)).toBeNull()

      await removeSuppression(manual.id, { userId: actor.id }, db)
      expect(await check("engagement", null)).toBeNull()

      await addManualSuppression(
        { email, offerId: createdOffer.id },
        { userId: actor.id },
        db
      )
      expect(await check("engagement", createdOffer.id)).toBe("suppressed")
      expect(await check("engagement", null)).toBeNull()
      expect(await check("engagement", otherOffer.id)).toBeNull()

      await db.insert(suppressionEntry).values({
        emailHash: person.emailHash,
        recipientId: person.id,
        scope: "global",
        source: "hard_bounce",
        reason: "ses_bounce_permanent",
      })
      expect(await check("thank_you", null)).toBe("suppressed")
      expect(await check("engagement", otherOffer.id)).toBe("suppressed")

      const active = await db
        .select()
        .from(suppressionEntry)
        .where(
          and(
            eq(suppressionEntry.emailHash, person.emailHash),
            eq(suppressionEntry.source, "hard_bounce"),
            isNull(suppressionEntry.removedAt)
          )
        )
      expect(active).toHaveLength(1)
    })
  }
)
