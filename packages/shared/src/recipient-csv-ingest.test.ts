import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  assertCsvHasEmailColumn,
  assertCsvImportHeaders,
  assertSafeRecipientImportBytes,
  assertSafeUploadFilename,
  collapseImportRows,
  ingestRecipientCsvFile,
  ingestRecipientRows,
  normalizeImportEmail,
  recipientImportsDir,
  resolveEmailColumnIndex,
  resolveExternalUserIdColumnIndex,
  upsertRecipientBatch,
  validateImportHeaders,
  validateOptionalFirstName,
  validateOptionalOfferIdRaw,
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
    expect(normalizeImportEmail("")).toEqual({
      ok: false,
      problem: "Empty",
    })
    expect(normalizeImportEmail("not-an-email")).toEqual({
      ok: false,
      problem: '"not-an-email" is not a valid address',
    })
    expect(normalizeImportEmail("=cmd|' /C calc'!A0")).toEqual({
      ok: false,
      problem: "Looks like a spreadsheet formula",
    })
  })

  it("validates allowed headers and optional field shapes", () => {
    expect(
      validateImportHeaders([
        "email",
        "first_name",
        "last_name",
        "offer_id",
        "external_user_id",
      ])
    ).toMatchObject({ ok: true })
    expect(validateImportHeaders(["Name", "Email"])).toEqual({
      ok: false,
      missing_required: [],
      unknown_columns: ["Name"],
      duplicate_columns: [],
    })
    expect(validateImportHeaders(["first_name"])).toEqual({
      ok: false,
      missing_required: ["email"],
      unknown_columns: [],
      duplicate_columns: [],
    })
    expect(validateImportHeaders(["email", "email"])).toEqual({
      ok: false,
      missing_required: [],
      unknown_columns: [],
      duplicate_columns: ["email"],
    })
    expect(validateOptionalFirstName("Ada")).toEqual({
      ok: true,
      value: "Ada",
    })
    expect(validateOptionalFirstName("=1+1").ok).toBe(false)
    expect(validateOptionalOfferIdRaw("OFR-1")).toEqual({
      ok: true,
      value: "OFR-1",
    })
  })

  it("rejects unsafe upload filenames and binary payloads", () => {
    expect(() => assertSafeUploadFilename("list.csv")).not.toThrow()
    expect(() => assertSafeUploadFilename("../list.csv")).toThrow(
      "Invalid file name"
    )
    expect(() => assertSafeUploadFilename("list.xlsx")).toThrow(
      "Only .csv files are accepted"
    )
    expect(() =>
      assertSafeRecipientImportBytes(Buffer.from("email\nada@example.com\n"))
    ).not.toThrow()
    expect(() =>
      assertSafeRecipientImportBytes(Buffer.from([0x50, 0x4b, 0x03, 0x04]))
    ).toThrow(/xlsx/i)
    expect(() =>
      assertSafeRecipientImportBytes(
        Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])
      )
    ).toThrow(/xls/i)
    expect(() =>
      assertSafeRecipientImportBytes(Buffer.from([0x00, 0x01, 0x02]))
    ).toThrow(/null bytes/i)
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

describe("assertCsvImportHeaders", () => {
  it("accepts a CSV whose first non-empty line has allowed headers", async () => {
    const filePath = await writeTempCsv(
      "\n\nemail,first_name,external_user_id\nada@example.com,Ada,1\n"
    )
    await expect(assertCsvImportHeaders(filePath)).resolves.toEqual({
      recognised: ["email", "first_name", "external_user_id"],
    })
    await expect(assertCsvHasEmailColumn(filePath)).resolves.toBeUndefined()
  })

  it("rejects a CSV without an email column", async () => {
    const filePath = await writeTempCsv("first_name\nAda\n")
    await expect(assertCsvImportHeaders(filePath)).rejects.toThrow(
      /Missing required column\(s\): email/
    )
  })

  it("rejects unknown columns", async () => {
    const filePath = await writeTempCsv("email,phone\nada@example.com,1\n")
    await expect(assertCsvImportHeaders(filePath)).rejects.toThrow(
      /Unknown column\(s\): phone/
    )
  })

  it("rejects an empty CSV", async () => {
    const filePath = await writeTempCsv("\n\n")
    await expect(assertCsvImportHeaders(filePath)).rejects.toThrow(
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
      invalid_rows: [
        {
          row: 2,
          column: "email",
          problem: '"not-valid" is not a valid address',
        },
        {
          row: 5,
          column: "email",
          problem: "Empty",
        },
      ],
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
      invalid_rows: [],
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
    const filePath = await writeTempCsv("first_name\nAda\n")
    const db = mockDb([])

    await expect(ingestRecipientCsvFile(db as never, filePath)).rejects.toThrow(
      /Missing required column\(s\): email/
    )
    expect(db.insert).not.toHaveBeenCalled()
  })

  it("rejects unknown columns during ingest", async () => {
    const filePath = await writeTempCsv("email,phone\nada@example.com,1\n")
    const db = mockDb([])

    await expect(ingestRecipientCsvFile(db as never, filePath)).rejects.toThrow(
      /Unknown column\(s\): phone/
    )
    expect(db.insert).not.toHaveBeenCalled()
  })

  it("marks invalid first_name and missing offer_id rows", async () => {
    const filePath = await writeTempCsv(
      [
        "email,first_name,offer_id",
        "ok@example.com,Ada,",
        "bad-name@example.com,=1+1,",
        "missing-offer@example.com,Blair,OFR-MISSING",
      ].join("\n")
    )
    const offerSelect = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    }))
    const recipientSelect = vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    }))
    let selectCalls = 0
    const db = {
      select: vi.fn(() => {
        selectCalls += 1
        // first select is offer lookup for OFR-MISSING; later recipient upsert
        return selectCalls === 1 ? offerSelect() : recipientSelect()
      }),
      insert: vi.fn(() => ({
        values: vi.fn(async () => undefined),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => undefined),
        })),
      })),
    }

    const counts = await ingestRecipientCsvFile(db as never, filePath)

    expect(counts.rows_read).toBe(3)
    expect(counts.invalid).toBe(2)
    expect(counts.added).toBe(1)
    expect(counts.invalid_rows).toEqual([
      {
        row: 2,
        column: "first_name",
        problem: "Looks like a spreadsheet formula",
      },
      {
        row: 3,
        column: "offer_id",
        problem: `"OFR-MISSING" doesn't exist`,
      },
    ])
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
      invalid_rows: [],
    })
    expect(db.insert).toHaveBeenCalledTimes(2)
  })
})
