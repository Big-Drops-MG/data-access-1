import { describe, expect, it, vi } from "vitest"

vi.mock("@workspace/shared", async () => {
  const actual = await vi.importActual("@workspace/shared")
  return {
    ...(actual as object),
    processArohaaTierSyncJob: vi.fn(async () => ({
      kind: "unchanged" as const,
      recipient: {},
    })),
  }
})

import { processArohaaTierSyncJob } from "@workspace/shared"

import { handleArohaaTierSyncJob } from "./arohaa-tier-sync.js"

describe("handleArohaaTierSyncJob", () => {
  it("delegates to shared processArohaaTierSyncJob", async () => {
    const db = {} as never
    const enqueueSendEmail = vi.fn(async () => undefined)
    const data = {
      arohaa_event_id: "evt_1",
      email: "jane@example.com",
      tier: "premium" as const,
      occurred_at: "2026-10-07T14:00:00.000Z",
    }

    await handleArohaaTierSyncJob(data, { db, enqueueSendEmail })

    expect(processArohaaTierSyncJob).toHaveBeenCalledWith(data, {
      db,
      enqueueSendEmail,
    })
  })
})
