import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  domain,
  emailCategory,
  emailRoute,
  frequencyRule,
  message,
  offer,
  recipient,
  recipientPreference,
  sender,
  suppressionEntry,
  template,
  templateVersion,
  user,
} from "@workspace/db"
import { getDb, getPool } from "@workspace/db/client"
import { eq } from "drizzle-orm"

import { hashEmail } from "./email.js"
import {
  triggerEmail,
  type TriggerEmailCreateContext,
  type TriggerEmailType,
} from "./trigger-email.js"

const databaseUrl = process.env.DATABASE_URL?.trim()

describe.skipIf(!databaseUrl)("triggerEmail send checks (int)", () => {
  const suffix = randomUUID().slice(0, 8)
  let staffId = ""
  let engagementCategoryId = ""
  let thankYouCategoryId = ""
  let feedbackCategoryId = ""
  let engagementTemplateVersionId = ""
  let thankYouTemplateVersionId = ""
  let feedbackTemplateVersionId = ""
  let engagementSenderId = ""
  let thankYouSenderId = ""
  let feedbackSenderId = ""
  let offerId = ""
  let seeded = false

  beforeAll(async () => {
    try {
      const db = getDb()
      const [staff] = await db
        .insert(user)
        .values({
          email: `t036-staff-${suffix}@example.com`,
          name: "T-036 Staff",
          role: "admin",
          status: "active",
        })
        .returning()
      if (!staff) {
        throw new Error("failed to seed user")
      }
      staffId = staff.id

      const [tyCat, fbCat, engCat] = await Promise.all([
        db
          .insert(emailCategory)
          .values({
            key: `t036_ty_${suffix}`,
            name: "T-036 thank you",
            kind: "transactional",
          })
          .returning(),
        db
          .insert(emailCategory)
          .values({
            key: `t036_fb_${suffix}`,
            name: "T-036 feedback",
            kind: "transactional",
          })
          .returning(),
        db
          .insert(emailCategory)
          .values({
            key: `t036_eng_${suffix}`,
            name: "T-036 engagement",
            kind: "relationship",
          })
          .returning(),
      ])

      thankYouCategoryId = tyCat[0]!.id
      feedbackCategoryId = fbCat[0]!.id
      engagementCategoryId = engCat[0]!.id

      const [brand] = await db
        .insert(offer)
        .values({
          name: `T-036 offer ${suffix}`,
          externalRef: `t036-${suffix}`,
          status: "active",
        })
        .returning()
      offerId = brand!.id

      const [dom] = await db
        .insert(domain)
        .values({
          name: `t036-${suffix}.example.com`,
          status: "verified",
          createdBy: staffId,
        })
        .returning()

      async function seedRoute(
        emailType: TriggerEmailType,
        categoryId: string,
        fromLocal: string
      ): Promise<{ versionId: string; senderId: string }> {
        const [tpl] = await db
          .insert(template)
          .values({
            name: `t036-${emailType}-${suffix}`,
            emailType,
            categoryId,
            status: "active",
            createdBy: staffId,
          })
          .returning()

        const [version] = await db
          .insert(templateVersion)
          .values({
            templateId: tpl!.id,
            versionNo: 1,
            subject: "Hi {{name}}",
            bodySource: "<p>Hi</p>",
            mergeTags: { name: "string" },
            createdBy: staffId,
          })
          .returning()

        await db
          .update(template)
          .set({ currentVersionId: version!.id })
          .where(eq(template.id, tpl!.id))

        const [from] = await db
          .insert(sender)
          .values({
            domainId: dom!.id,
            fromName: `T-036 ${emailType}`,
            fromEmail: `${fromLocal}-${suffix}@t036.example.com`,
            status: "active",
            createdBy: staffId,
          })
          .returning()

        await db.insert(emailRoute).values({
          emailType,
          offerId: null,
          templateId: tpl!.id,
          senderId: from!.id,
          status: "active",
          createdBy: staffId,
        })

        return { versionId: version!.id, senderId: from!.id }
      }

      const ty = await seedRoute("thank_you", thankYouCategoryId, "ty")
      const fb = await seedRoute("feedback_request", feedbackCategoryId, "fb")
      const eng = await seedRoute("engagement", engagementCategoryId, "eng")
      thankYouTemplateVersionId = ty.versionId
      thankYouSenderId = ty.senderId
      feedbackTemplateVersionId = fb.versionId
      feedbackSenderId = fb.senderId
      engagementTemplateVersionId = eng.versionId
      engagementSenderId = eng.senderId

      await db.insert(frequencyRule).values([
        {
          kind: "cap",
          categoryId: engagementCategoryId,
          maxCount: 2,
          windowDays: 7,
          updatedBy: staffId,
        },
        {
          kind: "collision",
          categoryId: feedbackCategoryId,
          blocksWithType: "thank_you",
          minGapHours: 24,
          updatedBy: staffId,
        },
      ])

      seeded = true
    } catch (error) {
      console.warn(
        "[send-checks int] seed skipped (need app-role DATABASE_URL):",
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

  async function createQueued({
    tx,
    recipient: row,
    idempotencyKey: key,
    emailType,
    templateVersion: version,
    sender: from,
    offerId: offer,
  }: TriggerEmailCreateContext) {
    const [created] = await tx
      .insert(message)
      .values({
        recipientId: row.id,
        offerId: offer,
        emailType,
        templateVersionId: version.id,
        senderId: from.id,
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

  it("skips with recipient_bounced when the recipient is bounced", async ({
    skip,
  }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `bounce-${suffix}@example.com`
    const [row] = await db
      .insert(recipient)
      .values({
        email,
        emailHash: hashEmail(email),
        status: "bounced",
      })
      .returning()

    const result = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-bounce-${suffix}`,
        emailType: "thank_you",
        mergeData: { name: "Ada" },
      },
      createQueued
    )

    expect(result.message.status).toBe("skipped")
    expect(result.message.skipReason).toBe("recipient_bounced")
    expect(result.message.templateVersionId).toBe(thankYouTemplateVersionId)
    expect(result.message.senderId).toBe(thankYouSenderId)
    expect(result.recipient.id).toBe(row!.id)
  }, 30_000)

  it("skips with suppressed for hard_bounce on transactional mail", async ({
    skip,
  }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `hardbounce-${suffix}@example.com`
    await db.insert(recipient).values({
      email,
      emailHash: hashEmail(email),
      status: "active",
    })
    await db.insert(suppressionEntry).values({
      emailHash: hashEmail(email),
      scope: "global",
      source: "hard_bounce",
    })

    const result = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-hardbounce-${suffix}`,
        emailType: "thank_you",
        mergeData: { name: "Ada" },
      },
      createQueued
    )

    expect(result.message.skipReason).toBe("suppressed")
  }, 30_000)

  it("skips with suppressed for feedback_review complaint suppression", async ({
    skip,
  }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `complaint-${suffix}@example.com`
    await db.insert(recipient).values({
      email,
      emailHash: hashEmail(email),
    })
    await db.insert(suppressionEntry).values({
      emailHash: hashEmail(email),
      scope: "global",
      source: "feedback_review",
    })

    const result = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-complaint-${suffix}`,
        emailType: "engagement",
        mergeData: { name: "Ada" },
      },
      createQueued
    )

    expect(result.message.skipReason).toBe("suppressed")
  }, 30_000)

  it("skips engagement for Optizmo but still sends transactional", async ({
    skip,
  }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `optizmo-${suffix}@example.com`
    await db.insert(recipient).values({
      email,
      emailHash: hashEmail(email),
    })
    await db.insert(suppressionEntry).values({
      emailHash: hashEmail(email),
      scope: "global",
      source: "optizmo",
    })

    const engagement = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-optizmo-eng-${suffix}`,
        emailType: "engagement",
        mergeData: { name: "Ada" },
      },
      createQueued
    )
    expect(engagement.message.skipReason).toBe("suppressed")

    const thankYou = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-optizmo-ty-${suffix}`,
        emailType: "thank_you",
        mergeData: { name: "Ada" },
      },
      createQueued
    )
    expect(thankYou.message.status).toBe("queued")
    expect(thankYou.message.skipReason).toBeNull()
  }, 30_000)

  it("skips engagement for offer-scoped suppression", async ({ skip }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `offer-sup-${suffix}@example.com`
    await db.insert(recipient).values({
      email,
      emailHash: hashEmail(email),
    })
    await db.insert(suppressionEntry).values({
      emailHash: hashEmail(email),
      scope: "offer",
      offerId,
      source: "manual",
    })
    await db.insert(emailRoute).values({
      emailType: "engagement",
      offerId,
      templateId: (
        await db
          .select({ id: template.id })
          .from(template)
          .where(eq(template.name, `t036-engagement-${suffix}`))
      )[0]!.id,
      senderId: engagementSenderId,
      status: "active",
      createdBy: staffId,
    })

    const result = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-offer-sup-${suffix}`,
        emailType: "engagement",
        offerId,
        mergeData: { name: "Ada" },
      },
      createQueued
    )

    expect(result.message.skipReason).toBe("suppressed")
  }, 30_000)

  it("skips engagement for category opt-out but not thank_you", async ({
    skip,
  }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `optout-${suffix}@example.com`
    const [row] = await db
      .insert(recipient)
      .values({
        email,
        emailHash: hashEmail(email),
      })
      .returning()

    await db.insert(recipientPreference).values({
      recipientId: row!.id,
      categoryId: engagementCategoryId,
      optedOut: true,
      source: "unsubscribe_link",
    })

    const engagement = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-optout-eng-${suffix}`,
        emailType: "engagement",
        mergeData: { name: "Ada" },
      },
      createQueued
    )
    expect(engagement.message.skipReason).toBe("opted_out")

    const thankYou = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-optout-ty-${suffix}`,
        emailType: "thank_you",
        mergeData: { name: "Ada" },
      },
      createQueued
    )
    expect(thankYou.message.status).toBe("queued")
  }, 30_000)

  it("skips feedback_request with not_premium for standard tier", async ({
    skip,
  }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `standard-${suffix}@example.com`
    await db.insert(recipient).values({
      email,
      emailHash: hashEmail(email),
      tier: "standard",
    })

    const result = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-not-premium-${suffix}`,
        emailType: "feedback_request",
        mergeData: { name: "Ada" },
      },
      createQueued
    )

    expect(result.message.skipReason).toBe("not_premium")
    expect(result.message.templateVersionId).toBe(feedbackTemplateVersionId)
    expect(result.message.senderId).toBe(feedbackSenderId)
  }, 30_000)

  it("skips feedback_request with collision after a recent thank_you", async ({
    skip,
  }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `collision-${suffix}@example.com`
    const [row] = await db
      .insert(recipient)
      .values({
        email,
        emailHash: hashEmail(email),
        tier: "premium",
      })
      .returning()

    await db.insert(message).values({
      recipientId: row!.id,
      emailType: "thank_you",
      templateVersionId: thankYouTemplateVersionId,
      senderId: thankYouSenderId,
      idempotencyKey: `t036-collision-prior-${suffix}`,
      status: "sent",
      sentAt: new Date(),
    })

    const result = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-collision-${suffix}`,
        emailType: "feedback_request",
        mergeData: { name: "Ada" },
      },
      createQueued
    )

    expect(result.message.skipReason).toBe("collision")
  }, 30_000)

  it("skips with frequency_cap when the window is full", async ({ skip }) => {
    if (!seeded) {
      skip()
    }
    const db = getDb()
    const email = `cap-${suffix}@example.com`
    const [row] = await db
      .insert(recipient)
      .values({
        email,
        emailHash: hashEmail(email),
      })
      .returning()

    await db.insert(message).values([
      {
        recipientId: row!.id,
        emailType: "engagement",
        templateVersionId: engagementTemplateVersionId,
        senderId: engagementSenderId,
        idempotencyKey: `t036-cap-1-${suffix}`,
        status: "sent",
        sentAt: new Date(),
      },
      {
        recipientId: row!.id,
        emailType: "engagement",
        templateVersionId: engagementTemplateVersionId,
        senderId: engagementSenderId,
        idempotencyKey: `t036-cap-2-${suffix}`,
        status: "sent",
        sentAt: new Date(),
      },
    ])

    const result = await triggerEmail(
      db,
      {
        email,
        idempotencyKey: `t036-cap-3-${suffix}`,
        emailType: "engagement",
        mergeData: { name: "Ada" },
      },
      createQueued
    )

    expect(result.message.skipReason).toBe("frequency_cap")
  }, 30_000)
})
