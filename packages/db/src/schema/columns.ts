import { sql } from "drizzle-orm"
import { customType, uuid } from "drizzle-orm/pg-core"

export const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext"
  },
})

export function uuidv7PrimaryKey(columnName = "id") {
  return uuid(columnName)
    .primaryKey()
    .default(sql`uuidv7()`)
    .notNull()
}
