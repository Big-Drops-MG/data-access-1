import { beforeEach, describe, expect, it, vi } from "vitest"

const apiJson = vi.hoisted(() => vi.fn())

vi.mock("@/lib/api-client", () => ({
  apiJson,
}))

import { fetchDashboardSummary } from "@/features/dashboard/api"

describe("fetchDashboardSummary", () => {
  beforeEach(() => {
    apiJson.mockReset()
  })

  it("GETs /api/dashboard", async () => {
    const summary = {
      day: "2026-11-20",
      kpis: { sent: 1, delivered: 1, bounced: 0, complaints: 0 },
      queues: [],
      open_alerts: [],
      recent_sends: [],
      upcoming_sends: [],
    }
    apiJson.mockResolvedValue(summary)

    await expect(fetchDashboardSummary()).resolves.toEqual(summary)
    expect(apiJson).toHaveBeenCalledWith("/api/dashboard")
  })
})
