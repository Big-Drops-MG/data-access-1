import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  assertCsvHasEmailColumn,
  collapseImportRows,
  ingestRecipientCsvFile,
  ingestRecipientRows,
  normalizeImportEmail,
  recipientImportsDir,
  resolveEmailColumnIndex,
  resolveExternalUserIdColumnIndex,
  upsertRecipientBatch,
} from "./recipient-csv-ingest.js"

const tempDirs: string[] = []

async function writeTempCsv(contents: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "recipient-csv-"))
  tempDirs.push(dir)
  const filePath = path.join(dir, "import.csv")
  await writeFile(filePath, contents, "utf8")
  return filePath
}

function mockDb(selectResults: Array<Array<{ id: string }>>) {
  let selectCalls = 0
  return {
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
}

afterEach(async () => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

describe("recipient-csv-ingest helpers", () => {
  it("resolves email column case-insensitively", () => {
    expect(resolveEmailColumnIndex(["Name", "Email", "Id"])).toBe(1)
    expect(resolveEmailColumnIndex(["email"])).toBe(0)
    expect(resolveEmailColumnIndex(["name"])).toBe(-1)
  })

  it("resolves external_user_id column variants", () => {
    expect(
      resolveExternalUserIdColumnIndex(["email", "external_user_id"])
    ).toBe(1)
    expect(
      resolveExternalUserIdColumnIndex(["email", "External-User-Id"])
    ).toBe(1)
    expect(resolveExternalUserIdColumnIndex(["email", "external userid"])).toBe(
      1
    )
    expect(resolveExternalUserIdColumnIndex(["email", "externalUserId"])).toBe(
      -1
    )
    expect(resolveExternalUserIdColumnIndex(["email", "name"])).toBe(-1)
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

  it("collapses blank external ids to null when the column is present", () => {
    const result = collapseImportRows([
      {
        emailRaw: "a@example.com",
        externalUserIdRaw: "  ",
        hasExternalColumn: true,
      },
      {
        emailRaw: "b@example.com",
        hasExternalColumn: false,
      },
    ])

    expect(result.unique).toEqual([
      { email: "a@example.com", externalUserId: null },
      { email: "b@example.com" },
    ])
  })
})

describe("assertCsvHasEmailColumn", () => {
  it("accepts a CSV whose first non-empty line has an email header", async () => {
    const filePath = await writeTempCsv(
      "\n\nName,Email,external_user_id\nada@example.com,Ada,1\n"
    )
    await expect(assertCsvHasEmailColumn(filePath)).resolves.toBeUndefined()
  })

  it("rejects a CSV without an email column", async () => {
    const filePath = await writeTempCsv("Name,Id\nAda,1\n")
    await expect(assertCsvHasEmailColumn(filePath)).rejects.toThrow(
      "CSV must include an email column"
    )
  })

  it("rejects an empty CSV", async () => {
    const filePath = await writeTempCsv("\n\n")
    await expect(assertCsvHasEmailColumn(filePath)).rejects.toThrow(
      "CSV must include an email column"
    )
  })
})

describe("ingestRecipientCsvFile", () => {
  it("streams a CSV, last-wins duplicates, and upserts in chunks", async () => {
    const filePath = await writeTempCsv(
      [
        "email,external_user_id",
        "Ada@Example.com,first",
        "not-valid,",
        "ada@example.com,last",
        "blair@example.com,",
        ",",
      ].join("\n")
    )
    const db = mockDb([[], []])

    const counts = await ingestRecipientCsvFile(db as never, filePath, {
      chunkSize: 1,
    })

    expect(counts).toEqual({
      rows_read: 5,
      added: 2,
      updated: 0,
      skipped: 1,
      invalid: 2,
    })
    expect(db.insert).toHaveBeenCalledTimes(2)
    expect(db.insert).toHaveBeenNthCalledWith(1, expect.anything())
    const firstValues = (
      db.insert.mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>
      }
    ).values
    expect(firstValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ada@example.com",
        externalUserId: "last",
      })
    )
    expect(db.update).not.toHaveBeenCalled()
  })

  it("updates existing recipients and leaves external id alone when column missing", async () => {
    const filePath = await writeTempCsv(
      ["Email", "Existing@Example.com", "new@example.com"].join("\n")
    )
    const db = mockDb([[{ id: "id-existing" }], []])

    const counts = await ingestRecipientCsvFile(db as never, filePath)

    expect(counts).toEqual({
      rows_read: 2,
      added: 1,
      updated: 1,
      skipped: 0,
      invalid: 0,
    })
    expect(db.update).toHaveBeenCalledTimes(1)
    const setFn = (
      db.update.mock.results[0]?.value as {
        set: ReturnType<typeof vi.fn>
      }
    ).set
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        emailHash: expect.any(String),
        updatedAt: expect.any(Date),
      })
    )
    expect(setFn.mock.calls[0]?.[0]).not.toHaveProperty("externalUserId")
    expect(db.insert).toHaveBeenCalledTimes(1)
    const insertValues = (
      db.insert.mock.results[0]?.value as {
        values: ReturnType<typeof vi.fn>
      }
    ).values
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new@example.com",
        externalUserId: null,
      })
    )
  })

  it("rejects a streamed CSV without an email header", async () => {
    const filePath = await writeTempCsv("name,id\nAda,1\n")
    const db = mockDb([])

    await expect(ingestRecipientCsvFile(db as never, filePath)).rejects.toThrow(
      "CSV must include an email column"
    )
    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe("upsertRecipientBatch / ingestRecipientRows", () => {
  it("counts added and updated for mixed existing rows", async () => {
    const db = mockDb([[{ id: "id-existing" }], []])

    const counts = await upsertRecipientBatch(db as never, [
      { email: "existing@example.com", externalUserId: "ext-1" },
      { email: "new@example.com", externalUserId: "ext-2" },
    ])

    expect(counts).toEqual({ added: 1, updated: 1 })
    expect(db.update).toHaveBeenCalledTimes(1)
    expect(db.insert).toHaveBeenCalledTimes(1)
  })

  it("reports correct counts for duplicates and invalid rows", async () => {
    const db = mockDb([[], []])

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
