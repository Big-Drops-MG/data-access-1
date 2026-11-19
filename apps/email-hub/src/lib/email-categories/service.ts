import { asc, eq } from "drizzle-orm"

import { emailCategory, frequencyRule } from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"

import {
  serializeEmailCategory,
  serializeFrequencyRule,
  type EmailCategoryJson,
  type FrequencyRuleJson,
} from "./serialize"

export async function listEmailCategories(db: Database = getDb()): Promise<{
  data: EmailCategoryJson[]
  frequency_rules: FrequencyRuleJson[]
}> {
  const [categories, rules] = await Promise.all([
    db
      .select()
      .from(emailCategory)
      .where(eq(emailCategory.isActive, true))
      .orderBy(asc(emailCategory.key)),
    db.select().from(frequencyRule).orderBy(asc(frequencyRule.kind)),
  ])

  return {
    data: categories.map(serializeEmailCategory),
    frequency_rules: rules.map(serializeFrequencyRule),
  }
}
