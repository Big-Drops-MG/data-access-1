import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type * as SharedModule from "@workspace/shared"

const enqueueCsvIngestJob = vi.hoisted(() => vi.fn(async () => undefined))
const getIntakeQueue = vi.hoisted(() => vi.fn(() => ({ add: vi.fn() })))

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return { ...actual, enqueueCsvIngestJob }
})

vi.mock("@/lib/intake-queue", () => ({ getIntakeQueue }))

import { importRecipientsCsv } from "./import-service"

describe("importRecipientsCsv", () => {
  let dir: string

  beforeEach(async () => {
    enqueueCsvIngestJob.mockReset()
    getIntakeQueue.mockClear()
    dir = await mkdtemp(path.join(os.tmpdir(), "recipient-import-"))
    process.env.RECIPIENT_IMPORTS_DIR = dir
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
    delete process.env.RECIPIENT_IMPORTS_DIR
  })

  it("stores CSV under imports dir and enqueues csv-ingest", async () => {
    const file = new File(
      ["email,external_user_id\nada@example.com,ada\n"],
      "list.csv",
      { type: "text/csv" }
    )

    const result = await importRecipientsCsv(file, {
      userId: "019a0000-0000-7000-8000-000000000001",
      requestId: "req-import",
    })

    expect(result.upload_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    )
    const stored = await readFile(
      path.join(dir, `${result.upload_id}.csv`),
      "utf8"
    )
    expect(stored).toContain("ada@example.com")
    expect(enqueueCsvIngestJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        upload_id: result.upload_id,
        file_path: path.join(dir, `${result.upload_id}.csv`),
        actor_user_id: "019a0000-0000-7000-8000-000000000001",
      })
    )
  })

  it("rejects non-csv and missing email column before enqueue", async () => {
    await expect(
      importRecipientsCsv(new File(["x"], "list.txt", { type: "text/plain" }), {
        userId: "u1",
      })
    ).rejects.toMatchObject({ status: 422 })

    await expect(
      importRecipientsCsv(
        new File(["name\nada\n"], "list.csv", { type: "text/csv" }),
        { userId: "u1" }
      )
    ).rejects.toMatchObject({ status: 422 })

    expect(enqueueCsvIngestJob).not.toHaveBeenCalled()
  })
})
