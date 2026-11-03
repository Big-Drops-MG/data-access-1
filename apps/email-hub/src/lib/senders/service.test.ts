import { beforeEach, describe, expect, it, vi } from "vitest"

import type * as SharedModule from "@workspace/shared"

const writeAudit = vi.hoisted(() => vi.fn())
const getDb = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return {
    ...actual,
    writeAudit,
  }
})

vi.mock("@workspace/db/client", () => ({ getDb }))

import { createSender, getSender, listSenders, updateSender } from "./service"

const userId = "019a0000-0000-7000-8000-000000000001"
const domainId = "019a0000-0000-7000-8000-000000000010"
const senderId = "019a0000-0000-7000-8000-0000000000aa"
const at = new Date("2026-10-30T12:00:00.000Z")

function domainRow(
  overrides: Partial<{ id: string; name: string; status: string }> = {}
) {
  return {
    id: overrides.id ?? domainId,
    name: overrides.name ?? "mail.example.com",
    sesIdentityArn: null,
    status: (overrides.status ?? "verified") as
      "pending" | "verifying" | "verified" | "failed" | "inactive",
    createdBy: userId,
    createdAt: at,
    updatedAt: at,
    verifiedAt: at,
  }
}

function senderRow(
  overrides: Partial<{
    id: string
    fromEmail: string
    status: "active" | "inactive" | "pending_verification"
    version: number
    replyTo: string | null
    deactivatedAt: Date | null
  }> = {}
) {
  return {
    id: overrides.id ?? senderId,
    domainId,
    fromName: "Factory",
    fromEmail: overrides.fromEmail ?? "noreply@mail.example.com",
    replyTo: overrides.replyTo ?? null,
    status: overrides.status ?? ("active" as const),
    version: overrides.version ?? 1,
    createdBy: userId,
    createdAt: at,
    updatedAt: at,
    deactivatedAt: overrides.deactivatedAt ?? null,
  }
}

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of [
    "select",
    "from",
    "where",
    "orderBy",
    "limit",
    "insert",
    "values",
    "returning",
    "update",
    "set",
    "leftJoin",
    "groupBy",
  ]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe("senders service", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({})
    getDb.mockReset()
  })

  it("lists senders with cursor pagination", async () => {
    const rows = [
      senderRow({ id: "019a0000-0000-7000-8000-0000000000a2" }),
      senderRow({ id: "019a0000-0000-7000-8000-0000000000a1" }),
    ]
    let selectCalls = 0
    const db = {
      select: vi.fn(() => {
        selectCalls += 1
        return selectCalls === 1 ? query(rows) : query([])
      }),
    }
    getDb.mockReturnValue(db)

    const result = await listSenders({ limit: 1 })
    expect(result.data).toHaveLength(1)
    expect(result.data[0]?.active_route_count).toBe(0)
    expect(result.next_cursor).toBe("019a0000-0000-7000-8000-0000000000a2")
  })

  it("gets a sender by id", async () => {
    let selectCalls = 0
    const db = {
      select: vi.fn(() => {
        selectCalls += 1
        return selectCalls === 1
          ? query([senderRow()])
          : query([{ senderId, total: 2 }])
      }),
    }
    getDb.mockReturnValue(db)

    await expect(getSender(senderId)).resolves.toMatchObject({
      id: senderId,
      from_email: "noreply@mail.example.com",
      version: 1,
      active_route_count: 2,
    })
  })

  it("creates a sender on a verified domain and audits", async () => {
    const created = senderRow()
    const tx = {
      insert: vi.fn(() => query([created])),
    }
    const db = {
      select: vi.fn(() => query([domainRow()])),
      transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    getDb.mockReturnValue(db)

    const result = await createSender(
      {
        domainId,
        fromName: "Factory",
        localPart: "noreply",
        replyTo: "ops@example.com",
      },
      { userId, requestId: "req-1" }
    )

    expect(result.from_email).toBe("noreply@mail.example.com")
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "sender.create",
        objectType: "sender",
        objectId: senderId,
        requestId: "req-1",
      })
    )
  })

  it("rejects create when the domain is not verified", async () => {
    const db = {
      select: vi.fn(() => query([domainRow({ status: "pending" })])),
      transaction: vi.fn(),
    }
    getDb.mockReturnValue(db)

    await expect(
      createSender(
        { domainId, fromName: "X", localPart: "noreply" },
        { userId }
      )
    ).rejects.toMatchObject({ code: "validation_failed", status: 422 })
    expect(db.transaction).not.toHaveBeenCalled()
  })

  it("maps unique from_email violations to conflict on create", async () => {
    const tx = {
      insert: vi.fn(() => {
        const q = query(null)
        q.then = (
          _onFulfilled: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) =>
          Promise.reject({
            message: "Failed query",
            cause: { code: "23505" },
          }).then(undefined, onRejected)
        return q
      }),
    }
    const db = {
      select: vi.fn(() => query([domainRow()])),
      transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    getDb.mockReturnValue(db)

    await expect(
      createSender(
        { domainId, fromName: "X", localPart: "noreply" },
        { userId }
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })
  })

  it("rejects update when version mismatches", async () => {
    const before = senderRow({ version: 3 })
    const tx = {
      select: vi.fn(() => query([before])),
      update: vi.fn(),
    }
    const db = {
      transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    getDb.mockReturnValue(db)

    await expect(
      updateSender(senderId, { version: 1, fromName: "New" }, { userId })
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: expect.arrayContaining([
        expect.objectContaining({ path: "version", message: "3" }),
      ]),
    })
    expect(tx.update).not.toHaveBeenCalled()
  })

  it("blocks inactive when active routes exist", async () => {
    const before = senderRow({ version: 1 })
    const routeId = "019a0000-0000-7000-8000-0000000000cc"
    let selectCalls = 0
    const tx = {
      select: vi.fn(() => {
        selectCalls += 1
        if (selectCalls === 1) {
          return query([before])
        }
        return query([
          {
            id: routeId,
            emailType: "thank_you",
            offerName: null,
          },
        ])
      }),
      update: vi.fn(),
    }
    const db = {
      transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    getDb.mockReturnValue(db)

    await expect(
      updateSender(senderId, { version: 1, status: "inactive" }, { userId })
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toMatchObject({ code: "conflict", status: 409 })
      expect((error as { details: unknown }).details).toEqual([
        { path: "email_route", message: routeId },
        {
          path: `email_route/${routeId}/email_type`,
          message: "thank_you",
        },
        {
          path: `email_route/${routeId}/name`,
          message: "Default",
        },
      ])
      return true
    })
    expect(tx.update).not.toHaveBeenCalled()
  })

  it("bumps version and audits a successful update", async () => {
    const before = senderRow({ version: 1 })
    const after = senderRow({
      version: 2,
      fromEmail: "noreply@mail.example.com",
    })
    after.fromName = "Updated"
    let selectCalls = 0
    const tx = {
      select: vi.fn(() => {
        selectCalls += 1
        if (selectCalls === 1) {
          return query([before])
        }
        return query([])
      }),
      update: vi.fn(() => query([after])),
    }
    const db = {
      transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    }
    getDb.mockReturnValue(db)

    const result = await updateSender(
      senderId,
      { version: 1, fromName: "Updated" },
      { userId, requestId: "req-2" }
    )

    expect(result.version).toBe(2)
    expect(result.from_name).toBe("Updated")
    expect(writeAudit).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        action: "sender.update",
        requestId: "req-2",
      })
    )
  })
})
