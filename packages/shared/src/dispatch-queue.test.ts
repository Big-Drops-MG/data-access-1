import { describe, expect, it, vi } from "vitest"

import { getRequestId, runWithRequestContext } from "@workspace/logger"

import {
  DISPATCH_SEND_JOB_NAME,
  DISPATCH_SEND_JOB_OPTIONS,
  SEND_LATE_THRESHOLD_MS,
  enqueueDispatchSendJob,
  isSendLate,
  sendLateAlertDedupeKey,
} from "./dispatch-queue.js"

describe("dispatch-queue", () => {
  function queueStub(overrides: {
    add?: ReturnType<typeof vi.fn>
    getJob?: ReturnType<typeof vi.fn>
  }) {
    return {
      add: overrides.add ?? vi.fn(async () => undefined),
      getJob: overrides.getJob ?? vi.fn(async () => undefined),
    }
  }

  it("enqueues dispatch-send with jobId equal to send_id", async () => {
    const add = vi.fn(async () => undefined)
    const sendId = "01900000-0000-7000-8000-000000000100"

    await enqueueDispatchSendJob(queueStub({ add }), sendId, "req-dispatch")

    expect(add).toHaveBeenCalledWith(
      DISPATCH_SEND_JOB_NAME,
      { send_id: sendId, request_id: "req-dispatch" },
      {
        jobId: sendId,
        ...DISPATCH_SEND_JOB_OPTIONS,
      }
    )
  })

  it("copies the active request context when request id is omitted", async () => {
    const add = vi.fn(async () => undefined)
    await runWithRequestContext("req-context", async () => {
      expect(getRequestId()).toBe("req-context")
      await enqueueDispatchSendJob(
        queueStub({ add }),
        "01900000-0000-7000-8000-000000000101"
      )
    })

    expect(add).toHaveBeenCalledWith(
      DISPATCH_SEND_JOB_NAME,
      {
        send_id: "01900000-0000-7000-8000-000000000101",
        request_id: "req-context",
      },
      expect.objectContaining({
        jobId: "01900000-0000-7000-8000-000000000101",
      })
    )
  })

  it("drops an invalid request id", async () => {
    const add = vi.fn(async () => undefined)
    await enqueueDispatchSendJob(
      queueStub({ add }),
      "01900000-0000-7000-8000-000000000102",
      "not valid"
    )
    expect(add).toHaveBeenCalledWith(
      DISPATCH_SEND_JOB_NAME,
      { send_id: "01900000-0000-7000-8000-000000000102" },
      expect.objectContaining({
        jobId: "01900000-0000-7000-8000-000000000102",
      })
    )
  })

  it("ignores an in-flight duplicate jobId", async () => {
    const add = vi.fn(async () => {
      throw new Error("Job 01900000-0000-7000-8000-000000000103 already exists")
    })
    const getJob = vi.fn(async () => ({
      getState: async () => "active" as const,
      remove: vi.fn(),
    }))
    await expect(
      enqueueDispatchSendJob(
        queueStub({ add, getJob }),
        "01900000-0000-7000-8000-000000000103"
      )
    ).resolves.toBeUndefined()
    expect(add).toHaveBeenCalledTimes(1)
  })

  it("re-enqueues when the existing jobId is failed", async () => {
    const sendId = "01900000-0000-7000-8000-000000000104"
    const remove = vi.fn(async () => undefined)
    let attempts = 0
    const add = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error(`Job ${sendId} already exists`)
      }
    })
    const getJob = vi.fn(async () => ({
      getState: async () => "failed" as const,
      remove,
    }))

    await enqueueDispatchSendJob(queueStub({ add, getJob }), sendId)

    expect(remove).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenCalledTimes(2)
  })

  it("detects send_late after the 15 minute threshold", () => {
    const scheduledFor = new Date("2026-11-05T12:00:00.000Z")
    expect(
      isSendLate(
        scheduledFor,
        new Date(scheduledFor.getTime() + SEND_LATE_THRESHOLD_MS)
      )
    ).toBe(false)
    expect(
      isSendLate(
        scheduledFor,
        new Date(scheduledFor.getTime() + SEND_LATE_THRESHOLD_MS + 1)
      )
    ).toBe(true)
    expect(sendLateAlertDedupeKey("send-1")).toBe("send_late:send-1")
  })
})
