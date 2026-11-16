import { describe, expect, it, vi } from "vitest"

import { getRequestId, runWithRequestContext } from "@workspace/logger"

import {
  CSV_INGEST_JOB_NAME,
  CSV_INGEST_JOB_OPTIONS,
  csvIngestJobId,
  enqueueCsvIngestJob,
} from "./intake-queue.js"

describe("intake-queue", () => {
  function queueStub(overrides: {
    add?: ReturnType<typeof vi.fn>
    getJob?: ReturnType<typeof vi.fn>
  }) {
    return {
      add: overrides.add ?? vi.fn(async () => undefined),
      getJob: overrides.getJob ?? vi.fn(async () => undefined),
    }
  }

  it("enqueues csv-ingest with jobId csv:{upload_id}", async () => {
    const add = vi.fn(async () => undefined)
    const uploadId = "01900000-0000-7000-8000-000000000100"

    await enqueueCsvIngestJob(queueStub({ add }), {
      upload_id: uploadId,
      file_path: "/data/imports/file.csv",
      request_id: "req-import",
      actor_user_id: "01900000-0000-7000-8000-000000000001",
    })

    expect(csvIngestJobId(uploadId)).toBe(`csv:${uploadId}`)
    expect(add).toHaveBeenCalledWith(
      CSV_INGEST_JOB_NAME,
      {
        upload_id: uploadId,
        file_path: "/data/imports/file.csv",
        actor_user_id: "01900000-0000-7000-8000-000000000001",
        request_id: "req-import",
      },
      {
        jobId: `csv:${uploadId}`,
        ...CSV_INGEST_JOB_OPTIONS,
      }
    )
  })

  it("copies active request context when request id is omitted", async () => {
    const add = vi.fn(async () => undefined)
    await runWithRequestContext("req-context", async () => {
      expect(getRequestId()).toBe("req-context")
      await enqueueCsvIngestJob(queueStub({ add }), {
        upload_id: "01900000-0000-7000-8000-000000000101",
        file_path: "/tmp/a.csv",
      })
    })

    expect(add).toHaveBeenCalledWith(
      CSV_INGEST_JOB_NAME,
      {
        upload_id: "01900000-0000-7000-8000-000000000101",
        file_path: "/tmp/a.csv",
        request_id: "req-context",
      },
      expect.objectContaining({
        jobId: "csv:01900000-0000-7000-8000-000000000101",
      })
    )
  })

  it("ignores an in-flight duplicate jobId", async () => {
    const add = vi.fn(async () => {
      throw Object.assign(new Error("Job already exists"), {
        message: "Job csv:x already exists",
      })
    })

    await expect(
      enqueueCsvIngestJob(queueStub({ add }), {
        upload_id: "x",
        file_path: "/tmp/x.csv",
      })
    ).resolves.toBeUndefined()
  })
})
