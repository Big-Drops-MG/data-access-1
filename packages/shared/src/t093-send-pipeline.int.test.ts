import { randomBytes, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

import {
  emailCategory,
  emailRoute,
  frequencyRule,
  message,
  offer,
  recipient,
  recipientPreference,
  suppressionEntry,
  template,
  templateVersion,
} from "@workspace/db"
import { getDb, getPool, type Database } from "@workspace/db/client"
import { createDomain, createSender, createUser } from "@workspace/db/test"
import { Queue, type RedisOptions } from "bullmq"
import { and, eq, isNull, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { hashEmail } from "./email.js"
import { AppError } from "./errors.js"
import {
  createEnqueueSendEmail,
  SEND_EMAIL_JOB_NAME,
  SEND_EMAIL_QUEUE_NAME,
} from "./send-email-queue.js"
import {
  insertQueuedMessage,
  lockRecipientTx,
  triggerEmail,
  type TriggerEmailDeps,
  type TriggerEmailType,
} from "./trigger-email.js"

const databaseUrl = process.env.DATABASE_URL?.trim()
const redisUrl = loopbackRedisUrl()

type RouteSeed = {
  offerId: string
  categoryId: string
  templateVersionId: string
  senderId: string
}

type Seed = {
  db: Database
  thankYou: RouteSeed
  engagement: RouteSeed
  feedback: RouteSeed
  staffId: string
}

describe.skipIf(!databaseUrl)("T-093 send pipeline", () => {
  const suffix = randomUUID().slice(0, 8)
  const queuePrefix = `bdt093${randomBytes(3).toString("hex")}`
  let seed: Seed | undefined
  let queue: Queue | undefined
  const localJobs = new Map<
    string,
    { name: string; messageId: string; requestId?: string }
  >()

  beforeAll(async () => {
    const db = getDb()
    const staff = await createUser(db, {
      email: `t093-staff-${suffix}@example.com`,
      name: "T-093 Staff",
    })
    const thankYou = await seedRoute(
      db,
      staff.id,
      suffix,
      "thank_you",
      "transactional"
    )
    const engagement = await seedRoute(
      db,
      staff.id,
      suffix,
      "engagement",
      "relationship"
    )
    const feedback = await seedRoute(
      db,
      staff.id,
      suffix,
      "feedback_request",
      "transactional"
    )
    await db.insert(frequencyRule).values({
      kind: "cap",
      categoryId: engagement.categoryId,
      maxCount: 1,
      windowDays: 7,
      updatedBy: staff.id,
    })
    seed = { db, thankYou, engagement, feedback, staffId: staff.id }
    if (redisUrl) {
      queue = new Queue(SEND_EMAIL_QUEUE_NAME, {
        connection: redisOptions(redisUrl),
        prefix: queuePrefix,
      })
    }
  }, 60_000)

  afterAll(async () => {
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => undefined)
      await queue.close()
    }
  })

  function deps(
    enqueue?: TriggerEmailDeps["enqueueSendEmail"]
  ): TriggerEmailDeps {
    if (enqueue) return { enqueueSendEmail: enqueue }
    if (queue) return { enqueueSendEmail: createEnqueueSendEmail(queue) }
    return {
      enqueueSendEmail: async (messageId, requestId) => {
        localJobs.set(messageId, {
          name: SEND_EMAIL_JOB_NAME,
          messageId,
          requestId,
        })
      },
    }
  }

  async function readJob(
    messageId: string
  ): Promise<
    { name: string; messageId: string; requestId?: string } | undefined
  > {
    if (!queue) return localJobs.get(messageId)
    const job = await queue.getJob(messageId)
    if (!job) return undefined
    return {
      name: job.name,
      messageId: job.data.message_id,
      requestId: job.data.request_id,
    }
  }

  it("queues one message and one send-email job for an eligible recipient", async () => {
    const ready = requiredSeed()
    const key = `t093-ok-${suffix}-${token()}`
    const email = `ok-${token()}@example.com`
    const result = await triggerEmail(
      ready.db,
      {
        email: `  ${email.toUpperCase()}  `,
        idempotencyKey: key,
        emailType: "thank_you",
        offerId: ready.thankYou.offerId,
        mergeData: { name: "Ada" },
        requestId: `t093-${suffix}`,
      },
      deps()
    )

    expect(result.created).toBe(true)
    expect(result.message.status).toBe("queued")
    expect(result.message.idempotencyKey).toBe(key)
    expect(result.recipient.email).toBe(email)
    const stored = await messagesForKey(ready.db, key)
    expect(stored).toHaveLength(1)
    expect(stored[0]?.status).toBe("queued")
    const job = await readJob(result.message.id)
    expect(job?.name).toBe(SEND_EMAIL_JOB_NAME)
    expect(job?.messageId).toBe(result.message.id)
    expect(job?.requestId).toBe(`t093-${suffix}`)
    expect(await readJob(key)).toBeUndefined()
  })

  it("rejects an empty idempotency key and an invalid email before writing a message", async () => {
    const ready = requiredSeed()
    const before = await messageCount(ready.db)
    await expect(
      triggerEmail(
        ready.db,
        {
          email: "person@example.com",
          idempotencyKey: "   ",
          emailType: "thank_you",
          offerId: ready.thankYou.offerId,
          mergeData: { name: "Ada" },
        },
        deps()
      )
    ).rejects.toMatchObject({ code: "validation_failed", status: 422 })
    await expect(
      triggerEmail(
        ready.db,
        {
          email: "not-an-email",
          idempotencyKey: `t093-bad-email-${token()}`,
          emailType: "thank_you",
          offerId: ready.thankYou.offerId,
          mergeData: { name: "Ada" },
        },
        deps()
      )
    ).rejects.toBeInstanceOf(AppError)
    expect(await messageCount(ready.db)).toBe(before)
  })

  it("skips a bounced recipient and does not enqueue", async () => {
    const ready = requiredSeed()
    const email = `bounced-${token()}@example.com`
    await ready.db.insert(recipient).values({
      email,
      emailHash: hashEmail(email),
      status: "bounced",
    })
    const key = `t093-bounced-${token()}`
    const result = await triggerEmail(
      ready.db,
      {
        email,
        idempotencyKey: key,
        emailType: "thank_you",
        offerId: ready.thankYou.offerId,
        mergeData: { name: "Ada" },
      },
      deps()
    )
    expect(result.message.status).toBe("skipped")
    expect(result.message.skipReason).toBe("recipient_bounced")
    await expectNoJob(result.message.id)
  })

  it("skips a recipient with an active hard-bounce suppression", async () => {
    const ready = requiredSeed()
    const email = `suppressed-${token()}@example.com`
    const [person] = await ready.db
      .insert(recipient)
      .values({ email, emailHash: hashEmail(email) })
      .returning()
    await ready.db.insert(suppressionEntry).values({
      emailHash: person!.emailHash,
      recipientId: person!.id,
      scope: "global",
      source: "hard_bounce",
      reason: "t093",
    })
    const result = await triggerEmail(
      ready.db,
      {
        email,
        idempotencyKey: `t093-suppressed-${token()}`,
        emailType: "thank_you",
        offerId: ready.thankYou.offerId,
        mergeData: { name: "Ada" },
      },
      deps()
    )
    expect(result.message.status).toBe("skipped")
    expect(result.message.skipReason).toBe("suppressed")
    await expectNoJob(result.message.id)
  })

  it("skips engagement when the recipient opted out of the category", async () => {
    const ready = requiredSeed()
    const email = `optout-${token()}@example.com`
    const [person] = await ready.db
      .insert(recipient)
      .values({ email, emailHash: hashEmail(email) })
      .returning()
    await ready.db.insert(recipientPreference).values({
      recipientId: person!.id,
      categoryId: ready.engagement.categoryId,
      optedOut: true,
      source: "preference_center",
    })
    const result = await triggerEmail(
      ready.db,
      {
        email,
        idempotencyKey: `t093-optout-${token()}`,
        emailType: "engagement",
        offerId: ready.engagement.offerId,
        mergeData: { name: "Ada" },
      },
      deps()
    )
    expect(result.message.skipReason).toBe("opted_out")
    await expectNoJob(result.message.id)
  })

  it("skips feedback_request for a standard-tier recipient", async () => {
    const ready = requiredSeed()
    const result = await triggerEmail(
      ready.db,
      {
        email: `standard-${token()}@example.com`,
        idempotencyKey: `t093-tier-${token()}`,
        emailType: "feedback_request",
        offerId: ready.feedback.offerId,
        mergeData: { name: "Ada" },
      },
      deps()
    )
    expect(result.message.status).toBe("skipped")
    expect(result.message.skipReason).toBe("not_premium")
    await expectNoJob(result.message.id)
  })

  it("skips with frequency_cap when the recipient is already at the cap", async () => {
    const ready = requiredSeed()
    const email = `capped-${token()}@example.com`
    const [person] = await ready.db
      .insert(recipient)
      .values({ email, emailHash: hashEmail(email) })
      .returning()
    await ready.db.insert(message).values({
      recipientId: person!.id,
      offerId: ready.engagement.offerId,
      emailType: "engagement",
      templateVersionId: ready.engagement.templateVersionId,
      senderId: ready.engagement.senderId,
      idempotencyKey: `t093-prior-${token()}`,
      status: "sent",
      sentAt: new Date(),
    })
    const result = await triggerEmail(
      ready.db,
      {
        email,
        idempotencyKey: `t093-cap-${token()}`,
        emailType: "engagement",
        offerId: ready.engagement.offerId,
        mergeData: { name: "Ada" },
      },
      deps()
    )
    expect(result.message.status).toBe("skipped")
    expect(result.message.skipReason).toBe("frequency_cap")
    await expectNoJob(result.message.id)
  })

  it("returns the original message for a repeated idempotency key and keeps one job", async () => {
    const ready = requiredSeed()
    const key = `t093-idem-${token()}`
    const input = {
      email: `idem-${token()}@example.com`,
      idempotencyKey: key,
      emailType: "thank_you" as const,
      offerId: ready.thankYou.offerId,
      mergeData: { name: "Ada" },
    }
    const first = await triggerEmail(ready.db, input, deps())
    const second = await triggerEmail(ready.db, input, deps())
    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(second.message.id).toBe(first.message.id)
    expect(await messagesForKey(ready.db, key)).toHaveLength(1)
    expect((await readJob(first.message.id))?.messageId).toBe(first.message.id)
  })

  it("records no_route and does not enqueue when the offer has no route", async () => {
    const ready = requiredSeed()
    const [brand] = await ready.db
      .insert(offer)
      .values({
        name: `T-093 orphan ${token()}`,
        externalRef: `t093-orphan-${token()}`,
        status: "active",
      })
      .returning()
    const defaults = await ready.db
      .update(emailRoute)
      .set({ status: "inactive" })
      .where(
        and(
          eq(emailRoute.emailType, "thank_you"),
          isNull(emailRoute.offerId),
          eq(emailRoute.status, "active")
        )
      )
      .returning({ id: emailRoute.id })
    try {
      const key = `t093-noroute-${token()}`
      const result = await triggerEmail(
        ready.db,
        {
          email: `noroute-${token()}@example.com`,
          idempotencyKey: key,
          emailType: "thank_you",
          offerId: brand!.id,
          mergeData: { name: "Ada" },
        },
        deps()
      )
      expect(result.message.status).toBe("skipped")
      expect(result.message.skipReason).toBe("no_route")
      await expectNoJob(result.message.id)
    } finally {
      for (const row of defaults) {
        await ready.db
          .update(emailRoute)
          .set({ status: "active" })
          .where(eq(emailRoute.id, row.id))
      }
    }
  })

  it("rolls back the message when required merge data is missing", async () => {
    const ready = requiredSeed()
    const key = `t093-merge-${token()}`
    const email = `merge-${token()}@example.com`
    await expect(
      triggerEmail(
        ready.db,
        {
          email,
          idempotencyKey: key,
          emailType: "thank_you",
          offerId: ready.thankYou.offerId,
          mergeData: {},
        },
        deps()
      )
    ).rejects.toMatchObject({ code: "validation_failed" })
    expect(await messagesForKey(ready.db, key)).toHaveLength(0)
    const people = await ready.db
      .select()
      .from(recipient)
      .where(eq(recipient.email, email))
    expect(people).toHaveLength(1)
  })

  it("keeps the committed queued row when enqueue throws", async () => {
    const ready = requiredSeed()
    const key = `t093-queue-fail-${token()}`
    const result = await triggerEmail(
      ready.db,
      {
        email: `queue-fail-${token()}@example.com`,
        idempotencyKey: key,
        emailType: "thank_you",
        offerId: ready.thankYou.offerId,
        mergeData: { name: "Ada" },
      },
      deps(async () => {
        throw new Error("redis refused")
      })
    )
    expect(result.message.status).toBe("queued")
    expect((await messagesForKey(ready.db, key))[0]?.status).toBe("queued")
    await expectNoJob(result.message.id)
  })

  it("creates one recipient when parallel first sends share a new address", async () => {
    const ready = requiredSeed()
    for (let round = 0; round < 4; round += 1) {
      const email = `parallel-new-${token()}@example.com`
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          triggerEmail(
            ready.db,
            {
              email,
              idempotencyKey: `t093-new-${token()}`,
              emailType: "thank_you",
              offerId: ready.thankYou.offerId,
              mergeData: { name: "Ada" },
            },
            deps()
          )
        )
      )
      const ids = new Set(results.map((result) => result.recipient.id))
      expect(ids.size).toBe(1)
      const people = await ready.db
        .select()
        .from(recipient)
        .where(eq(recipient.email, email))
      expect(people).toHaveLength(1)
    }
  }, 30_000)

  it("allows one reservation when two requests share a cap of one, repeated", async () => {
    const rounds = await repeatCap({ rounds: 5, attempts: 2, maxCount: 1 })
    expect(rounds).toEqual([
      { queued: 1, capped: 1 },
      { queued: 1, capped: 1 },
      { queued: 1, capped: 1 },
      { queued: 1, capped: 1 },
      { queued: 1, capped: 1 },
    ])
  }, 60_000)

  it("allows one reservation when eight requests share a cap of one, repeated", async () => {
    const rounds = await repeatCap({ rounds: 3, attempts: 8, maxCount: 1 })
    expect(rounds).toEqual([
      { queued: 1, capped: 7 },
      { queued: 1, capped: 7 },
      { queued: 1, capped: 7 },
    ])
  }, 90_000)

  it("allows two reservations when six requests share a cap of two", async () => {
    const ready = requiredSeed()
    await ready.db
      .update(frequencyRule)
      .set({ maxCount: 2 })
      .where(eq(frequencyRule.categoryId, ready.engagement.categoryId))
    try {
      const round = await assertCapRound(6, 2)
      expect(round).toEqual({ queued: 2, capped: 4 })
    } finally {
      await ready.db
        .update(frequencyRule)
        .set({ maxCount: 1 })
        .where(eq(frequencyRule.categoryId, ready.engagement.categoryId))
    }
  }, 60_000)

  it("holds the recipient advisory lock until commit and releases it after rollback", async () => {
    const ready = requiredSeed()
    const person = await insertPerson(ready.db, `lock-${token()}@example.com`)
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let acquired = false
    const holder = ready.db.transaction(async (tx) => {
      await lockRecipientTx(tx, person.id)
      acquired = true
      await gate
    })
    await waitUntil(() => acquired)
    expect(await probeRecipientLock(person.id)).toBe("held")
    release()
    await holder
    expect(await probeRecipientLock(person.id)).toBe("acquired")

    const client = await getPool().connect()
    try {
      await client.query("BEGIN")
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [
        person.id,
      ])
      expect(await probeRecipientLock(person.id)).toBe("held")
      await client.query("ROLLBACK")
    } finally {
      client.release()
    }
    expect(await probeRecipientLock(person.id)).toBe("acquired")
  }, 30_000)

  it("does not insert while another transaction holds the recipient lock", async () => {
    const ready = requiredSeed()
    const email = `blocked-${token()}@example.com`
    const person = await insertPerson(ready.db, email)
    const key = `t093-blocked-${token()}`
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let acquired = false
    const holder = ready.db.transaction(async (tx) => {
      await lockRecipientTx(tx, person.id)
      acquired = true
      await gate
    })
    await waitUntil(() => acquired)
    let settled = false
    const pending = triggerEmail(
      ready.db,
      {
        email,
        idempotencyKey: key,
        emailType: "thank_you",
        offerId: ready.thankYou.offerId,
        mergeData: { name: "Ada" },
      },
      deps()
    ).finally(() => {
      settled = true
    })
    await waitForUngrantedAdvisoryLock()
    expect(settled).toBe(false)
    expect(await messagesForKey(ready.db, key)).toHaveLength(0)
    expect(await probeRecipientLock(person.id)).toBe("held")
    release()
    const result = await pending
    await holder
    expect(result.message.status).toBe("queued")
    expect(await messagesForKey(ready.db, key)).toHaveLength(1)
    expect(await probeRecipientLock(person.id)).toBe("acquired")
  }, 30_000)

  it("does not leave a reservation when the locked transaction rolls back", async () => {
    const ready = requiredSeed()
    const email = `rollback-${token()}@example.com`
    const person = await insertPerson(ready.db, email)
    const key = `t093-rollback-${token()}`
    await expect(
      ready.db.transaction(async (tx) => {
        await lockRecipientTx(tx, person.id)
        await insertQueuedMessage(tx, {
          recipientId: person.id,
          offerId: ready.thankYou.offerId,
          emailType: "thank_you",
          templateVersionId: ready.thankYou.templateVersionId,
          senderId: ready.thankYou.senderId,
          idempotencyKey: key,
          mergeData: { name: "Ada" },
          environment: "production",
        })
        throw new Error("rollback reservation")
      })
    ).rejects.toThrow("rollback reservation")
    expect(await messagesForKey(ready.db, key)).toHaveLength(0)
    expect(await probeRecipientLock(person.id)).toBe("acquired")
    const result = await triggerEmail(
      ready.db,
      {
        email,
        idempotencyKey: key,
        emailType: "thank_you",
        offerId: ready.thankYou.offerId,
        mergeData: { name: "Ada" },
      },
      deps()
    )
    expect(result.message.status).toBe("queued")
    expect(await messagesForKey(ready.db, key)).toHaveLength(1)
  })

  async function repeatCap(input: {
    rounds: number
    attempts: number
    maxCount: number
  }): Promise<Array<{ queued: number; capped: number }>> {
    const rounds = []
    for (let round = 0; round < input.rounds; round += 1) {
      rounds.push(await assertCapRound(input.attempts, input.maxCount))
    }
    return rounds
  }

  async function assertCapRound(
    attempts: number,
    maxCount: number
  ): Promise<{ queued: number; capped: number }> {
    const ready = requiredSeed()
    const email = `race-${token()}@example.com`
    await insertPerson(ready.db, email)
    const results = await Promise.all(
      Array.from({ length: attempts }, (_, index) =>
        triggerEmail(
          ready.db,
          {
            email,
            idempotencyKey: `t093-race-${token()}-${index}`,
            emailType: "engagement",
            offerId: ready.engagement.offerId,
            mergeData: { name: "Ada" },
          },
          deps()
        )
      )
    )
    const queued = results.filter(
      (result) => result.message.status === "queued"
    )
    const capped = results.filter(
      (result) =>
        result.message.status === "skipped" &&
        result.message.skipReason === "frequency_cap"
    )
    expect(queued).toHaveLength(maxCount)
    expect(capped).toHaveLength(attempts - maxCount)
    expect(new Set(results.map((result) => result.message.id)).size).toBe(
      attempts
    )
    const recipientIds = new Set(results.map((result) => result.recipient.id))
    expect(recipientIds.size).toBe(1)
    const stored = await ready.db
      .select()
      .from(message)
      .where(eq(message.recipientId, results[0]!.recipient.id))
    expect(stored.filter((row) => row.status === "queued")).toHaveLength(
      maxCount
    )
    expect(
      stored.filter((row) => row.skipReason === "frequency_cap")
    ).toHaveLength(attempts - maxCount)
    expect(new Set(stored.map((row) => row.idempotencyKey)).size).toBe(attempts)
    for (const result of queued) {
      expect((await readJob(result.message.id))?.messageId).toBe(
        result.message.id
      )
    }
    for (const result of capped) {
      expect(await readJob(result.message.id)).toBeUndefined()
    }
    return { queued: queued.length, capped: capped.length }
  }

  function requiredSeed(): Seed {
    if (!seed) throw new Error("T-093 seed did not run")
    return seed
  }

  async function expectNoJob(messageId: string): Promise<void> {
    expect(await readJob(messageId)).toBeUndefined()
  }
})

