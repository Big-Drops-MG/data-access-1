import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"
import type * as LoggerModule from "@workspace/logger"
import type * as SharedModule from "@workspace/shared"
import { AppError } from "@workspace/shared"

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
  CLAIM_LOCK_MS,
  claimFeedback,
  decideFeedback,
  getFeedback,
  isClaimHeldByOther,
  listFeedback,
} from "./service"

const userA = "019a0000-0000-7000-8000-000000000001"
const userB = "019a0000-0000-7000-8000-000000000002"
const itemId = "019a0000-0000-7000-8000-0000000000aa"
const recipientId = "019a0000-0000-7000-8000-0000000000bb"
const classificationId = "019a0000-0000-7000-8000-0000000000c1"
const at = new Date("2026-11-05T12:00:00.000Z")

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

function feedbackItemRow(overrides: Record<string, unknown> = {}) {
  return {
    id: itemId,
    recipientId,
    messageId: "019a0000-0000-7000-8000-0000000000cc",
    source: "provider_fbl",
    provider: "ses",
    classificationId: null,
    status: "pending",
    reviewingBy: null,
    lockedAt: null,
    decision: null,
    decidedBy: null,
    decidedAt: null,
    dedupeHash: "abc",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  }
}

function loadRow(itemOverrides: Record<string, unknown> = {}) {
  return [
    {
      item: feedbackItemRow(itemOverrides),
      email: "ada@example.com",
      classificationKey: null,
      classificationLabel: null,
    },
  ]
}

describe("isClaimHeldByOther", () => {
  it("blocks a second reviewer within 30 minutes", () => {
    const lockedAt = new Date(at.getTime() - 10 * 60 * 1000)
    expect(
      isClaimHeldByOther({ reviewingBy: userA, lockedAt }, userB, at)
    ).toBe(true)
  })

  it("allows takeover after 30 minutes", () => {
    const lockedAt = new Date(at.getTime() - CLAIM_LOCK_MS - 1)
    expect(
      isClaimHeldByOther({ reviewingBy: userA, lockedAt }, userB, at)
    ).toBe(false)
  })

  it("allows the same reviewer to refresh", () => {
    expect(
      isClaimHeldByOther({ reviewingBy: userA, lockedAt: at }, userA, at)
    ).toBe(false)
  })
})

describe("feedback service", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
    infoLog.mockReset()
    warnLog.mockReset()
  })

  it("lists feedback with a next cursor", async () => {
    const first = feedbackItemRow({
      id: "019a0000-0000-7000-8000-0000000000a2",
    })
    const second = feedbackItemRow({
      id: "019a0000-0000-7000-8000-0000000000a1",
    })
    const db = {
      select: vi.fn(() =>
        query([
          {
            item: first,
            email: "a@example.com",
            classificationKey: null,
            classificationLabel: null,
          },
          {
            item: second,
            email: "b@example.com",
            classificationKey: null,
            classificationLabel: null,
          },
          {
            item: feedbackItemRow({
              id: "019a0000-0000-7000-8000-0000000000a0",
            }),
            email: null,
            classificationKey: null,
            classificationLabel: null,
          },
        ])
      ),
    } as unknown as Database

    const result = await listFeedback({ limit: 2 }, db)
    expect(result.data).toHaveLength(2)
    expect(result.next_cursor).toBe("019a0000-0000-7000-8000-0000000000a1")
    expect(result.data[0]?.email).toBe("a@example.com")
  })

  it("returns detail or not_found", async () => {
    const foundDb = {
      select: vi.fn(() => query(loadRow())),
    } as unknown as Database
    await expect(getFeedback(itemId, foundDb)).resolves.toMatchObject({
      id: itemId,
      email: "ada@example.com",
      status: "pending",
    })

    const missingDb = {
      select: vi.fn(() => query([])),
    } as unknown as Database
    await expect(getFeedback(itemId, missingDb)).rejects.toMatchObject({
      code: "not_found",
    })
  })

  it("claims a pending item and audits", async () => {
    const claimed = feedbackItemRow({
      status: "in_review",
      reviewingBy: userA,
      lockedAt: at,
    })
    const tx = {
      select: vi.fn(() => query(loadRow())),
      update: vi.fn(() => query([claimed])),
    }
    const db = {
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx)
      ),
    } as unknown as Database

    const result = await claimFeedback(
      itemId,
      { userId: userA, requestId: "req-1" },
      db
    )
    expect(result).toMatchObject({
      status: "in_review",
      reviewing_by: userA,
    })
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "feedback_item.claim",
        objectType: "feedback_item",
        objectId: itemId,
      })
    )
  })

  it("returns 409 when another reviewer holds a fresh claim", async () => {
    const lockedAt = new Date()
    const tx = {
      select: vi.fn(() =>
        query(
          loadRow({
            status: "in_review",
            reviewingBy: userA,
            lockedAt,
          })
        )
      ),
      update: vi.fn(),
    }
    const db = {
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx)
      ),
    } as unknown as Database

    await expect(
      claimFeedback(itemId, { userId: userB }, db)
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
    expect(tx.update).not.toHaveBeenCalled()
    expect(warnLog).toHaveBeenCalled()
  })

  it("decides suppress and writes feedback_review suppression", async () => {
    const decided = feedbackItemRow({
      status: "resolved",
      classificationId,
      decision: "suppress",
      decidedBy: userA,
      decidedAt: at,
      reviewingBy: null,
      lockedAt: null,
    })
    let selectCalls = 0
    const tx = {
      select: vi.fn(() => {
        selectCalls += 1
        if (selectCalls === 1) {
          return query(
            loadRow({
              status: "in_review",
              reviewingBy: userA,
              lockedAt: at,
            })
          )
        }
        if (selectCalls === 2) {
          return query([
            {
              id: classificationId,
              key: "spam",
              label: "Spam",
              active: true,
            },
          ])
        }
        return query([{ id: recipientId, emailHash: "hash" }])
      }),
      update: vi.fn(() => query([decided])),
      insert: vi.fn(() => query([])),
    }
    const db = {
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx)
      ),
    } as unknown as Database

    const result = await decideFeedback(
      itemId,
      { classificationId, decision: "suppress" },
      { userId: userA },
      db
    )
    expect(result).toMatchObject({
      status: "resolved",
      decision: "suppress",
      classification_key: "spam",
    })
    expect(tx.insert).toHaveBeenCalled()
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "feedback_item.decide",
        after: expect.objectContaining({
          suppression_source: "feedback_review",
        }),
      })
    )
  })

  it("rejects suppress without a recipient or message", async () => {
    const tx = {
      select: vi.fn(() =>
        query(
          loadRow({
            recipientId: null,
            messageId: null,
            status: "in_review",
            reviewingBy: userA,
            lockedAt: at,
          })
        )
      ),
      update: vi.fn(),
      insert: vi.fn(),
    }
    const db = {
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx)
      ),
    } as unknown as Database

    await expect(
      decideFeedback(
        itemId,
        { classificationId, decision: "suppress" },
        { userId: userA },
        db
      )
    ).rejects.toBeInstanceOf(AppError)
    expect(tx.update).not.toHaveBeenCalled()
  })
})
