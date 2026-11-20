import { beforeEach, describe, expect, it, vi } from "vitest"

const enqueueSendEmailJob = vi.hoisted(() => vi.fn())
const isDuplicateBullmqJob = vi.hoisted(() => vi.fn())

vi.mock("./send-email-queue.js", () => ({
  enqueueSendEmailJob,
}))

vi.mock("./dispatch-queue.js", () => ({
  isDuplicateBullmqJob,
}))

import { requeueQueuedMessages } from "./requeue-queued.js"

function fakeDb(pages: Array<Array<{ id: string; environment: string }>>) {
  const remaining = [...pages]
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                orderBy() {
                  return {
                    limit() {
                      return {
                        offset() {
                          return Promise.resolve(remaining.shift() ?? [])
                        },
                      }
                    },
                  }
                },
              }
            },
          }
        },
      }
    },
  }
}

describe("requeueQueuedMessages", () => {
  beforeEach(() => {
    enqueueSendEmailJob.mockReset()
    isDuplicateBullmqJob.mockReset()
    enqueueSendEmailJob.mockResolvedValue(undefined)
    isDuplicateBullmqJob.mockReturnValue(false)
  })

  it("enqueues every queued message and counts duplicates as already present", async () => {
    const db = fakeDb([
      [
        { id: "m1", environment: "production" },
        { id: "m2", environment: "test" },
      ],
    ])
    enqueueSendEmailJob
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("Job m2 already exists"))
    isDuplicateBullmqJob.mockImplementation(
      (error: unknown) =>
        error instanceof Error && error.message.includes("already exists")
    )

    const result = await requeueQueuedMessages(db as never, {} as never)

    expect(enqueueSendEmailJob).toHaveBeenCalledWith(
      {},
      "m1",
      undefined,
      "production"
    )
    expect(enqueueSendEmailJob).toHaveBeenCalledWith(
      {},
      "m2",
      undefined,
      "test"
    )
    expect(result).toEqual({
      scanned: 2,
      enqueued: 1,
      already_present: 1,
    })
  })

  it("pages until a short page", async () => {
    const page = Array.from({ length: 500 }, (_, i) => ({
      id: `m${i}`,
      environment: "production",
    }))
    const db = fakeDb([page, [{ id: "tail", environment: "production" }]])

    const result = await requeueQueuedMessages(db as never, {} as never)

    expect(result.scanned).toBe(501)
    expect(result.enqueued).toBe(501)
    expect(enqueueSendEmailJob).toHaveBeenCalledTimes(501)
  })

  it("rethrows non-duplicate enqueue failures", async () => {
    const db = fakeDb([[{ id: "m1", environment: "production" }]])
    enqueueSendEmailJob.mockRejectedValueOnce(new Error("redis down"))
    isDuplicateBullmqJob.mockReturnValue(false)

    await expect(
      requeueQueuedMessages(db as never, {} as never)
    ).rejects.toThrow("redis down")
  })
})
