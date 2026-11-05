import type { EmailCategory } from "@workspace/db"

export type EmailCategoryJson = {
  id: string
  key: string
  name: string
  description: string | null
  kind: EmailCategory["kind"]
  default_opted_in: boolean
  is_active: boolean
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
