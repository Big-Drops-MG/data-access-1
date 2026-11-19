import type { EmailCategory, FrequencyRule } from "@workspace/db"

export type EmailCategoryJson = {
  id: string
  key: string
  name: string
  description: string | null
  kind: EmailCategory["kind"]
  default_opted_in: boolean
  is_active: boolean
}

export type FrequencyRuleJson = {
  id: string
  kind: FrequencyRule["kind"]
  category_id: string | null
  max_count: number | null
  window_days: number | null
  blocks_with_type: FrequencyRule["blocksWithType"] | null
  min_gap_hours: number | null
  version: number
}

export function serializeEmailCategory(row: EmailCategory): EmailCategoryJson {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    kind: row.kind,
    default_opted_in: row.defaultOptedIn,
    is_active: row.isActive,
  }
}

export function serializeFrequencyRule(row: FrequencyRule): FrequencyRuleJson {
  return {
    id: row.id,
    kind: row.kind,
    category_id: row.categoryId,
    max_count: row.maxCount,
    window_days: row.windowDays,
    blocks_with_type: row.blocksWithType,
    min_gap_hours: row.minGapHours,
    version: row.version,
  }
}
