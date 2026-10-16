import { desc, sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { emailType } from "./email-type.js"
import { user } from "./user.js"

export const templateStatus = pgEnum("template_status", [
  "draft",
  "active",
  "archived",
])

export const templateVersion = pgTable(
  "template_version",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references((): AnyPgColumn => template.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    subject: text("subject").notNull(),
    bodySource: text("body_source").notNull(),
    mergeTags: jsonb("merge_tags")
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("template_version_template_version_no_unique").on(
      table.templateId,
      table.versionNo
    ),
    uniqueIndex("template_version_id_template_unique").on(
      table.id,
      table.templateId
    ),
    index("template_version_template_created_at_idx").on(
      table.templateId,
      desc(table.createdAt)
    ),
    check("template_version_no_positive", sql`${table.versionNo} > 0`),
  ]
)

export const template = pgTable(
  "template",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    emailType: emailType("email_type").notNull(),
    categoryId: uuid("category_id").notNull(),
    currentVersionId: uuid("current_version_id"),
    status: templateStatus("status").notNull(),
    createdBy: uuid("created_by")
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
    uniqueIndex("template_name_unique").on(table.name),
    index("template_email_type_status_idx").on(table.emailType, table.status),
    foreignKey({
      name: "template_current_version_same_template_fk",
      columns: [table.currentVersionId, table.id],
      foreignColumns: [templateVersion.id, templateVersion.templateId],
    }),
  ]
)

export type Template = typeof template.$inferSelect
export type TemplateVersion = typeof templateVersion.$inferSelect
