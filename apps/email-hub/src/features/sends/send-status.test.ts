import { describe, expect, it } from "vitest"

import type { SendCounts } from "@/features/sends/api"
import {
  canCancelSend,
  isSendLive,
  parseSendStatusTab,
  sendOfferLabel,
  sendProgressLabel,
  sendProgressPercent,
} from "@/features/sends/send-status"

const counts: SendCounts = {
  total: 1000,
  processed: 400,
  delivered: 100,
  sent: 250,
  queued: 20,
  soft_bounce: 5,
  hard_bounce: 5,
  skipped: 20,
  skipped_suppressed: 10,
  skipped_opted_out: 6,
  skipped_frequency_cap: 4,
}

describe("send status helpers", () => {
  it("parses status tabs and falls back to all", () => {
    expect(parseSendStatusTab("draft")).toBe("draft")
    expect(parseSendStatusTab("queued")).toBe("queued")
    expect(parseSendStatusTab("failed")).toBe("failed")
    expect(parseSendStatusTab("bogus")).toBe("all")
    expect(parseSendStatusTab(undefined)).toBe("all")
  })

  it("flags live and cancellable statuses", () => {
    expect(isSendLive("queued")).toBe(true)
    expect(isSendLive("dispatching")).toBe(true)
    expect(isSendLive("scheduled")).toBe(false)
    expect(canCancelSend("scheduled")).toBe(true)
    expect(canCancelSend("dispatching")).toBe(true)
    expect(canCancelSend("completed")).toBe(false)
  })

  it("labels the offer", () => {
    expect(
      sendOfferLabel({
        offer_id: null,
        offer_name: null,
        offer_external_ref: null,
      })
    ).toBe("All")
    expect(
      sendOfferLabel({
        offer_id: "x",
        offer_name: "Spring",
        offer_external_ref: "EF-1",
      })
    ).toBe("Spring")
  })

  it("computes progress percent", () => {
    expect(sendProgressPercent(counts)).toBe(40)
    expect(sendProgressPercent({ ...counts, total: 0 })).toBe(0)
  })

  it("builds the progress column text per status", () => {
    expect(
      sendProgressLabel({
        status: "queued",
        counts,
        dispatch_started_at: "2026-11-05T18:00:00.000Z",
      })
    ).toBe("400 of 1,000")
    expect(
      sendProgressLabel({
        status: "dispatching",
        counts,
        dispatch_started_at: "2026-11-05T18:00:00.000Z",
      })
    ).toBe("400 of 1,000")
    expect(
      sendProgressLabel({
        status: "completed",
        counts,
        dispatch_started_at: "2026-11-05T18:00:00.000Z",
      })
    ).toBe("350 sent · 20 skipped")
    expect(
      sendProgressLabel({
        status: "failed",
        counts,
        dispatch_started_at: null,
      })
    ).toBe("400 of 1,000 before fail")
    expect(
      sendProgressLabel({
        status: "cancelled",
        counts,
        dispatch_started_at: null,
      })
    ).toBe("Cancelled before start")
    expect(
      sendProgressLabel({
        status: "draft",
        counts,
        dispatch_started_at: null,
      })
    ).toBe("—")
  })
})
