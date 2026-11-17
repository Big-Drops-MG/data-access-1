import { describe, expect, it, vi } from "vitest"

vi.mock("@workspace/shared", () => ({
  processOptizmoSyncJob: vi.fn(async () => ({ kind: "fanout", enqueued: 0 })),
}))

import { processOptizmoSyncJob } from "@workspace/shared"

import { handleOptizmoSyncJob } from "./optizmo-sync.js"

describe("handleOptizmoSyncJob", () => {
  it("delegates to shared processOptizmoSyncJob with UnrecoverableError mapper", async () => {
    const db = {} as never
    const syncQueue = { add: vi.fn(), getJob: vi.fn() }
    const result = await handleOptizmoSyncJob(
      { offer_id: "019a0000-0000-7000-8000-0000000000aa" },
      {
        db,
        env: { OPTIZMO_API_KEY: "x" },
        syncQueue,
      }
    )
    expect(result).toEqual({ kind: "fanout", enqueued: 0 })
    expect(processOptizmoSyncJob).toHaveBeenCalledWith(
      { offer_id: "019a0000-0000-7000-8000-0000000000aa" },
      expect.objectContaining({
        db,
        syncQueue,
        env: { OPTIZMO_API_KEY: "x" },
        permanentFailure: expect.any(Function),
      })
    )
    const deps = vi.mocked(processOptizmoSyncJob).mock.calls[0]?.[1]
    const err = deps?.permanentFailure?.("boom")
    expect(err).toMatchObject({ name: "UnrecoverableError", message: "boom" })
  })
})
