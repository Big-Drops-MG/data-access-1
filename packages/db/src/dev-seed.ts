import { createHash } from "node:crypto"

import { eq } from "drizzle-orm"

import type { Database } from "./client.js"
import {
  assertApplicationDatabaseUrl,
  databaseUrlIdentity,
} from "./connection-policy.js"
import { loadEmailCatalog, seedEmailCatalog } from "./email-catalog-seed.js"
import {
  emailCategory,
  feedbackClassification,
  message,
  offer,
  recipient,
  recipientPreference,
  user,
} from "./schema/index.js"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"])

export const DEV_USER = {
  email: "dev-admin@example.com",
  name: "Dev Admin",
  role: "admin",
  status: "active",
} as const

const catalog = loadEmailCatalog()

export const DEV_CATEGORIES = catalog.categories.map((category) => ({
  key: category.key,
  name: category.name,
  description: category.description ?? undefined,
  kind: category.kind,
}))

export const DEV_FREQUENCY_RULES = catalog.frequency_rules.map((rule) =>
  rule.kind === "cap"
    ? {
        kind: "cap" as const,
        maxCount: rule.max_count,
        windowDays: rule.window_days,
      }
    : {
        kind: "collision" as const,
        blocksWithType: rule.blocks_with_type,
        minGapHours: rule.min_gap_hours,
      }
)

export const DEV_OFFER = {
  name: "Sample offer",
  externalRef: "dev-sample-offer",
  status: "active",
} as const

export const DEV_RECIPIENTS = [
  {
    email: "maria.lopez@example.com",
    tier: "premium",
    status: "active",
    externalUserId: "dev-maria",
    lastEmailedAt: "2026-10-08T17:58:00.000Z",
  },
  {
    email: "j.whitaker@example.org",
    tier: "standard",
    status: "active",
    externalUserId: "dev-whitaker",
    lastEmailedAt: "2026-10-07T13:20:00.000Z",
    optOutEngagement: true,
  },
  {
    email: "ada@example.com",
    tier: "standard",
    status: "active",
    externalUserId: "dev-ada",
    lastEmailedAt: "2026-10-06T15:00:00.000Z",
  },
  {
    email: "blair@example.com",
    tier: "premium",
    status: "active",
    externalUserId: "dev-blair",
    lastEmailedAt: "2026-10-05T19:30:00.000Z",
  },
  {
    email: "casey@example.com",
    tier: "standard",
    status: "bounced",
    externalUserId: "dev-casey",
    lastEmailedAt: "2026-09-28T12:00:00.000Z",
  },
  {
    email: "noah.patel@example.com",
    tier: "premium",
    status: "active",
    externalUserId: "dev-noah",
    lastEmailedAt: "2026-10-08T11:12:00.000Z",
  },
  {
    email: "samira.khan@example.com",
    tier: "standard",
    status: "active",
    externalUserId: "dev-samira",
    lastEmailedAt: null,
  },
  {
    email: "hardbounce@example.com",
    tier: "standard",
    status: "bounced",
    externalUserId: "dev-bounce",
    lastEmailedAt: "2026-09-12T08:45:00.000Z",
  },
] as const

export const DEV_FEEDBACK_CLASSIFICATIONS = [
  { key: "didnt_sign_up", label: "Didn't sign up" },
  { key: "spam", label: "Spam / unwanted" },
  { key: "too_frequent", label: "Too frequent" },
  { key: "other", label: "Other" },
] as const

export type DevSeedResult = {
  categories: number
  frequencyRules: number
  offers: number
  recipients: number
  messages: number
  feedbackClassifications: number
}

export function hashNormalisedEmail(email: string): string {
  return createHash("sha256")
    .update(email.trim().toLowerCase(), "utf8")
    .digest("hex")
}

export function assertDevSeedTarget(connectionString: string): void {
  assertApplicationDatabaseUrl(connectionString)
  const identity = databaseUrlIdentity(connectionString)
  if (!LOOPBACK_HOSTS.has(identity.host)) {
    throw new Error("Dev seed only runs against a loopback database.")
  }
}

export async function seedDev(db: Database): Promise<DevSeedResult> {
  const userId = await ensureUser(db)
  const catalogResult = await seedEmailCatalog(db, {
    updatedByUserId: userId,
    reconcile: false,
  })
  const offerId = await ensureOffer(db)
  await ensureRecipients(db)
  await ensureRecipientPreferences(db)
  const messages = await ensureOfferMessages(db, offerId)
  await ensureFeedbackClassifications(db, userId)

  return {
    categories: catalogResult.categories,
    frequencyRules: catalogResult.frequencyRules,
    offers: 1,
    recipients: DEV_RECIPIENTS.length,
    messages,
    feedbackClassifications: DEV_FEEDBACK_CLASSIFICATIONS.length,
  }
}

