import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/fbl/process", () => ({
  processFblRawMail: vi.fn(async () => ({
    kind: "processed",
    reportCreated: true,
    feedbackCreated: true,
    feedbackItemId: "fb-1",
    matchedMessageId: "msg-1",
    provider: "jmrp",
  })),
}))

import { processFblRawMail } from "@/lib/fbl/process"
import { FblWebhookError, handleFblWebhook } from "@/lib/fbl/webhook"

describe("handleFblWebhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it("rejects missing secret config", async () => {
    vi.stubEnv("FBL_WEBHOOK_SECRET", "")
    await expect(
      handleFblWebhook({
        authorization: "Bearer x",
        secretHeader: null,
        contentType: "application/json",
        body: JSON.stringify({ raw: "From: a\r\n\r\n" }),
      })
    ).rejects.toMatchObject({ code: "unavailable" })
  })

  it("rejects bad bearer", async () => {
    vi.stubEnv("FBL_WEBHOOK_SECRET", "correct-secret")
    await expect(
      handleFblWebhook({
        authorization: "Bearer wrong",
        secretHeader: null,
        contentType: "application/json",
        body: JSON.stringify({ raw: "From: a\r\n\r\n" }),
      })
    ).rejects.toBeInstanceOf(FblWebhookError)
  })

  it("accepts bearer and processes raw JSON", async () => {
    vi.stubEnv("FBL_WEBHOOK_SECRET", "correct-secret")
    const result = await handleFblWebhook({
      authorization: "Bearer correct-secret",
      secretHeader: null,
      contentType: "application/json",
      body: JSON.stringify({ raw: "From: a\r\n\r\nbody" }),
    })
    expect(result).toEqual({
      ok: true,
      kind: "processed",
      report_created: true,
      feedback_created: true,
    })
    expect(processFblRawMail).toHaveBeenCalledWith("From: a\r\n\r\nbody")
  })
})
