import { createHash } from "node:crypto"

import { and, eq, isNull } from "drizzle-orm"

import type { Database } from "./client.js"
import {
  assertApplicationDatabaseUrl,
  databaseUrlIdentity,
} from "./connection-policy.js"
import {
  emailCategory,
  frequencyRule,
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

export const DEV_CATEGORIES = [
  {
    key: "thank_you",
    name: "Thank you",
    description: "Post-purchase thank you",
    kind: "transactional",
  },
  {
    key: "feedback_request",
    name: "Feedback request",
    description: "Ask the recipient for feedback",
    kind: "transactional",
  },
  {
    key: "engagement",
    name: "Engagement",
    description: "Relationship engagement",
    kind: "relationship",
  },
] as const

export const DEV_FREQUENCY_RULES = [
  { kind: "cap", maxCount: 3, windowDays: 7 },
  { kind: "collision", blocksWithType: "thank_you", minGapHours: 24 },
] as const

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

export type DevSeedResult = {
  categories: number
  frequencyRules: number
  offers: number
  recipients: number
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
  await ensureCategories(db, userId)
  await ensureFrequencyRules(db, userId)
  await ensureOffer(db)
  await ensureRecipients(db)

  return {
    categories: DEV_CATEGORIES.length,
    frequencyRules: DEV_FREQUENCY_RULES.length,
    offers: 1,
    recipients: DEV_RECIPIENTS.length,
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

async function ensureCategories(db: Database, userId: string): Promise<void> {
  for (const category of DEV_CATEGORIES) {
    await db
      .insert(emailCategory)
      .values({
        key: category.key,
        name: category.name,
        description: category.description,
        kind: category.kind,
        createdBy: userId,
      })
      .onConflictDoNothing({ target: emailCategory.key })
  }
}

async function ensureFrequencyRules(
  db: Database,
  userId: string
): Promise<void> {
  for (const rule of DEV_FREQUENCY_RULES) {
    const [existing] = await db
      .select({ id: frequencyRule.id })
      .from(frequencyRule)
      .where(
        and(eq(frequencyRule.kind, rule.kind), isNull(frequencyRule.categoryId))
      )

    if (existing) {
      continue
    }

    await db.insert(frequencyRule).values({
      kind: rule.kind,
      updatedBy: userId,
      ...frequencyRuleValues(rule),
    })
  }
}

function frequencyRuleValues(
  rule: (typeof DEV_FREQUENCY_RULES)[number]
):
  | { maxCount: number; windowDays: number }
  | { blocksWithType: "thank_you"; minGapHours: number } {
  if (rule.kind === "cap") {
    return { maxCount: rule.maxCount, windowDays: rule.windowDays }
  }

  return {
    blocksWithType: rule.blocksWithType,
    minGapHours: rule.minGapHours,
  }
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
