import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Alert } from "@workspace/db"
import type * as LoggerModule from "@workspace/logger"

import { closeAlert, openAlert } from "./alerts.js"
import { closeSendLateAlert } from "./send-late-alert.js"
import { closeNoRouteAlert } from "./trigger-email.js"
import { closeSesAccountPausedAlert } from "./send-email-delivery.js"

const info = vi.hoisted(() => vi.fn())

vi.mock("@workspace/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof LoggerModule
  return {
    ...actual,
    getContextLogger: () => ({ info }),
  }
})

const at = new Date("2026-11-13T12:00:00.000Z")
const later = new Date("2026-11-13T12:05:00.000Z")
const alertId = "019a0000-0000-7000-8000-0000000000aa"
const otherId = "019a0000-0000-7000-8000-0000000000ab"

function alertRow(overrides: Partial<Alert> = {}): Alert {
  return {
    id: alertId,
    type: "send_late",
    severity: "warning",
    status: "open",
    payload: { send_id: "s" },
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

type Step = {
  op: "insert" | "select" | "update"
  rows?: Alert[]
  error?: unknown
}

function scriptedDb(steps: Step[]) {
  const sets: Record<string, unknown>[] = []
  let index = 0
  function take(op: Step["op"]): Step {
    const step = steps[index]
    index += 1
    if (!step || step.op !== op) {
      throw new Error(
        `expected ${op} at step ${index}, got ${step?.op ?? "end"}`
      )
    }
    return step
  }
  function chain(step: Step) {
    const query: Record<string, unknown> = {}
    const self = () => query
    for (const name of [
      "from",
      "where",
      "orderBy",
      "limit",
      "values",
      "onConflictDoNothing",
      "returning",
    ]) {
      query[name] = vi.fn(self)
    }
    query.set = vi.fn((values: Record<string, unknown>) => {
      sets.push(values)
      return query
    })
    query.then = (
      resolve: (value: unknown) => unknown,
      reject: (reason: unknown) => unknown
    ) => {
      const promise =
        "error" in step
          ? Promise.reject(step.error)
          : Promise.resolve(step.rows ?? [])
      return promise.then(resolve, reject)
    }
    return query
  }
  return {
    sets,
    insert: vi.fn(() => chain(take("insert"))),
    select: vi.fn(() => chain(take("select"))),
    update: vi.fn(() => chain(take("update"))),
  }
}

function openedEvents(): unknown[] {
  return info.mock.calls
    .map((call) => call[0])
    .filter(
      (fields) =>
        fields &&
        typeof fields === "object" &&
        "event" in fields &&
        fields.event === "alert.opened"
    )
}

function sqlText(value: unknown, seen = new WeakSet<object>()): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value)
  }
  if (!value || typeof value !== "object") {
    return ""
  }
  if (seen.has(value)) {
    return ""
  }
  seen.add(value)
  if (Array.isArray(value)) {
    return value.map((entry) => sqlText(entry, seen)).join(" ")
  }
  const record = value as Record<string, unknown>
  if (Array.isArray(record.queryChunks)) {
    return sqlText(record.queryChunks, seen)
  }
  if ("value" in record) {
    return sqlText(record.value, seen)
  }
  return Object.values(record)
    .map((entry) => sqlText(entry, seen))
    .join(" ")
}

function closedEvents(): unknown[] {
  return info.mock.calls
    .map((call) => call[0])
    .filter(
      (fields) =>
        fields &&
        typeof fields === "object" &&
        "event" in fields &&
        fields.event === "alert.closed"
    )
}

const openInput = {
  type: "send_late",
  severity: "warning" as const,
  dedupeKey: "send_late:s",
  now: at,
}

