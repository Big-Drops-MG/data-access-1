import { createHash } from "node:crypto"

import { eq } from "drizzle-orm"

import type { Database } from "./client.js"
import {
  assertApplicationDatabaseUrl,
  databaseUrlIdentity,
} from "./connection-policy.js"
import { loadEmailCatalog, seedEmailCatalog } from "./email-catalog-seed.js"
import {
  feedbackClassification,
  offer,
  recipient,
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
  { email: "ada@example.com", tier: "standard", externalUserId: "dev-ada" },
  { email: "blair@example.com", tier: "premium", externalUserId: "dev-blair" },
  { email: "casey@example.com", tier: "standard", externalUserId: "dev-casey" },
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
  await ensureOffer(db)
  await ensureRecipients(db)
  await ensureFeedbackClassifications(db, userId)

  return {
    categories: catalogResult.categories,
    frequencyRules: catalogResult.frequencyRules,
    offers: 1,
    recipients: DEV_RECIPIENTS.length,
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

async function ensureOffer(db: Database): Promise<void> {
  await db
    .insert(offer)
    .values({
      name: DEV_OFFER.name,
      externalRef: DEV_OFFER.externalRef,
      status: DEV_OFFER.status,
    })
    .onConflictDoNothing({ target: offer.externalRef })
}

async function ensureRecipients(db: Database): Promise<void> {
  for (const row of DEV_RECIPIENTS) {
    await db
      .insert(recipient)
      .values({
        email: row.email,
        emailHash: hashNormalisedEmail(row.email),
        externalUserId: row.externalUserId,
        tier: row.tier,
      })
      .onConflictDoNothing({ target: recipient.email })
  }
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
