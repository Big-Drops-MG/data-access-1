import { sql } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"

import { uuidv7PrimaryKey } from "./columns.js"

import { user } from "./user.js"

export const apiClientStatus = pgEnum("api_client_status", [
  "active",
  "revoked",
])

export const apiClient = pgTable(
  "api_client",
  {
    id: uuidv7PrimaryKey(),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    /** SHA-256 hex of the current secret (never returned after create/rotate). */
    secretHash: text("secret_hash").notNull(),
    /**
     * AES-256-GCM ciphertext of the current HMAC secret (APP_ENCRYPTION_KEY).
     * Required for signature verification; plaintext is shown once at create/rotate.
     */
    secretEncrypted: text("secret_encrypted"),
    /** SHA-256 hex of the previous secret during rotation overlap. */
    oldSecretHash: text("old_secret_hash"),
    /** AES-256-GCM ciphertext of the previous secret during rotation overlap. */
    oldSecretEncrypted: text("old_secret_encrypted"),
    /** When the current secret replaced the previous one. */
    rotatedAt: timestamp("rotated_at", { withTimezone: true, mode: "date" }),
    scopes: text("scopes")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Empty = any IP. Non-empty → other IPs get 403. */
    ipAllowlist: text("ip_allowlist")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: apiClientStatus("status").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    createdBy: uuid("created_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("api_client_key_prefix_unique").on(table.keyPrefix),
    index("api_client_status_idx").on(table.status),
  ]
)

export type ApiClient = typeof apiClient.$inferSelect