async function seedRoute(
  db: Database,
  staffId: string,
  suffix: string,
  emailType: TriggerEmailType,
  kind: "transactional" | "relationship"
): Promise<RouteSeed> {
  const [category] = await db
    .insert(emailCategory)
    .values({
      key: `t093_${emailType}_${suffix}_${token()}`,
      name: `T-093 ${emailType}`,
      kind,
      createdBy: staffId,
    })
    .returning()
  const domain = await createDomain(db, {
    name: `t093-${emailType}-${token()}.example.com`,
    createdBy: staffId,
  })
  const from = await createSender(db, {
    domainId: domain.id,
    fromName: `T-093 ${emailType}`,
    fromEmail: `${emailType}-${token()}@t093.example.com`,
    postalAddress: "100 Factory Street, Austin, TX 78701",
    createdBy: staffId,
  })
  if (!category) throw new Error("category insert failed")
  const [draft] = await db
    .insert(template)
    .values({
      name: `t093-${emailType}-${token()}`,
      emailType,
      categoryId: category.id,
      status: "active",
      createdBy: staffId,
    })
    .returning()
  if (!draft) throw new Error("template insert failed")
  const [version] = await db
    .insert(templateVersion)
    .values({
      templateId: draft.id,
      versionNo: 1,
      subject: "Hello {{name}}",
      bodySource: "<p>Hello {{name}}</p>",
      mergeTags: { name: "string" },
      createdBy: staffId,
    })
    .returning()
  if (!version) throw new Error("template version insert failed")
  await db
    .update(template)
    .set({ currentVersionId: version.id })
    .where(eq(template.id, draft.id))
  const [brand] = await db
    .insert(offer)
    .values({
      name: `T-093 ${emailType} ${token()}`,
      externalRef: `t093-${emailType}-${token()}`,
      status: "active",
    })
    .returning()
  if (!brand) throw new Error("offer insert failed")
  await db.insert(emailRoute).values({
    emailType,
    offerId: brand.id,
    templateId: draft.id,
    senderId: from.id,
    status: "active",
    createdBy: staffId,
  })

  return {
    offerId: brand.id,
    categoryId: category.id,
    templateVersionId: version.id,
    senderId: from.id,
  }
}