describe("openAlert", () => {
  beforeEach(() => {
    info.mockReset()
  })

  it("creates an alert and logs alert.opened once", async () => {
    const created = alertRow()
    const db = scriptedDb([{ op: "insert", rows: [created] }])

    const result = await openAlert(db as never, openInput)

    expect(result).toEqual({ alert: created, created: true })
    expect(openedEvents()).toEqual([
      expect.objectContaining({
        event: "alert.opened",
        alert_id: alertId,
        alert_type: "send_late",
        severity: "warning",
        dedupe_key: "send_late:s",
      }),
    ])
  })

  it("returns the existing open alert without a second alert.opened log", async () => {
    const created = alertRow()
    const bumped = alertRow({ occurrenceCount: 2, lastTriggeredAt: later })
    const db = scriptedDb([
      { op: "insert", rows: [created] },
      { op: "insert", rows: [] },
      { op: "select", rows: [created] },
      { op: "update", rows: [bumped] },
    ])

    const first = await openAlert(db as never, openInput)
    const second = await openAlert(db as never, {
      ...openInput,
      severity: "critical",
      now: later,
    })

    expect(first.created).toBe(true)
    expect(second).toEqual({ alert: bumped, created: false })
    expect(second.alert.severity).toBe("warning")
    expect(second.alert.id).toBe(first.alert.id)
    expect(db.sets[0]).not.toHaveProperty("severity")
    expect(db.sets[0]).not.toHaveProperty("payload")
    expect(openedEvents()).toHaveLength(1)
  })

  it("creates separate alerts for different dedupe keys", async () => {
    const first = alertRow()
    const second = alertRow({
      id: otherId,
      dedupeKey: "send_late:other",
    })
    const db = scriptedDb([
      { op: "insert", rows: [first] },
      { op: "insert", rows: [second] },
    ])

    const a = await openAlert(db as never, openInput)
    const b = await openAlert(db as never, {
      ...openInput,
      dedupeKey: "send_late:other",
    })

    expect(a.alert.id).not.toBe(b.alert.id)
    expect(a.created).toBe(true)
    expect(b.created).toBe(true)
    expect(openedEvents()).toHaveLength(2)
  })

  it("keeps the original open alert when the type differs and the dedupe key matches", async () => {
    const created = alertRow({ type: "worker_failed" })
    const db = scriptedDb([
      { op: "insert", rows: [created] },
      { op: "insert", rows: [] },
      { op: "select", rows: [created] },
      { op: "update", rows: [created] },
    ])

    await openAlert(db as never, {
      type: "worker_failed",
      severity: "warning",
      dedupeKey: "shared-key",
      now: at,
    })
    const again = await openAlert(db as never, {
      type: "queue_stalled",
      severity: "critical",
      dedupeKey: "shared-key",
      now: later,
    })

    expect(again.created).toBe(false)
    expect(again.alert.type).toBe("worker_failed")
    expect(openedEvents()).toHaveLength(1)
  })

  it("creates separate alerts for different types with different dedupe keys", async () => {
    const db = scriptedDb([
      { op: "insert", rows: [alertRow({ type: "worker_failed" })] },
      {
        op: "insert",
        rows: [alertRow({ id: otherId, type: "queue_stalled" })],
      },
    ])

    const a = await openAlert(db as never, {
      type: "worker_failed",
      severity: "info",
      dedupeKey: "worker_failed:1",
      now: at,
    })
    const b = await openAlert(db as never, {
      type: "queue_stalled",
      severity: "critical",
      dedupeKey: "queue_stalled:1",
      now: at,
    })

    expect(a.alert.type).toBe("worker_failed")
    expect(b.alert.type).toBe("queue_stalled")
    expect(a.alert.id).not.toBe(b.alert.id)
  })

  it("opens a new occurrence after the previous alert is closed", async () => {
    const open = alertRow()
    const resolved = alertRow({
      status: "resolved",
      resolvedAt: later,
      acknowledgedBy: "019a0000-0000-7000-8000-000000000001",
      acknowledgedAt: at,
    })
    const reopened = alertRow({ id: otherId })
    const db = scriptedDb([
      { op: "insert", rows: [open] },
      { op: "update", rows: [resolved] },
      { op: "insert", rows: [reopened] },
    ])

    await openAlert(db as never, openInput)
    const closed = await closeAlert(db as never, {
      type: "send_late",
      dedupeKey: "send_late:s",
      now: later,
    })
    const again = await openAlert(db as never, { ...openInput, now: later })

    expect(closed.closed).toBe(true)
    expect(closed.alert?.acknowledgedBy).toBe(
      "019a0000-0000-7000-8000-000000000001"
    )
    expect(db.sets[0]).not.toHaveProperty("acknowledgedBy")
    expect(db.sets[0]).toMatchObject({
      status: "resolved",
      resolvedAt: later,
    })
    expect(again.created).toBe(true)
    expect(again.alert.id).toBe(otherId)
    expect(openedEvents()).toHaveLength(2)
    expect(closedEvents()).toHaveLength(1)
  })

  it("refreshes payload on a duplicate without changing severity", async () => {
    const created = alertRow()
    const db = scriptedDb([
      { op: "insert", rows: [] },
      { op: "select", rows: [created] },
      { op: "update", rows: [created] },
    ])

    await openAlert(db as never, {
      ...openInput,
      severity: "critical",
      refreshPayload: true,
      payload: { minutes_late: 4 },
    })

    expect(db.sets[0]).toMatchObject({ payload: { minutes_late: 4 } })
    expect(db.sets[0]).not.toHaveProperty("severity")
    expect(openedEvents()).toHaveLength(0)
  })

  it("masks an email-shaped dedupe key in alert.opened", async () => {
    const created = alertRow({ dedupeKey: "ada@example.com" })
    const db = scriptedDb([{ op: "insert", rows: [created] }])

    await openAlert(db as never, {
      ...openInput,
      dedupeKey: "ada@example.com",
    })

    expect(openedEvents()[0]).toEqual(
      expect.objectContaining({ dedupe_key: "a***@example.com" })
    )
  })

  it("creates one open alert when concurrent calls race", async () => {
    let stored: Alert | null = null
    let inserted = false
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: () => {
              if (inserted) {
                return Promise.resolve([])
              }
              inserted = true
              stored = alertRow()
              return Promise.resolve([stored])
            },
          }),
        }),
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve(stored ? [stored] : []),
          }),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => {
              if (!stored) {
                return Promise.resolve([])
              }
              stored = {
                ...stored,
                occurrenceCount: stored.occurrenceCount + 1,
              }
              return Promise.resolve([stored])
            },
          }),
        }),
      }),
    }

    const [a, b] = await Promise.all([
      openAlert(db as never, openInput),
      openAlert(db as never, openInput),
    ])

    expect(a.alert.id).toBe(b.alert.id)
    expect([a.created, b.created].filter(Boolean)).toHaveLength(1)
    expect(openedEvents()).toHaveLength(1)
  })

  it("retries once when the open row disappears between insert and read", async () => {
    const created = alertRow()
    const db = scriptedDb([
      { op: "insert", rows: [] },
      { op: "select", rows: [] },
      { op: "insert", rows: [created] },
    ])

    const result = await openAlert(db as never, openInput)

    expect(result.created).toBe(true)
    expect(openedEvents()).toHaveLength(1)
  })

  it("retries when the bump loses the open row", async () => {
    const created = alertRow({ id: otherId })
    const db = scriptedDb([
      { op: "insert", rows: [] },
      { op: "select", rows: [alertRow()] },
      { op: "update", rows: [] },
      { op: "insert", rows: [created] },
    ])

    const result = await openAlert(db as never, openInput)

    expect(result).toEqual({ alert: created, created: true })
  })

  it("throws conflict when a duplicate still cannot be read", async () => {
    const db = scriptedDb([
      { op: "insert", rows: [] },
      { op: "select", rows: [] },
      { op: "insert", rows: [] },
      { op: "select", rows: [] },
    ])

    await expect(openAlert(db as never, openInput)).rejects.toMatchObject({
      code: "conflict",
    })
    expect(openedEvents()).toHaveLength(0)
  })

  it("reuses the open row after a unique violation", async () => {
    const created = alertRow()
    const db = scriptedDb([
      { op: "insert", error: { code: "23505" } },
      { op: "select", rows: [created] },
      { op: "update", rows: [created] },
    ])

    const result = await openAlert(db as never, openInput)

    expect(result.created).toBe(false)
    expect(result.alert.id).toBe(alertId)
    expect(openedEvents()).toHaveLength(0)
  })

  it("reuses the open row after a wrapped unique violation", async () => {
    const created = alertRow()
    const db = scriptedDb([
      { op: "insert", error: { cause: { code: "23505" } } },
      { op: "select", rows: [created] },
      { op: "update", rows: [created] },
    ])

    await expect(openAlert(db as never, openInput)).resolves.toMatchObject({
      created: false,
    })
  })

  it("rethrows the unique violation when the follow-up read fails", async () => {
    const unique = { code: "23505" }
    const db = scriptedDb([
      { op: "insert", error: unique },
      { op: "select", error: new Error("aborted") },
    ])

    await expect(openAlert(db as never, openInput)).rejects.toBe(unique)
  })

  it("rethrows a unique violation's conflict after the retry is exhausted", async () => {
    const db = scriptedDb([
      { op: "insert", error: { code: "23505" } },
      { op: "select", rows: [] },
      { op: "insert", error: { code: "23505" } },
      { op: "select", rows: [] },
    ])

    await expect(openAlert(db as never, openInput)).rejects.toMatchObject({
      code: "conflict",
    })
  })

  it("rethrows a database error that is not a unique violation", async () => {
    const db = scriptedDb([{ op: "insert", error: new Error("db down") }])

    await expect(openAlert(db as never, openInput)).rejects.toThrow("db down")
    expect(openedEvents()).toHaveLength(0)
  })

  it("rethrows a non-object insert failure", async () => {
    const db = scriptedDb([{ op: "insert", error: "nope" }])

    await expect(openAlert(db as never, openInput)).rejects.toBe("nope")
  })

  it("rethrows a read failure when the insert did not conflict", async () => {
    const db = scriptedDb([
      { op: "insert", rows: [] },
      { op: "select", error: new Error("db down") },
    ])

    await expect(openAlert(db as never, openInput)).rejects.toThrow("db down")
  })

  it("rejects invalid type, severity, dedupe key, payload, and time", async () => {
    const db = scriptedDb([])
    await expect(
      openAlert(db as never, { ...openInput, type: "  " })
    ).rejects.toMatchObject({ code: "validation_failed" })
    await expect(
      openAlert(db as never, { ...openInput, severity: "panic" as "warning" })
    ).rejects.toMatchObject({ code: "validation_failed" })
    await expect(
      openAlert(db as never, { ...openInput, dedupeKey: " " })
    ).rejects.toMatchObject({ code: "validation_failed" })
    await expect(
      openAlert(db as never, {
        ...openInput,
        payload: ["nope"] as unknown as Record<string, unknown>,
      })
    ).rejects.toMatchObject({ code: "validation_failed" })
    await expect(
      openAlert(db as never, { ...openInput, now: new Date("nope") })
    ).rejects.toMatchObject({ code: "validation_failed" })
    expect(db.insert).not.toHaveBeenCalled()
  })
})

