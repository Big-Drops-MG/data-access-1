import { describe, expect, it, vi } from "vitest"

import { getRequestId, runWithRequestContext } from "@workspace/logger"

import {
  SEND_EMAIL_JOB_NAME,
  SEND_EMAIL_JOB_OPTIONS,
  enqueueSendEmailJob,
} from "./send-email-queue.js"

describe("send-email request_id propagation", () => {
  it("stores a valid request id without replacing the BullMQ job id", async () => {
    const add = vi.fn(async () => undefined)
    const messageId = "01900000-0000-7000-8000-000000000010"

    await enqueueSendEmailJob({ add }, messageId, "req-from-api")

    expect(add).toHaveBeenCalledWith(
      SEND_EMAIL_JOB_NAME,
      { message_id: messageId, request_id: "req-from-api" },
      {
        jobId: messageId,
        ...SEND_EMAIL_JOB_OPTIONS,
      }
    )
  })

  it("stores a test environment on the job payload", async () => {
    const add = vi.fn(async () => undefined)
    const messageId = "01900000-0000-7000-8000-000000000011"
    await enqueueSendEmailJob({ add }, messageId, "req-from-api", "test")
    expect(add).toHaveBeenCalledWith(
      SEND_EMAIL_JOB_NAME,
      {
        message_id: messageId,
        request_id: "req-from-api",
        environment: "test",
      },
      expect.objectContaining({ jobId: messageId })
    )
  })

  it("copies the active request context when the caller omits request id", async () => {
    const add = vi.fn(async () => undefined)
    await runWithRequestContext("req-context", async () => {
      expect(getRequestId()).toBe("req-context")
      await enqueueSendEmailJob({ add }, "msg-context")
    })

    expect(add).toHaveBeenCalledWith(
      SEND_EMAIL_JOB_NAME,
      { message_id: "msg-context", request_id: "req-context" },
      expect.objectContaining({ jobId: "msg-context" })
    )
  })

  it("keeps concurrent contexts from mixing request ids", async () => {
    const add = vi.fn(async () => undefined)
    await Promise.all([
      runWithRequestContext("req-one", () =>
        enqueueSendEmailJob({ add }, "msg-one")
      ),
      runWithRequestContext("req-two", () =>
        enqueueSendEmailJob({ add }, "msg-two")
      ),
    ])

    const payloads = add.mock.calls.map((call) => call[1])
    expect(payloads).toContainEqual({
      message_id: "msg-one",
      request_id: "req-one",
    })
    expect(payloads).toContainEqual({
      message_id: "msg-two",
      request_id: "req-two",
    })
  })

  it("omits request_id for a legacy call and drops an invalid id", async () => {
    const add = vi.fn(async () => undefined)
    await enqueueSendEmailJob({ add }, "msg-legacy")
    await enqueueSendEmailJob({ add }, "msg-bad", "bad id")

    expect(add).toHaveBeenNthCalledWith(
      1,
      SEND_EMAIL_JOB_NAME,
      { message_id: "msg-legacy" },
      expect.objectContaining({ jobId: "msg-legacy" })
    )
    expect(add).toHaveBeenNthCalledWith(
      2,
      SEND_EMAIL_JOB_NAME,
      { message_id: "msg-bad" },
      expect.objectContaining({ jobId: "msg-bad" })
    )
  })
})
