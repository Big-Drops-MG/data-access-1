import { sql } from "drizzle-orm"
import {
  check,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { emailType } from "./email-type.js"
import { emailCategory } from "./email-category.js"
import { user } from "./user.js"

export const frequencyRuleKind = pgEnum("frequency_rule_kind", [
  "cap",
  "collision",
])

export const frequencyRule = pgTable(
  "frequency_rule",
  {
    id: uuidv7PrimaryKey(),
    kind: frequencyRuleKind("kind").notNull(),
    categoryId: uuid("category_id").references(() => emailCategory.id, {
      onDelete: "restrict",
    }),
    maxCount: integer("max_count"),
    windowDays: integer("window_days"),
    blocksWithType: emailType("blocks_with_type"),
    minGapHours: integer("min_gap_hours"),
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("frequency_rule_kind_category_unique")
      .on(table.kind, table.categoryId)
      .where(sql`${table.categoryId} IS NOT NULL`),
    uniqueIndex("frequency_rule_kind_global_unique")
      .on(table.kind)
      .where(sql`${table.categoryId} IS NULL`),
    check("frequency_rule_version_positive", sql`${table.version} > 0`),
    check(
      "frequency_rule_numbers_check",
      sql`(
        (${table.maxCount} IS NULL OR ${table.maxCount} > 0)
        AND (${table.windowDays} IS NULL OR ${table.windowDays} > 0)
        AND (${table.minGapHours} IS NULL OR ${table.minGapHours} >= 0)
        AND (
          (${table.kind} = 'cap' AND ${table.maxCount} IS NOT NULL AND ${table.windowDays} IS NOT NULL)
          OR (${table.kind} = 'collision' AND ${table.blocksWithType} IS NOT NULL AND ${table.minGapHours} IS NOT NULL)
        )
      )`
    ),
  ]
)

export type FrequencyRule = typeof frequencyRule.$inferSelect
