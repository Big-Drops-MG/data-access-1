import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { getTableColumns, getTableName } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { send, sendStatus } from "./send.js"

const migrationDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle"
)

describe("send schema", () => {
  it("stores the T-072 configuration columns and draft status", () => {
    expect(getTableName(send)).toBe("send")
    expect(sendStatus.enumValues).toEqual([
      "draft",
      "scheduled",
      "queued",
      "dispatching",
      "completed",
      "cancelled",
      "failed",
    ])

    const columns = getTableColumns(send)
    expect(columns.templateVersionId.notNull).toBe(true)
    expect(columns.senderId.notNull).toBe(true)
    expect(columns.categoryId.notNull).toBe(true)
    expect(columns.offerId.notNull).toBe(false)
    expect(columns.scheduledFor.notNull).toBe(true)
    expect(columns.version.notNull).toBe(true)
    expect(columns.status.notNull).toBe(true)

    const foreignKeys = getTableConfig(send).foreignKeys.map((fk) =>
      fk.getName()
    )
    expect(foreignKeys).toEqual(
      expect.arrayContaining([
        "send_template_version_id_template_version_id_fk",
        "send_sender_id_sender_id_fk",
        "send_category_id_email_category_id_fk",
        "send_offer_id_offer_id_fk",
      ])
    )
    expect(
      getTableConfig(send).indexes.map((entry) => entry.config.name)
    ).toEqual(
      expect.arrayContaining([
        "send_status_scheduled_for_idx",
        "send_category_id_idx",
      ])
    )
  })

  it("migration adds draft and category without deleting rows", () => {
    const sql = readFileSync(
      path.join(migrationDir, "0013_send_draft_and_category.sql"),
      "utf8"
    )
    expect(sql).toContain("ADD VALUE 'draft' BEFORE 'scheduled'")
    expect(sql).toContain('ADD COLUMN "category_id"')
    expect(sql).toContain('SET "category_id"')
    expect(sql.toLowerCase()).not.toContain("delete from")
    expect(sql.toLowerCase()).not.toContain("truncate")
  })

  it("migration locks configuration after the send leaves draft", () => {
    const sql = readFileSync(
      path.join(migrationDir, "0014_send_editable_while_draft.sql"),
      "utf8"
    )
    expect(sql).toContain("OLD.status = 'draft'")
    expect(sql).toContain("NEW.category_id IS DISTINCT FROM OLD.category_id")
    expect(sql).toContain("send can only be edited while status is draft")
    expect(sql).toContain('DROP TRIGGER IF EXISTS "send_only_while_scheduled"')
    expect(sql).toContain('CREATE TRIGGER "send_only_while_draft"')
    expect(sql.toLowerCase()).not.toContain("delete from")
    expect(sql.toLowerCase()).not.toContain("truncate")
  })
})
