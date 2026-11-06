import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { and, eq, isNull } from "drizzle-orm"

import type { Database } from "./client.js"
import { emailCategory, frequencyRule } from "./schema/index.js"

const CATALOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../seed/email-catalog.v1.json"
)

const CATEGORY_KEY = /^[a-z][a-z0-9_]*$/
const EMAIL_TYPES = new Set(["thank_you", "feedback_request", "engagement"])

export type EmailCatalogCategory = {
  key: string
  name: string
  description: string | null
  kind: "transactional" | "relationship"
  default_opted_in: boolean
}

export type EmailCatalogFrequencyRule =
  | {
      kind: "cap"
      category_key: string | null
      max_count: number
      window_days: number
    }
  | {
      kind: "collision"
      category_key: string | null
      blocks_with_type: "thank_you" | "feedback_request" | "engagement"
      min_gap_hours: number
    }

export type EmailCatalog = {
  version: 1
  categories: EmailCatalogCategory[]
  frequency_rules: EmailCatalogFrequencyRule[]
}

export type EmailCatalogSeedResult = {
  version: number
  categories: number
  frequencyRules: number
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseCategory(value: unknown, index: number): EmailCatalogCategory {
  if (!isObject(value)) {
    throw new Error(`categories[${index}] must be an object`)
  }
  const key = value.key
  const name = value.name
  const kind = value.kind
  if (typeof key !== "string" || !CATEGORY_KEY.test(key)) {
    throw new Error(`categories[${index}].key is invalid`)
  }
  if (typeof name !== "string" || name.length < 1 || name.length > 128) {
    throw new Error(`categories[${index}].name is invalid`)
  }
  if (kind !== "transactional" && kind !== "relationship") {
    throw new Error(`categories[${index}].kind is invalid`)
  }
  const description =
    value.description == null
      ? null
      : typeof value.description === "string"
        ? value.description
        : (() => {
            throw new Error(`categories[${index}].description is invalid`)
          })()
  const defaultOptedIn =
    value.default_opted_in === undefined ? true : value.default_opted_in
  if (typeof defaultOptedIn !== "boolean") {
    throw new Error(`categories[${index}].default_opted_in is invalid`)
  }
  return {
    key,
    name,
    description,
    kind,
    default_opted_in: defaultOptedIn,
  }
}

function parseFrequencyRule(
  value: unknown,
  index: number
): EmailCatalogFrequencyRule {
  if (!isObject(value)) {
    throw new Error(`frequency_rules[${index}] must be an object`)
  }
  const kind = value.kind
  const categoryKey = value.category_key
  if (categoryKey !== null && typeof categoryKey !== "string") {
    throw new Error(`frequency_rules[${index}].category_key is invalid`)
  }
  if (kind === "cap") {
    if (
      typeof value.max_count !== "number" ||
      !Number.isInteger(value.max_count) ||
      value.max_count < 1 ||
      typeof value.window_days !== "number" ||
      !Number.isInteger(value.window_days) ||
      value.window_days < 1
    ) {
      throw new Error(
        `frequency_rules[${index}] cap requires positive max_count and window_days`
      )
    }
    return {
      kind: "cap",
      category_key: categoryKey,
      max_count: value.max_count,
      window_days: value.window_days,
    }
  }
  if (kind === "collision") {
    if (
      typeof value.blocks_with_type !== "string" ||
      !EMAIL_TYPES.has(value.blocks_with_type) ||
      typeof value.min_gap_hours !== "number" ||
      !Number.isInteger(value.min_gap_hours) ||
      value.min_gap_hours < 0
    ) {
      throw new Error(
        `frequency_rules[${index}] collision requires blocks_with_type and min_gap_hours`
      )
    }
    return {
      kind: "collision",
      category_key: categoryKey,
      blocks_with_type: value.blocks_with_type as
        "thank_you" | "feedback_request" | "engagement",
      min_gap_hours: value.min_gap_hours,
    }
  }
  throw new Error(`frequency_rules[${index}].kind is invalid`)
}

export function loadEmailCatalog(path = CATALOG_PATH): EmailCatalog {
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown
  if (!isObject(raw) || raw.version !== 1) {
    throw new Error("email catalog version must be 1")
  }
  if (!Array.isArray(raw.categories) || raw.categories.length < 1) {
    throw new Error("email catalog categories must be a non-empty array")
  }
  if (!Array.isArray(raw.frequency_rules) || raw.frequency_rules.length < 1) {
    throw new Error("email catalog frequency_rules must be a non-empty array")
  }
  return {
    version: 1,
    categories: raw.categories.map(parseCategory),
    frequency_rules: raw.frequency_rules.map(parseFrequencyRule),
  }
}

export async function seedEmailCatalog(
  db: Database,
  input: { updatedByUserId: string; catalogPath?: string }
): Promise<EmailCatalogSeedResult> {
  const catalog = loadEmailCatalog(input.catalogPath)
  const categoryIds = new Map<string, string>()

  for (const category of catalog.categories) {
    const [inserted] = await db
      .insert(emailCategory)
      .values({
        key: category.key,
        name: category.name,
        description: category.description,
        kind: category.kind,
        defaultOptedIn: category.default_opted_in,
        createdBy: input.updatedByUserId,
      })
      .onConflictDoNothing({ target: emailCategory.key })
      .returning({ id: emailCategory.id, key: emailCategory.key })

    if (inserted) {
      categoryIds.set(inserted.key, inserted.id)
      continue
    }

    const [existing] = await db
      .select({ id: emailCategory.id, key: emailCategory.key })
      .from(emailCategory)
      .where(eq(emailCategory.key, category.key))
      .limit(1)

    if (!existing) {
      throw new Error(`Category ${category.key} missing after upsert`)
    }

    await db
      .update(emailCategory)
      .set({
        name: category.name,
        description: category.description,
        kind: category.kind,
        defaultOptedIn: category.default_opted_in,
        updatedAt: new Date(),
      })
      .where(eq(emailCategory.id, existing.id))

    categoryIds.set(existing.key, existing.id)
  }

  for (const rule of catalog.frequency_rules) {
    const categoryId =
      rule.category_key == null
        ? null
        : (categoryIds.get(rule.category_key) ?? null)
    if (rule.category_key != null && categoryId == null) {
      throw new Error(
        `frequency_rule references unknown category_key ${rule.category_key}`
      )
    }

    const [existing] =
      categoryId == null
        ? await db
            .select()
            .from(frequencyRule)
            .where(
              and(
                eq(frequencyRule.kind, rule.kind),
                isNull(frequencyRule.categoryId)
              )
            )
            .limit(1)
        : await db
            .select()
            .from(frequencyRule)
            .where(
              and(
                eq(frequencyRule.kind, rule.kind),
                eq(frequencyRule.categoryId, categoryId)
              )
            )
            .limit(1)

    if (rule.kind === "cap") {
      if (
        existing &&
        existing.kind === "cap" &&
        existing.maxCount === rule.max_count &&
        existing.windowDays === rule.window_days
      ) {
        continue
      }
      if (existing) {
        await db
          .update(frequencyRule)
          .set({
            maxCount: rule.max_count,
            windowDays: rule.window_days,
            blocksWithType: null,
            minGapHours: null,
            updatedBy: input.updatedByUserId,
            updatedAt: new Date(),
            version: existing.version + 1,
          })
          .where(eq(frequencyRule.id, existing.id))
      } else {
        await db.insert(frequencyRule).values({
          kind: "cap",
          categoryId,
          maxCount: rule.max_count,
          windowDays: rule.window_days,
          updatedBy: input.updatedByUserId,
          version: 1,
        })
      }
      continue
    }

    if (
      existing &&
      existing.kind === "collision" &&
      existing.blocksWithType === rule.blocks_with_type &&
      existing.minGapHours === rule.min_gap_hours
    ) {
      continue
    }
    if (existing) {
      await db
        .update(frequencyRule)
        .set({
          maxCount: null,
          windowDays: null,
          blocksWithType: rule.blocks_with_type,
          minGapHours: rule.min_gap_hours,
          updatedBy: input.updatedByUserId,
          updatedAt: new Date(),
          version: existing.version + 1,
        })
        .where(eq(frequencyRule.id, existing.id))
    } else {
      await db.insert(frequencyRule).values({
        kind: "collision",
        categoryId,
        blocksWithType: rule.blocks_with_type,
        minGapHours: rule.min_gap_hours,
        updatedBy: input.updatedByUserId,
        version: 1,
      })
    }
  }

  return {
    version: catalog.version,
    categories: catalog.categories.length,
    frequencyRules: catalog.frequency_rules.length,
  }
}
