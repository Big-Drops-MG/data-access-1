import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { domain } from "./domain.js"

export const domainSetupStepType = pgEnum("domain_setup_step_type", [
  "ses_identity",
  "dns_records",
  "verification",
])

export const domainSetupStepStatus = pgEnum("domain_setup_step_status", [
  "pending",
  "in_progress",
  "done",
  "failed",
])

export const domainSetupStep = pgTable(
  "domain_setup_step",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domain.id, { onDelete: "cascade" }),
    step: domainSetupStepType("step").notNull(),
    status: domainSetupStepStatus("status").notNull().default("pending"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", {
      withTimezone: true,
      mode: "date",
    }),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("domain_setup_step_domain_id_step_unique").on(
      table.domainId,
      table.step
    ),
    index("domain_setup_step_status_updated_at_idx").on(
      table.status,
      table.updatedAt
    ),
    index("domain_setup_step_domain_id_idx").on(table.domainId),
  ]
)

export type DomainSetupStep = typeof domainSetupStep.$inferSelect
export type NewDomainSetupStep = typeof domainSetupStep.$inferInsert