function token(): string {
  return randomBytes(4).toString("hex")
}

async function insertPerson(db: Database, email: string) {
  const [person] = await db
    .insert(recipient)
    .values({ email, emailHash: hashEmail(email) })
    .returning()
  if (!person) throw new Error("recipient insert failed")
  return person
}

async function messagesForKey(db: Database, key: string) {
  return db.select().from(message).where(eq(message.idempotencyKey, key))
}

async function messageCount(db: Database): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(message)
  return Number(row?.value ?? 0)
}

async function probeRecipientLock(
  recipientId: string
): Promise<"acquired" | "held"> {
  const client = await getPool().connect()
  try {
    await client.query("BEGIN")
    await client.query("SET LOCAL lock_timeout = '400ms'")
    try {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [
        recipientId,
      ])
      return "acquired"
    } catch (error) {
      if (isLockTimeout(error)) return "held"
      throw error
    } finally {
      await client.query("ROLLBACK")
    }
  } finally {
    client.release()
  }
}

async function waitForUngrantedAdvisoryLock(): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const result = await getPool().query<{ waiting: number }>(
      `select count(*)::int as waiting
       from pg_locks
       where locktype = 'advisory' and not granted`
    )
    if (Number(result.rows[0]?.waiting ?? 0) > 0) return
    await delay(20)
  }
  throw new Error("timed out waiting for an ungranted advisory lock")
}

