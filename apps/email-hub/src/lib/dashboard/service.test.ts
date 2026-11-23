import { describe, expect, it, vi } from "vitest"

import { getDashboardSummary, loadTodayKpis } from "./service"

describe("loadTodayKpis", () => {
  it("aggregates ClickHouse row numbers", async () => {
    const runQuery = vi.fn().mockResolvedValue([
      {
        sent: "12",
        delivered: 10,
        bounced: "2",
        complaints: 1,
      },
    ])

    await expect(loadTodayKpis("2026-11-20", runQuery)).resolves.toEqual({
      sent: 12,
      delivered: 10,
      bounced: 2,
      complaints: 1,
    })
    expect(runQuery).toHaveBeenCalledWith(
      expect.stringContaining("daily_sending_stats"),
      { day: "2026-11-20" }
    )
  })

  it("returns zeros when ClickHouse has no rows", async () => {
    const runQuery = vi.fn().mockResolvedValue([])
    await expect(loadTodayKpis("2026-11-20", runQuery)).resolves.toEqual({
      sent: 0,
      delivered: 0,
      bounced: 0,
      complaints: 0,
    })
  })
})

describe("getDashboardSummary", () => {
  it("loads KPIs, queues, alerts, sends, and email routes in parallel", async () => {
    const openAlert = {
      id: "019a0000-0000-7000-8000-0000000000a1",
      type: "queue.depth",
      severity: "warning" as const,
      status: "open" as const,
      payload: { depth: 3 },
      dedupeKey: "queue.depth:send-email",
      openedAt: new Date("2026-11-20T12:00:00.000Z"),
      resolvedAt: null,
      lastTriggeredAt: new Date("2026-11-20T12:00:00.000Z"),
      occurrenceCount: 1,
      acknowledgedBy: null,
      acknowledgedAt: null,
      createdAt: new Date("2026-11-20T12:00:00.000Z"),
      updatedAt: new Date("2026-11-20T12:00:00.000Z"),
    }

    const upcoming = {
      id: "019a0000-0000-7000-8000-0000000000b1",
      name: "Upcoming send",
      emailType: "offer" as const,
      templateVersionId: "019a0000-0000-7000-8000-0000000000c1",
      senderId: "019a0000-0000-7000-8000-0000000000c2",
      offerId: null,
      categoryId: "019a0000-0000-7000-8000-0000000000c3",
      scheduledFor: new Date("2026-11-21T15:00:00.000Z"),
      status: "scheduled" as const,
      dispatchStartedAt: null,
      completedAt: null,
      version: 1,
      createdBy: "019a0000-0000-7000-8000-0000000000d1",
      createdAt: new Date("2026-11-20T10:00:00.000Z"),
      updatedAt: new Date("2026-11-20T10:00:00.000Z"),
    }

    const recent = {
      ...upcoming,
      id: "019a0000-0000-7000-8000-0000000000b2",
      name: "Recent send",
      status: "completed" as const,
      scheduledFor: new Date("2026-11-19T15:00:00.000Z"),
      completedAt: new Date("2026-11-19T16:00:00.000Z"),
    }

    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([openAlert]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([upcoming]),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([recent]),
            }),
          }),
        }),
      })

    const db = { select } as never
    const runClickHouse = vi
      .fn()
      .mockResolvedValue([{ sent: 5, delivered: 4, bounced: 1, complaints: 0 }])
    const getQueueCounts = vi.fn().mockResolvedValue([
      {
        queue: "send-email",
        waiting: 1,
        active: 0,
        failed: 2,
        delayed: 0,
      },
    ])
    const emailRoute = {
      id: "019a0000-0000-7000-8000-0000000000e1",
      email_type: "thank_you" as const,
      offer_id: null,
      offer_name: null,
      template_name: "Thanks",
      sender_email: "news@example.com",
      status: "active" as const,
    }
    const loadEmailRoutes = vi.fn().mockResolvedValue([emailRoute])

    const summary = await getDashboardSummary({
      now: new Date("2026-11-20T17:00:00.000Z"),
      db,
      runClickHouse,
      getQueueCounts,
      loadEmailRoutes,
    })

    expect(summary.day).toBe("2026-11-20")
    expect(summary.kpis).toEqual({
      sent: 5,
      delivered: 4,
      bounced: 1,
      complaints: 0,
    })
    expect(summary.queues).toEqual([
      {
        queue: "send-email",
        waiting: 1,
        active: 0,
        failed: 2,
        delayed: 0,
      },
    ])
    expect(summary.open_alerts).toHaveLength(1)
    expect(summary.open_alerts[0]?.id).toBe(openAlert.id)
    expect(summary.upcoming_sends).toHaveLength(1)
    expect(summary.upcoming_sends[0]?.name).toBe("Upcoming send")
    expect(summary.recent_sends).toHaveLength(1)
    expect(summary.recent_sends[0]?.name).toBe("Recent send")
    expect(summary.email_routes).toEqual([emailRoute])
    expect(runClickHouse).toHaveBeenCalledOnce()
    expect(getQueueCounts).toHaveBeenCalledOnce()
    expect(loadEmailRoutes).toHaveBeenCalledWith(db)
    expect(select).toHaveBeenCalledTimes(3)
  })
})
