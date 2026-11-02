import { describe, expect, it, vi } from "vitest"

import {
  BULLMQ_PREFIX,
  SEND_EMAIL_JOB_NAME,
  SEND_EMAIL_JOB_OPTIONS,
  SEND_EMAIL_QUEUE_NAME,
  createEnqueueSendEmail,
  enqueueSendEmailJob,
} from "./send-email-queue.js"

describe("send-email queue helpers", () => {
  it("uses the shared BullMQ prefix and queue name", () => {
    expect(BULLMQ_PREFIX).toBe("bd")
    expect(SEND_EMAIL_QUEUE_NAME).toBe("send-email")
    expect(SEND_EMAIL_JOB_NAME).toBe("send-email")
  })

  it("enqueues with jobId = message_id and Stage B options", async () => {
    const add = vi.fn(async () => undefined)
    const messageId = "01900000-0000-7000-8000-000000000002"

    await enqueueSendEmailJob({ add }, messageId)

    expect(add).toHaveBeenCalledWith(
      SEND_EMAIL_JOB_NAME,
      { message_id: messageId },
      {
        jobId: messageId,
        ...SEND_EMAIL_JOB_OPTIONS,
      }
    )
  })

  it("createEnqueueSendEmail binds a queue for triggerEmail deps", async () => {
    const add = vi.fn(async () => undefined)
    const enqueue = createEnqueueSendEmail({ add })
    await enqueue("msg-1")
    expect(add).toHaveBeenCalledWith(
      SEND_EMAIL_JOB_NAME,
      { message_id: "msg-1" },
      expect.objectContaining({ jobId: "msg-1" })
    )
  })
})
