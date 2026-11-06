import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"
import type * as LoggerModule from "@workspace/logger"
import type * as SharedModule from "@workspace/shared"
import { AppError, hashEmail } from "@workspace/shared"

const writeAudit = vi.hoisted(() => vi.fn())
const infoLog = vi.hoisted(() => vi.fn())
const warnLog = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return { ...actual, writeAudit }
})

vi.mock("@workspace/logger", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof LoggerModule
  return {
    ...actual,
    getContextLogger: () => ({
      info: infoLog,
      warn: warnLog,
      error: vi.fn(),
      debug: vi.fn(),
    }),
  }
})

import {
  addManualSuppression,
  listSuppressions,
  removeSuppression,
} from "./service"

const userId = "019a0000-0000-7000-8000-000000000001"
const offerId = "019a0000-0000-7000-8000-000000000012"
const suppressionId = "019a0000-0000-7000-8000-0000000000aa"
const recipientId = "019a0000-0000-7000-8000-0000000000bb"
const at = new Date("2026-11-05T12:00:00.000Z")
const email = "ada@example.com"

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "leftJoin",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "onConflictDoNothing",
  ]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

function selectQueue(results: unknown[]) {
  const fn = vi.fn()
  for (const result of results) {
    fn.mockReturnValueOnce(query(result))
  }
  fn.mockReturnValue(query([]))
  return fn
}

function entryRow(
  overrides: Partial<{
    id: string
    source:
      "manual" | "list_unsub" | "optizmo" | "feedback_review" | "hard_bounce"
    scope: "global" | "offer" | "list_unsub"
    offerId: string | null
    recipientId: string | null
    removedAt: Date | null
    reason: string | null
    syncRunId: string | null
  }> = {}
) {
  return {
    id: overrides.id ?? suppressionId,
    emailHash: hashEmail(email),
    recipientId:
      overrides.recipientId === undefined ? recipientId : overrides.recipientId,
    scope: overrides.scope ?? "global",
    offerId: overrides.offerId === undefined ? null : overrides.offerId,
    source: overrides.source ?? "manual",
    reason: overrides.reason === undefined ? null : overrides.reason,
    addedBy: userId,
    syncRunId: overrides.syncRunId === undefined ? null : overrides.syncRunId,
    createdAt: at,
    removedAt: overrides.removedAt === undefined ? null : overrides.removedAt,
  }
}

describe("suppressions service", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
    infoLog.mockReset()
    warnLog.mockReset()
  })

  it("lists suppressions with a next cursor", async () => {
    const first = entryRow({ id: "019a0000-0000-7000-8000-0000000000a2" })
    const second = entryRow({ id: "019a0000-0000-7000-8000-0000000000a1" })
    const db = {
      select: vi.fn(() =>
        query([
          { entry: first, email },
          { entry: second, email: null },
        ])
      ),
    }

    const result = await listSuppressions(
      {
        limit: 1,
        includeRemoved: false,
        source: "manual",
        email,
      },
      db as never as Database
    )

    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: first.id,
      email,
      source: "manual",
    })
    expect(result.next_cursor).toBe(first.id)
  })

  it("creates a global manual suppression and audits", async () => {
    const created = entryRow()
    const tx = {
      select: selectQueue([[], []]),
      insert: vi.fn(() => query([created])),
    }
    const db = {
      transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    }

    const result = await addManualSuppression(
      { email: `  ${email.toUpperCase()} `, offerId: null },
      { userId, requestId: "req-create" },
      db as never as Database
    )

    expect(result).toMatchObject({
      id: suppressionId,
      email,
      created: true,
      scope: "global",
      source: "manual",
    })
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "suppression_entry.create",
        objectId: suppressionId,
        requestId: "req-create",
      })
    )
    expect(infoLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "suppression.created" }),
      expect.any(String)
    )
  })

  it("returns the existing manual row when insert races to a duplicate", async () => {
    const existing = entryRow()
    const tx = {
      select: selectQueue([
        [{ id: recipientId, emailHash: hashEmail(email) }],
        [existing],
      ]),
      insert: vi.fn(() => query([])),
    }
    const db = {
      transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    }

    const result = await addManualSuppression(
      { email, offerId: null },
      { userId },
      db as never as Database
    )

    expect(result).toMatchObject({
      id: existing.id,
      created: false,
      email,
    })
    expect(writeAudit).not.toHaveBeenCalled()
    expect(infoLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "suppression.duplicate_ignored" }),
      expect.any(String)
    )
  })

  it("rejects when an active non-manual suppression already occupies the scope", async () => {
    const existing = entryRow({ source: "hard_bounce" })
    const tx = {
      select: selectQueue([[{ id: offerId }], [], [existing]]),
      insert: vi.fn(() => query([])),
    }
    const db = {
      transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    }

    await expect(
      addManualSuppression(
        { email, offerId },
        { userId },
        db as never as Database
      )
    ).rejects.toMatchObject({
      code: "conflict",
    })
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "suppression.conflict" }),
      expect.any(String)
    )
  })

  it("rejects add when the offer does not exist", async () => {
    const tx = {
      select: selectQueue([[]]),
      insert: vi.fn(),
    }
    const db = {
      transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    }

    await expect(
      addManualSuppression(
        { email, offerId },
        { userId },
        db as never as Database
      )
    ).rejects.toBeInstanceOf(AppError)
  })

  it("removes an active suppression and audits the change", async () => {
    const updated = entryRow({
      removedAt: new Date("2026-11-05T13:00:00.000Z"),
    })
    const tx = {
      update: vi.fn(() => query([updated])),
      select: selectQueue([[{ entry: updated, email }]]),
    }
    const db = {
      transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    }

    await expect(
      removeSuppression(
        suppressionId,
        { userId, requestId: "req-remove" },
        db as never as Database
      )
    ).resolves.toMatchObject({
      id: suppressionId,
      email,
      removed_at: "2026-11-05T13:00:00.000Z",
    })
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "suppression_entry.remove",
        objectId: suppressionId,
        requestId: "req-remove",
      })
    )
    expect(infoLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "suppression.removed" }),
      expect.any(String)
    )
  })

  it("rejects removing a hard_bounce suppression", async () => {
    const current = entryRow({ source: "hard_bounce" })
    const tx = {
      update: vi.fn(() => query([])),
      select: selectQueue([[{ entry: current, email }]]),
    }
    const db = {
      transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    }

    await expect(
      removeSuppression(suppressionId, { userId }, db as never as Database)
    ).rejects.toMatchObject({ code: "conflict" })
    expect(warnLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: "suppression.remove_rejected" }),
      expect.any(String)
    )
  })

  it("returns an already-removed row without rewriting audit", async () => {
    const current = entryRow({
      removedAt: new Date("2026-11-05T13:00:00.000Z"),
    })
    const tx = {
      update: vi.fn(() => query([])),
      select: selectQueue([[{ entry: current, email }]]),
    }
    const db = {
      transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    }

    await expect(
      removeSuppression(suppressionId, { userId }, db as never as Database)
    ).resolves.toMatchObject({
      id: suppressionId,
      removed_at: "2026-11-05T13:00:00.000Z",
    })
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("throws not found when the suppression does not exist", async () => {
    const tx = {
      update: vi.fn(() => query([])),
      select: selectQueue([[]]),
    }
    const db = {
      transaction: vi.fn(async (fn: (trx: typeof tx) => unknown) => fn(tx)),
    }

    await expect(
      removeSuppression(suppressionId, { userId }, db as never as Database)
    ).rejects.toMatchObject({ code: "not_found" })
  })
})