async function waitUntil(ready: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000
  while (!ready()) {
    if (Date.now() > deadline)
      throw new Error("timed out waiting for the lock holder")
    await delay(10)
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isLockTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "55P03"
  )
}

function loopbackRedisUrl(): string | null {
  const candidates = [
    process.env.REDIS_URL,
    readEnvValue(path.resolve("apps/email-hub/.env"), "REDIS_URL"),
    readEnvValue(path.resolve(".env"), "REDIS_URL"),
  ]
  for (const value of candidates) {
    if (!value) continue
    try {
      const url = new URL(value)
      const loopback =
        url.hostname === "127.0.0.1" || url.hostname === "localhost"
      if (
        loopback &&
        (url.protocol === "redis:" || url.protocol === "rediss:")
      ) {
        return value
      }
    } catch {
      continue
    }
  }
  return null
}

function readEnvValue(file: string, key: string): string | null {
  if (!fs.existsSync(file)) return null
  const line = fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((entry) => entry.startsWith(`${key}=`))
  if (!line) return null
  return line
    .slice(key.length + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
}

function redisOptions(url: string): RedisOptions {
  const parsed = new URL(url)
  return {
    host: parsed.hostname,
    port: parsed.port === "" ? 6379 : Number(parsed.port),
    ...(parsed.password === ""
      ? {}
      : { password: decodeURIComponent(parsed.password) }),
    maxRetriesPerRequest: null,
  }
}
