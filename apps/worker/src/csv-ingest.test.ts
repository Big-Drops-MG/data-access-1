import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type * as SharedModule from "@workspace/shared"

const info = vi.hoisted(() => vi.fn())
const writeAudit = vi.hoisted(() => vi.fn(async () => ({})))

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({ info }),
}))

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return { ...actual, writeAudit }
})

import { processCsvIngestJob } from "./csv-ingest.js"

describe("processCsvIngestJob", () => {
  beforeEach(() => {
    info.mockReset()
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
  })

  it("rejects missing upload_id or file_path", async () => {
    await expect(
      processCsvIngestJob({ upload_id: "", file_path: "/tmp/a.csv" })
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it("ingests the file and writes audit counts", async () => {
    const counts = {
      rows_read: 5,
      added: 2,
      updated: 1,
      skipped: 1,
      invalid: 1,
    }
    const ingestFile = vi.fn(async () => counts)
    const db = {} as never

    const result = await processCsvIngestJob(
      {
        upload_id: "01900000-0000-7000-8000-000000000100",
        file_path: "/data/imports/01900000-0000-7000-8000-000000000100.csv",
        actor_user_id: "01900000-0000-7000-8000-000000000001",
        request_id: "req-1",
      },
      { db, ingestFile }
    )

    expect(result).toEqual({
      upload_id: "01900000-0000-7000-8000-000000000100",
      counts,
    })
    expect(ingestFile).toHaveBeenCalledWith(
      db,
      "/data/imports/01900000-0000-7000-8000-000000000100.csv"
    )
    expect(writeAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: "recipient.import.completed",
        objectType: "recipient_import",
        objectId: "01900000-0000-7000-8000-000000000100",
        after: expect.objectContaining(counts),
      })
    )
  })
})
