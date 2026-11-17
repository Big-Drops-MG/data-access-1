import { describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"

import { listAuditActors, listAuditLog } from "./service"

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

function dbWithSelectQueue(results: unknown[]) {
  let index = 0
  return {
    select: vi.fn(() => {
      const result = results[Math.min(index, results.length - 1)]
      index += 1
      return query(result)
    }),
  }
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
  it("lists rows with resolved actor names and a next cursor", async () => {
    const rows = [
      auditRow({ id: "019a0000-0000-7000-8000-0000000000a2" }),
      auditRow({ id: "019a0000-0000-7000-8000-0000000000a1" }),
    ]
    const db = dbWithSelectQueue([
      rows,
      [{ id: actorId, name: "Alex Operator" }],
    ])

    const page = await listAuditLog({ limit: 1 }, db as never as Database)
    expect(page.data).toHaveLength(1)
    expect(page.data[0]).toMatchObject({
      id: "019a0000-0000-7000-8000-0000000000a2",
      actor_name: "Alex Operator",
      object_type: "domain",
      object_id: objectId,
      action: "domain.create",
    })
    expect(page.next_cursor).toBe("019a0000-0000-7000-8000-0000000000a2")
  })

  it("falls back to System when actor type is system", async () => {
    const db = dbWithSelectQueue([
      [auditRow({ actorType: "system", actorId: null })],
    ])

    const page = await listAuditLog({ limit: 10 }, db as never as Database)
    expect(page.data[0]?.actor_name).toBe("System")
  })

  it("applies object id and ET date filters without throwing", async () => {
    const db = dbWithSelectQueue([
      [auditRow()],
      [{ id: actorId, name: "Alex Operator" }],
    ])

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
    expect(page.data[0]?.actor_name).toBe("Alex Operator")
  })
})

describe("listAuditActors", () => {
  it("returns users and API clients for the actor picker", async () => {
    const db = dbWithSelectQueue([
      [{ id: actorId, name: "Alex Operator" }],
      [{ id: objectId, name: "Send API" }],
    ])

    const result = await listAuditActors(db as never as Database)
    expect(result.data).toEqual([
      { id: actorId, type: "user", name: "Alex Operator" },
      { id: objectId, type: "api_client", name: "Send API" },
    ])
  })
})
