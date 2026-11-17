import { describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"

import { listAuditLog } from "./service"

const entryId = "019a0000-0000-7000-8000-0000000000aa"
const actorId = "019a0000-0000-7000-8000-000000000001"
const objectId = "019a0000-0000-7000-8000-000000000002"
const at = new Date("2026-11-10T15:00:00.000Z")

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of ["select", "from", "where", "orderBy", "limit"]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

function auditRow(
  overrides: Partial<{
    id: string
    actorType: "user" | "api_client" | "system"
    actorId: string | null
    action: string
    entityType: string
    entityId: string | null
  }> = {}
) {
  return {
    id: overrides.id ?? entryId,
    actorType: overrides.actorType ?? "user",
    actorId: overrides.actorId === undefined ? actorId : overrides.actorId,
    action: overrides.action ?? "domain.create",
    entityType: overrides.entityType ?? "domain",
    entityId: overrides.entityId === undefined ? objectId : overrides.entityId,
    before: null,
    after: { name: "mail.example.com" },
    ip: null,
    userAgent: null,
    requestId: "req-1",
    createdAt: at,
  }
}

describe("listAuditLog", () => {
  it("lists rows and returns a next cursor", async () => {
    const rows = [
      auditRow({ id: "019a0000-0000-7000-8000-0000000000a2" }),
      auditRow({ id: "019a0000-0000-7000-8000-0000000000a1" }),
    ]
    const db = { select: vi.fn(() => query(rows)) }

    const page = await listAuditLog({ limit: 1 }, db as never as Database)
    expect(page.data).toHaveLength(1)
    expect(page.data[0]).toMatchObject({
      id: "019a0000-0000-7000-8000-0000000000a2",
      object_type: "domain",
      object_id: objectId,
      action: "domain.create",
    })
    expect(page.next_cursor).toBe("019a0000-0000-7000-8000-0000000000a2")
  })

  it("applies object id and ET date filters without throwing", async () => {
    const db = { select: vi.fn(() => query([auditRow()])) }

    const page = await listAuditLog(
      {
        limit: 10,
        objectId,
        objectType: "domain",
        actorType: "user",
        actorId,
        action: "domain.create",
        from: "2026-11-10",
        to: "2026-11-10",
        cursor: entryId,
      },
      db as never as Database
    )

    expect(page.next_cursor).toBeNull()
    expect(page.data[0]?.object_id).toBe(objectId)
  })
})
