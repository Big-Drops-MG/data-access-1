import { desc, sql } from "drizzle-orm"
import {
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"

export const auditActorType = pgEnum("audit_actor_type", [
  "user",
  "api_client",
  "system",
])

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorType: auditActorType("actor_type").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_log_created_at_idx").on(desc(table.createdAt)),
    index("audit_log_actor_idx").on(
      table.actorType,
      table.actorId,
      desc(table.createdAt)
    ),
    index("audit_log_entity_idx").on(table.entityType, table.entityId),
    index("audit_log_request_id_idx").on(table.requestId),
    check(
      "audit_log_actor_id_check",
      sql`(
        (${table.actorType} = 'system' AND ${table.actorId} IS NULL)
        OR (${table.actorType} IN ('user', 'api_client') AND ${table.actorId} IS NOT NULL)
      )`
    ),
  ]
)

export type AuditLog = typeof auditLog.$inferSelect