async function ensureUser(db: Database): Promise<string> {
  const [inserted] = await db
    .insert(user)
    .values({
      email: DEV_USER.email,
      name: DEV_USER.name,
      role: DEV_USER.role,
      status: DEV_USER.status,
    })
    .onConflictDoNothing({ target: user.email })
    .returning({ id: user.id })

  if (inserted) {
    return inserted.id
  }

  const [existing] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEV_USER.email))

  if (!existing) {
    throw new Error("Dev user was not inserted.")
  }

  return existing.id
}

async function ensureOffer(db: Database): Promise<string> {
  const [inserted] = await db
    .insert(offer)
    .values({
      name: DEV_OFFER.name,
      externalRef: DEV_OFFER.externalRef,
      status: DEV_OFFER.status,
    })
    .onConflictDoNothing({ target: offer.externalRef })
    .returning({ id: offer.id })

  if (inserted) {
    return inserted.id
  }

  const [existing] = await db
    .select({ id: offer.id })
    .from(offer)
    .where(eq(offer.externalRef, DEV_OFFER.externalRef))
    .limit(1)

  if (!existing) {
    throw new Error("Dev offer was not inserted.")
  }

  return existing.id
}

async function ensureRecipients(db: Database): Promise<void> {
  for (const row of DEV_RECIPIENTS) {
    const lastEmailedAt = row.lastEmailedAt ? new Date(row.lastEmailedAt) : null
    await db
      .insert(recipient)
      .values({
        email: row.email,
        emailHash: hashNormalisedEmail(row.email),
        externalUserId: row.externalUserId,
        tier: row.tier,
        status: row.status,
        lastEmailedAt,
      })
      .onConflictDoUpdate({
        target: recipient.email,
        set: {
          externalUserId: row.externalUserId,
          tier: row.tier,
          status: row.status,
          lastEmailedAt,
          updatedAt: new Date(),
        },
      })
  }
}

async function ensureRecipientPreferences(db: Database): Promise<void> {
  const [engagement] = await db
    .select({ id: emailCategory.id })
    .from(emailCategory)
    .where(eq(emailCategory.key, "engagement"))
    .limit(1)

  if (!engagement) {
    return
  }

  for (const row of DEV_RECIPIENTS) {
    if (!("optOutEngagement" in row) || !row.optOutEngagement) {
      continue
    }
    const [existing] = await db
      .select({ id: recipient.id })
      .from(recipient)
      .where(eq(recipient.email, row.email))
      .limit(1)
    if (!existing) {
      continue
    }
    await db
      .insert(recipientPreference)
      .values({
        recipientId: existing.id,
        categoryId: engagement.id,
        optedOut: true,
        source: "unsubscribe_link",
      })
      .onConflictDoNothing({
        target: [
          recipientPreference.recipientId,
          recipientPreference.categoryId,
        ],
      })
  }
}

/**
 * Link each seeded recipient to the sample offer via a skipped message so Hub
 * offer-scoped recipient lists (T-152) show mock rows when Sample offer is selected.
 */
async function ensureOfferMessages(
  db: Database,
  offerId: string
): Promise<number> {
  let created = 0
  for (const row of DEV_RECIPIENTS) {
    const [existingRecipient] = await db
      .select({ id: recipient.id })
      .from(recipient)
      .where(eq(recipient.email, row.email))
      .limit(1)
    if (!existingRecipient) {
      continue
    }

    const idempotencyKey = `dev-seed:${offerId}:${existingRecipient.id}:thank_you`
    const sentAt = row.lastEmailedAt ? new Date(row.lastEmailedAt) : new Date()
    const [inserted] = await db
      .insert(message)
      .values({
        recipientId: existingRecipient.id,
        offerId,
        emailType: "thank_you",
        idempotencyKey,
        status: "skipped",
        skipReason: "no_route",
        queuedAt: sentAt,
        sentAt: null,
      })
      .onConflictDoNothing({ target: message.idempotencyKey })
      .returning({ id: message.id })

    if (inserted) {
      created += 1
    }
  }
  return created
}

async function ensureFeedbackClassifications(
  db: Database,
  createdBy: string
): Promise<void> {
  for (const row of DEV_FEEDBACK_CLASSIFICATIONS) {
    await db
      .insert(feedbackClassification)
      .values({
        key: row.key,
        label: row.label,
        active: true,
        createdBy,
      })
      .onConflictDoNothing({ target: feedbackClassification.key })
  }
}
