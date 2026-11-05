import { asc, eq } from "drizzle-orm"

import { emailCategory } from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"

import { serializeEmailCategory, type EmailCategoryJson } from "./serialize"

export async function listEmailCategories(
  db: Database = getDb()
): Promise<{ data: EmailCategoryJson[] }> {
  const rows = await db
    .select()
    .from(emailCategory)
    .where(eq(emailCategory.isActive, true))
    .orderBy(asc(emailCategory.key))

  return { data: rows.map(serializeEmailCategory) }
}