describe("closeAlert", () => {
  beforeEach(() => {
    info.mockReset()
  })

  it("is idempotent when the alert is already closed", async () => {
    const resolved = alertRow({
      status: "resolved",
      resolvedAt: at,
      acknowledgedBy: "019a0000-0000-7000-8000-000000000001",
      acknowledgedAt: at,
    })
    const db = scriptedDb([
      { op: "update", rows: [] },
      { op: "select", rows: [resolved] },
    ])

    const result = await closeAlert(db as never, {
      type: "send_late",
      dedupeKey: "send_late:s",
      now: later,
    })

    expect(result).toEqual({ alert: resolved, closed: false })
    expect(result.alert?.acknowledgedBy).toBe(
      "019a0000-0000-7000-8000-000000000001"
    )
    expect(closedEvents()).toHaveLength(0)
  })

  it("returns null when nothing matches", async () => {
    const db = scriptedDb([
      { op: "update", rows: [] },
      { op: "select", rows: [] },
    ])

    await expect(
      closeAlert(db as never, {
        type: "send_late",
        dedupeKey: "send_late:missing",
      })
    ).resolves.toEqual({ alert: null, closed: false })
  })

  it("rethrows a close database error", async () => {
    const db = scriptedDb([{ op: "update", error: new Error("db down") }])

    await expect(
      closeAlert(db as never, {
        type: "send_late",
        dedupeKey: "send_late:s",
      })
    ).rejects.toThrow("db down")
  })

  it("rejects an empty type", async () => {
    const db = scriptedDb([])
    await expect(
      closeAlert(db as never, { type: " ", dedupeKey: "send_late:s" })
    ).rejects.toMatchObject({ code: "validation_failed" })
    expect(db.update).not.toHaveBeenCalled()
  })

  it("targets the send_late, no_route, and ses identities", async () => {
    const clauses: unknown[] = []
    function db() {
      return {
        update: () => ({
          set: () => ({
            where: (clause: unknown) => {
              clauses.push(clause)
              return {
                returning: async () => [alertRow({ status: "resolved" })],
              }
            },
          }),
        }),
      }
    }

    const sendId = "019a0000-0000-7000-8000-000000000501"
    await closeSendLateAlert(db() as never, sendId, later)
    await closeNoRouteAlert(db() as never, "thank_you", null, later)
    await closeSesAccountPausedAlert(db() as never, later)

    const rendered = clauses.map((clause) => sqlText(clause))
    expect(rendered[0]).toContain("send_late")
    expect(rendered[0]).toContain(sendId)
    expect(rendered[1]).toContain("no_route")
    expect(rendered[1]).toContain("thank_you")
    expect(rendered[2]).toContain("ses_account_paused")
  })
})
