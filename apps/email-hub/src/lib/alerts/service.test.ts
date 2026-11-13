import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Alert } from "@workspace/db"
import type * as SharedModule from "@workspace/shared"
import { AppError } from "@workspace/shared"

const writeAudit = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return { ...actual, writeAudit }
})

import { acknowledgeAlert, listAlerts } from "./service"

const userId = "019a0000-0000-7000-8000-000000000001"
const otherUserId = "019a0000-0000-7000-8000-000000000002"
const alertId = "019a0000-0000-7000-8000-0000000000aa"
const olderId = "019a0000-0000-7000-8000-0000000000a1"
const at = new Date("2026-11-13T12:00:00.000Z")

function alertRow(overrides: Partial<Alert> = {}): Alert {
  return {
    id: alertId,
    type: "send_late",
    severity: "warning",
    status: "open",
    payload: { send_id: "s", token: "secret-value", nested: { api_key: "k" } },
    dedupeKey: "send_late:s",
    openedAt: at,
    resolvedAt: null,
    lastTriggeredAt: at,
    occurrenceCount: 1,
    acknowledgedBy: null,
    acknowledgedAt: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  }
}

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of [
    "from",
    "where",
    "orderBy",
    "limit",
    "set",
    "returning",
  ]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe("listAlerts", () => {
  it("returns a stable page, strips secret payload keys, and sets the cursor", async () => {
    const newer = alertRow({ id: alertId, severity: "critical" })
    const older = alertRow({
      id: olderId,
      severity: "info",
      type: "no_route",
      payload: null,
    })
    const db = {
      select: vi.fn(() => query([newer, older])),
    }

    const page = await listAlerts(
      { limit: 1, status: "open", severity: "critical", type: "send_late" },
      db as never
    )

    expect(page.data).toHaveLength(1)
    expect(page.data[0]).toMatchObject({
      id: alertId,
      severity: "critical",
      status: "open",
      dedupe_key: "send_late:s",
      occurrence_count: 1,
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_at: null,
      opened_at: at.toISOString(),
    })
    expect(page.data[0]?.payload).toEqual({ send_id: "s", nested: {} })
    expect(JSON.stringify(page.data[0]?.payload)).not.toContain("secret-value")
    expect(page.next_cursor).toBe(alertId)
    expect(page.data.map((row) => row.id)).toEqual([alertId])
  })

  it("returns an empty page", async () => {
    const db = { select: vi.fn(() => query([])) }
    await expect(listAlerts({ limit: 50 }, db as never)).resolves.toEqual({
      data: [],
      next_cursor: null,
    })
  })

  it("rethrows a database error", async () => {
    const failing = query([])
    failing.then = (
      _resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.reject(new Error("db down")).then(_resolve, reject)
    const db = { select: vi.fn(() => failing) }

    await expect(listAlerts({ limit: 50 }, db as never)).rejects.toThrow(
      "db down"
    )
  })
})

describe("acknowledgeAlert", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
  })

  it("records the actor and leaves the alert open", async () => {
    const existing = alertRow()
    let stored = existing
    const tx = {
      select: vi.fn(() => query([stored])),
      update: vi.fn(() => {
        const q = query([])
        q.set = vi.fn((values: Partial<Alert>) => {
          stored = {
            ...stored,
            acknowledgedBy: values.acknowledgedBy ?? null,
            acknowledgedAt: values.acknowledgedAt ?? null,
            updatedAt: values.updatedAt ?? stored.updatedAt,
          }
          q.then = (
            onFulfilled: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown
          ) => Promise.resolve([stored]).then(onFulfilled, onRejected)
          expect(values).not.toHaveProperty("status")
          expect(values).not.toHaveProperty("resolvedAt")
          return q
        })
        return q
      }),
    }
    const db = {
      transaction: async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx),
    }

    const result = await acknowledgeAlert(
      alertId,
      { userId, requestId: "req-ack" },
      db as never
    )

    expect(result.status).toBe("open")
    expect(result.acknowledged_by).toBe(userId)
    expect(result.acknowledged_at).toEqual(expect.any(String))
    expect(result.resolved_at).toBeNull()
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        actor: { type: "user", id: userId },
        action: "alert.acknowledged",
        objectType: "alert",
        objectId: alertId,
        requestId: "req-ack",
      })
    )
  })

  it("does not overwrite an existing acknowledgment or write another audit row", async () => {
    const existing = alertRow({
      acknowledgedBy: userId,
      acknowledgedAt: at,
    })
    const tx = {
      select: vi.fn(() => query([existing])),
      update: vi.fn(),
    }
    const db = {
      transaction: async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx),
    }

    const result = await acknowledgeAlert(
      alertId,
      { userId: otherUserId, requestId: "again" },
      db as never
    )

    expect(result.acknowledged_by).toBe(userId)
    expect(result.acknowledged_at).toBe(at.toISOString())
    expect(tx.update).not.toHaveBeenCalled()
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("acknowledges a resolved alert without reopening it", async () => {
    const existing = alertRow({
      status: "resolved",
      resolvedAt: at,
    })
    let stored = existing
    const tx = {
      select: vi.fn(() => query([stored])),
      update: vi.fn(() => {
        const q = query([])
        q.set = vi.fn((values: Partial<Alert>) => {
          stored = {
            ...stored,
            acknowledgedBy: values.acknowledgedBy ?? stored.acknowledgedBy,
            acknowledgedAt: values.acknowledgedAt ?? stored.acknowledgedAt,
            updatedAt: values.updatedAt ?? stored.updatedAt,
          }
          q.then = (
            onFulfilled: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown
          ) => Promise.resolve([stored]).then(onFulfilled, onRejected)
          return q
        })
        return q
      }),
    }
    const db = {
      transaction: async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx),
    }

    const result = await acknowledgeAlert(alertId, { userId }, db as never)

    expect(result.status).toBe("resolved")
    expect(result.resolved_at).toBe(at.toISOString())
    expect(result.acknowledged_by).toBe(userId)
    expect(writeAudit).toHaveBeenCalledOnce()
  })

  it("returns 404 when the alert is missing", async () => {
    const tx = {
      select: vi.fn(() => query([])),
      update: vi.fn(),
    }
    const db = {
      transaction: async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx),
    }

    await expect(
      acknowledgeAlert(alertId, { userId }, db as never)
    ).rejects.toMatchObject({ code: "not_found", status: 404 })
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("keeps the first actor when a concurrent acknowledgment loses", async () => {
    let stored = alertRow()
    let winner: string | null = null
    const tx = {
      select: vi.fn(() => query([stored])),
      update: vi.fn(() => {
        const q = query([])
        q.set = vi.fn((values: Partial<Alert>) => {
          q.then = (
            onFulfilled: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown
          ) => {
            if (winner) {
              return Promise.resolve([]).then(onFulfilled, onRejected)
            }
            winner = values.acknowledgedBy ?? null
            stored = {
              ...stored,
              acknowledgedBy: winner,
              acknowledgedAt: values.acknowledgedAt ?? at,
              updatedAt: values.updatedAt ?? at,
            }
            return Promise.resolve([stored]).then(onFulfilled, onRejected)
          }
          return q
        })
        return q
      }),
    }
    const db = {
      transaction: async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx),
    }

    const [first, second] = await Promise.all([
      acknowledgeAlert(alertId, { userId }, db as never),
      acknowledgeAlert(alertId, { userId: otherUserId }, db as never),
    ])

    expect(first.acknowledged_by).toBe(second.acknowledged_by)
    expect([userId, otherUserId]).toContain(first.acknowledged_by)
    expect(first.status).toBe("open")
    expect(writeAudit).toHaveBeenCalledOnce()
  })

  it("returns 404 when the row disappears before the losing ack rereads it", async () => {
    let reads = 0
    const tx = {
      select: vi.fn(() => {
        reads += 1
        return query(reads === 1 ? [alertRow()] : [])
      }),
      update: vi.fn(() => {
        const q = query([])
        q.set = vi.fn(() => q)
        q.returning = vi.fn(async () => [])
        q.then = (
          onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => Promise.resolve([]).then(onFulfilled, onRejected)
        return q
      }),
    }
    const db = {
      transaction: async (fn: (trx: typeof tx) => Promise<unknown>) => fn(tx),
    }

    await expect(
      acknowledgeAlert(alertId, { userId }, db as never)
    ).rejects.toBeInstanceOf(AppError)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("does not commit when the audit write fails", async () => {
    writeAudit.mockRejectedValue(new Error("audit down"))
    let committed = false
    const existing = alertRow()
    const tx = {
      select: vi.fn(() => query([existing])),
      update: vi.fn(() => {
        const q = query([
          alertRow({
            acknowledgedBy: userId,
            acknowledgedAt: at,
          }),
        ])
        return q
      }),
    }
    const db = {
      transaction: async (fn: (trx: typeof tx) => Promise<unknown>) => {
        try {
          const result = await fn(tx)
          committed = true
          return result
        } catch (error) {
          committed = false
          throw error
        }
      },
    }

    await expect(
      acknowledgeAlert(alertId, { userId }, db as never)
    ).rejects.toThrow("audit down")
    expect(committed).toBe(false)
  })
})
