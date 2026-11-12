import { describe, expect, it, vi } from "vitest"

import {
  collapseImportRows,
  ingestRecipientRows,
  normalizeImportEmail,
  recipientImportsDir,
  resolveEmailColumnIndex,
  upsertRecipientBatch,
} from "./recipient-csv-ingest.js"

describe("recipient-csv-ingest helpers", () => {
  it("resolves email column case-insensitively", () => {
    expect(resolveEmailColumnIndex(["Name", "Email", "Id"])).toBe(1)
    expect(resolveEmailColumnIndex(["email"])).toBe(0)
    expect(resolveEmailColumnIndex(["name"])).toBe(-1)
  })

  it("normalises valid emails and rejects invalid", () => {
    expect(normalizeImportEmail("  Ada@Example.COM ")).toEqual({
      ok: true,
      email: "ada@example.com",
    })
    expect(normalizeImportEmail("")).toEqual({ ok: false })
    expect(normalizeImportEmail("not-an-email")).toEqual({ ok: false })
  })

  it("defaults imports dir to /data/imports", () => {
    expect(recipientImportsDir(undefined)).toBe("/data/imports")
    expect(recipientImportsDir("  /tmp/imports  ")).toBe("/tmp/imports")
  })

  it("collapses duplicates with last-wins and counts invalid/skipped", () => {
    const result = collapseImportRows([
      {
        emailRaw: "a@example.com",
        externalUserIdRaw: "first",
        hasExternalColumn: true,
      },
      { emailRaw: "bad", hasExternalColumn: true },
      {
        emailRaw: "A@Example.com",
        externalUserIdRaw: "last",
        hasExternalColumn: true,
      },
      {
        emailRaw: "b@example.com",
        externalUserIdRaw: "b1",
        hasExternalColumn: true,
      },
      { emailRaw: "", hasExternalColumn: true },
    ])

    expect(result.invalid).toBe(2)
    expect(result.skipped).toBe(1)
    expect(result.unique).toEqual([
      { email: "a@example.com", externalUserId: "last" },
      { email: "b@example.com", externalUserId: "b1" },
    ])
  })
})

describe("upsertRecipientBatch / ingestRecipientRows", () => {
  it("counts added and updated for mixed existing rows", async () => {
    const selectResults = [
      [{ id: "id-existing" }], // existing@example.com
      [], // new@example.com
    ]
    let selectCalls = 0
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => selectResults[selectCalls++] ?? []),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => undefined),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    }

    const counts = await upsertRecipientBatch(db as never, [
      { email: "existing@example.com", externalUserId: "ext-1" },
      { email: "new@example.com", externalUserId: "ext-2" },
    ])

    expect(counts).toEqual({ added: 1, updated: 1 })
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it("reports correct counts for duplicates and invalid rows", async () => {
    const selectResults: Array<Array<{ id: string }>> = [[], []]
    let selectCalls = 0
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => selectResults[selectCalls++] ?? []),
          })),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(async () => undefined),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    }

    const counts = await ingestRecipientRows(
      db as never,
      [
        { emailRaw: "Ada@Example.com", externalUserIdRaw: "a1" },
        { emailRaw: "not-valid" },
        { emailRaw: "ada@example.com", externalUserIdRaw: "a2" },
        { emailRaw: "blair@example.com", externalUserIdRaw: "b1" },
        { emailRaw: "" },
      ],
      { chunkSize: 1 }
    )

    expect(counts).toEqual({
      rows_read: 5,
      added: 2,
      updated: 0,
      skipped: 1,
      invalid: 2,
    })
    expect(db.insert).toHaveBeenCalledTimes(2)
  })
})
