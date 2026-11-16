import { beforeEach, describe, expect, it, vi } from "vitest"

import { session, trustedDevice, user, verification } from "@workspace/db"
import type { Database } from "@workspace/db/client"
import type * as SharedModule from "@workspace/shared"
import { APIError } from "better-auth/api"

import { assertActiveStaffForSession } from "@/lib/auth/auth-gates"

const writeAudit = vi.hoisted(() => vi.fn())
const resetTwoFactorForAdmin = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return { ...actual, writeAudit }
})

vi.mock("@/lib/auth/two-factor-lockout", () => ({
  resetTwoFactorForAdmin,
}))

import { consumeInvitation, readLiveInvitationRole } from "./invitation-store"
import {
  ACTIVE_ADMIN_LOCK_KEY,
  disableUser,
  inviteUser,
  resetManagedUserTwoFactor,
  updateUserRole,
} from "./service"

const actorId = "019a0000-0000-7000-8000-0000000000aa"
const adminA = "019a0000-0000-7000-8000-000000000001"
const adminB = "019a0000-0000-7000-8000-000000000002"
const operatorId = "019a0000-0000-7000-8000-000000000003"
const actor = { userId: actorId, requestId: "req-users" }
const now = new Date("2026-11-12T00:00:00.000Z")

type Row = Record<string, unknown>

type MemoryState = {
  users: Row[]
  verifications: Row[]
  sessions: Row[]
  devices: Row[]
}

function userRow(
  id: string,
  email: string,
  role: "admin" | "operator" | "viewer",
  status: "active" | "deactivated" = "active"
): Row {
  return {
    id,
    email,
    name: email,
    emailVerified: true,
    image: null,
    role,
    jobTitle: null,
    status,
    twoFactorEnabled: true,
    createdAt: now,
    updatedAt: now,
  }
}

function sessionRow(id: string, userId: string): Row {
  return {
    id,
    userId,
    token: `token-${id}`,
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    createdAt: now,
    updatedAt: now,
    ipAddress: null,
    userAgent: null,
  }
}

function deviceRow(id: string, userId: string): Row {
  return {
    id,
    userId,
    tokenHash: `hash-${id}`,
    userAgent: null,
    createdAt: now,
    expiresAt: new Date("2026-12-01T00:00:00.000Z"),
    lastUsedAt: null,
    revokedAt: null,
  }
}

function paramsOf(clause: unknown): unknown[] {
  const params: unknown[] = []
  const seen = new WeakSet<object>()
  const walk = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return
    }
    if (seen.has(value)) {
      return
    }
    seen.add(value)
    if ("brand" in value && "encoder" in value && "value" in value) {
      params.push(value.value)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    for (const child of Object.values(value)) {
      walk(child)
    }
  }
  walk(clause)
  return params
}

function matches(row: Row, params: unknown[]): boolean {
  return params.every((param) =>
    Object.values(row).some((value) => value === param)
  )
}

function sqlText(query: unknown): string {
  const parts: string[] = []
  const seen = new WeakSet<object>()
  const walk = (value: unknown) => {
    if (typeof value === "string" || value instanceof String) {
      parts.push(String(value))
      return
    }
    if (!value || typeof value !== "object") {
      return
    }
    if (seen.has(value)) {
      return
    }
    seen.add(value)
    if (Array.isArray(value)) {
      value.forEach(walk)
      return
    }
    const record = value as Record<string, unknown>
    if (
      Array.isArray(record.value) &&
      record.value.every((item) => typeof item === "string")
    ) {
      parts.push(record.value.join(""))
    } else if (
      typeof record.value === "string" ||
      typeof record.value === "number"
    ) {
      parts.push(String(record.value))
    }
    for (const child of Object.values(record)) {
      walk(child)
    }
  }
  walk(query)
  return parts.join(" ")
}

function createMemory(initial?: Partial<MemoryState>) {
  const box: { committed: MemoryState } = {
    committed: {
      users: initial?.users ?? [],
      verifications: initial?.verifications ?? [],
      sessions: initial?.sessions ?? [],
      devices: initial?.devices ?? [],
    },
  }
  const executes: unknown[] = []
  let transactions = 0
  let chain = Promise.resolve()

  function acquire(): Promise<() => void> {
    let unlock = () => {}
    const next = new Promise<void>((resolve) => {
      unlock = () => {
        resolve()
      }
    })
    const waitFor = chain
    chain = chain.then(() => next)
    return waitFor.then(() => unlock)
  }

  function rowsOf(state: MemoryState, table: unknown): Row[] {
    if (table === user) return state.users
    if (table === verification) return state.verifications
    if (table === session) return state.sessions
    if (table === trustedDevice) return state.devices
    throw new Error("Unexpected table")
  }

  function setRows(state: MemoryState, table: unknown, rows: Row[]) {
    if (table === user) state.users = rows
    else if (table === verification) state.verifications = rows
    else if (table === session) state.sessions = rows
    else if (table === trustedDevice) state.devices = rows
    else throw new Error("Unexpected table")
  }

  function query(
    getState: () => MemoryState,
    mode: "select" | "update" | "delete" | "insert",
    table?: unknown
  ) {
    let target = table
    let clause: unknown
    let limit: number | null = null
    let patch: Row | null = null
    let insertRow: Row | null = null

    const run = () => {
      const state = getState()
      if (!target) {
        throw new Error("Query has no table")
      }
      const current = rowsOf(state, target)
      const params = clause ? paramsOf(clause) : []
      const matched = clause
        ? current.filter((row) => matches(row, params))
        : current

      if (mode === "select") {
        return limit == null ? matched : matched.slice(0, limit)
      }
      if (mode === "delete") {
        setRows(
          state,
          target,
          current.filter((row) => !matches(row, params))
        )
        return matched
      }
      if (mode === "update") {
        const next = current.map((row) =>
          matches(row, params) ? { ...row, ...patch } : row
        )
        setRows(state, target, next)
        return next.filter((row) => matches(row, params))
      }
      const created = {
        createdAt: now,
        updatedAt: now,
        ...(Array.isArray(insertRow) ? insertRow[0] : insertRow),
      }
      setRows(state, target, [...current, created])
      return [created]
    }

    const chainQuery: Record<string, unknown> = {}
    const self = () => chainQuery
    chainQuery.from = (next: unknown) => {
      target = next
      return self()
    }
    chainQuery.where = (next: unknown) => {
      clause = next
      return self()
    }
    chainQuery.limit = (next: number) => {
      limit = next
      return self()
    }
    chainQuery.orderBy = () => self()
    chainQuery.for = () => self()
    chainQuery.set = (next: Row) => {
      patch = next
      return self()
    }
    chainQuery.values = (next: Row) => {
      insertRow = next
      return self()
    }
    chainQuery.returning = () => Promise.resolve(run())
    chainQuery.then = (
      onFulfilled: (value: Row[]) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve(run()).then(onFulfilled, onRejected)
    return chainQuery
  }

  function database(getState: () => MemoryState, writable: boolean): Database {
    const api = {
      select: () => query(getState, "select"),
      execute: async (statement: unknown) => {
        executes.push(statement)
        return []
      },
      update: (table: unknown) => {
        if (!writable) throw new Error("write outside transaction")
        return query(getState, "update", table)
      },
      delete: (table: unknown) => {
        if (!writable) throw new Error("write outside transaction")
        return query(getState, "delete", table)
      },
      insert: (table: unknown) => {
        if (!writable) throw new Error("write outside transaction")
        return query(getState, "insert", table)
      },
      transaction: async (run: (tx: Database) => Promise<unknown>) => {
        transactions += 1
        const draftBox = { draft: structuredClone(getState()) }
        let unlock: (() => void) | null = null
        const tx = database(() => draftBox.draft, true)
        const mutable = tx as unknown as {
          execute: (statement: unknown) => Promise<unknown>
        }
        const originalExecute = mutable.execute.bind(tx)
        mutable.execute = async (statement: unknown) => {
          unlock = await acquire()
          draftBox.draft = structuredClone(box.committed)
          return originalExecute(statement)
        }
        try {
          const result = await run(tx)
          box.committed = draftBox.draft
          return result
        } finally {
          const release = unlock as (() => void) | null
          if (release) {
            release()
          }
        }
      },
    }
    return api as unknown as Database
  }

  return {
    db: database(() => box.committed, false),
    getState: () => box.committed,
    executes,
    transactionCount: () => transactions,
  }
}

describe("user administration", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({ id: "audit" })
    resetTwoFactorForAdmin.mockReset()
    resetTwoFactorForAdmin.mockResolvedValue(undefined)
  })

  it("invites a workspace user without returning the secret", async () => {
    const memory = createMemory()
    const invitation = await inviteUser(
      { email: " New.User@BigDropsMarketing.com ", role: "operator" },
      actor,
      memory.db,
      now
    )

    expect(invitation).toMatchObject({
      email: "new.user@bigdropsmarketing.com",
      role: "operator",
      status: "invited",
      created: true,
      expires_at: "2026-11-19T00:00:00.000Z",
    })
    expect(memory.getState().users).toHaveLength(0)
    const stored = memory.getState().verifications[0]
    expect(stored?.value).toMatch(/^v1:operator:[a-f0-9]{64}$/)
    expect(JSON.stringify(invitation)).not.toContain(String(stored?.value))
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user.invited",
        actor: { type: "user", id: actorId },
        objectType: "user_invitation",
        objectId: invitation.id,
        before: null,
        after: {
          email: "new.user@bigdropsmarketing.com",
          role: "operator",
          expires_at: "2026-11-19T00:00:00.000Z",
        },
      })
    )
    expect(JSON.stringify(writeAudit.mock.calls[0]?.[1])).not.toContain(
      String(stored?.value)
    )
  })

  it("rejects an invalid role or off-domain email", async () => {
    const memory = createMemory()
    await expect(
      inviteUser(
        { email: "ada@bigdropsmarketing.com", role: "owner" },
        actor,
        memory.db,
        now
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [{ path: "role" }],
    })
    await expect(
      inviteUser(
        { email: "ada@gmail.com", role: "viewer" },
        actor,
        memory.db,
        now
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [{ path: "email" }],
    })
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("replaces a pending invitation and conflicts when the user exists", async () => {
    const memory = createMemory()
    const first = await inviteUser(
      { email: "ada@bigdropsmarketing.com", role: "viewer" },
      actor,
      memory.db,
      now
    )
    writeAudit.mockClear()
    const second = await inviteUser(
      { email: "ada@bigdropsmarketing.com", role: "operator" },
      actor,
      memory.db,
      new Date("2026-11-13T00:00:00.000Z")
    )

    expect(second.created).toBe(false)
    expect(second.id).toBe(first.id)
    expect(second.role).toBe("operator")
    expect(memory.getState().verifications).toHaveLength(1)
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user.invitation_replaced",
        before: { role: "viewer", expires_at: "2026-11-19T00:00:00.000Z" },
        after: expect.objectContaining({ role: "operator" }),
      })
    )

    memory
      .getState()
      .users.push(userRow(operatorId, "ada@bigdropsmarketing.com", "operator"))
    writeAudit.mockClear()
    await expect(
      inviteUser(
        { email: "ada@bigdropsmarketing.com", role: "admin" },
        actor,
        memory.db,
        now
      )
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: [{ path: "email", message: "User already exists" }],
    })
    expect(memory.getState().verifications).toHaveLength(0)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("serializes two invitations for the same email into one row", async () => {
    const memory = createMemory()
    const [first, second] = await Promise.all([
      inviteUser(
        { email: "ada@bigdropsmarketing.com", role: "viewer" },
        actor,
        memory.db,
        now
      ),
      inviteUser(
        { email: "ada@bigdropsmarketing.com", role: "operator" },
        actor,
        memory.db,
        now
      ),
    ])
    expect(memory.getState().verifications).toHaveLength(1)
    expect([first.created, second.created].sort()).toEqual([false, true])
  })

  it("changes a role and audits the previous and next values", async () => {
    const memory = createMemory({
      users: [
        userRow(adminA, "admin@bigdropsmarketing.com", "admin"),
        userRow(operatorId, "op@bigdropsmarketing.com", "operator"),
      ],
    })
    const updated = await updateUserRole(operatorId, "viewer", actor, memory.db)
    expect(updated).toMatchObject({
      id: operatorId,
      role: "viewer",
      status: "active",
    })
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user.role_changed",
        actor: { type: "user", id: actorId },
        objectType: "user",
        objectId: operatorId,
        before: { role: "operator" },
        after: { role: "viewer" },
      })
    )
    expect(memory.executes.map(sqlText).join("\n")).toContain(
      "pg_advisory_xact_lock"
    )
    expect(memory.executes.map(sqlText).join("\n")).toContain(
      ACTIVE_ADMIN_LOCK_KEY
    )
  })

  it("blocks self role changes and demotion of the last active admin", async () => {
    const memory = createMemory({
      users: [
        userRow(adminA, "admin@bigdropsmarketing.com", "admin"),
        userRow(operatorId, "op@bigdropsmarketing.com", "operator"),
      ],
    })
    await expect(
      updateUserRole(actorId, "viewer", actor, memory.db)
    ).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    })
    expect(memory.transactionCount()).toBe(0)

    await expect(
      updateUserRole(adminA, "operator", actor, memory.db)
    ).rejects.toMatchObject({
      code: "conflict",
      status: 409,
      details: [
        { path: "role", message: "The last active Admin cannot be demoted" },
      ],
    })
    expect(memory.getState().users.find((row) => row.id === adminA)?.role).toBe(
      "admin"
    )
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("lets one of two concurrent admin demotions succeed", async () => {
    const memory = createMemory({
      users: [
        userRow(adminA, "a@bigdropsmarketing.com", "admin"),
        userRow(adminB, "b@bigdropsmarketing.com", "admin"),
      ],
    })
    const results = await Promise.allSettled([
      updateUserRole(adminA, "viewer", actor, memory.db),
      updateUserRole(adminB, "viewer", actor, memory.db),
    ])
    const fulfilled = results.filter((result) => result.status === "fulfilled")
    const rejected = results.filter((result) => result.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(rejected[0]).toMatchObject({
      reason: expect.objectContaining({ code: "conflict" }),
    })
    const activeAdmins = memory
      .getState()
      .users.filter((row) => row.role === "admin" && row.status === "active")
    expect(activeAdmins).toHaveLength(1)
  })

  it("disables a user, revokes sessions and trusted devices, and audits the actor", async () => {
    const memory = createMemory({
      users: [
        userRow(adminA, "admin@bigdropsmarketing.com", "admin"),
        userRow(operatorId, "op@bigdropsmarketing.com", "operator"),
      ],
      sessions: [
        sessionRow("sess-op", operatorId),
        sessionRow("sess-admin", adminA),
      ],
      devices: [deviceRow("019a0000-0000-7000-8000-0000000000d1", operatorId)],
    })
    const disabled = await disableUser(operatorId, actor, memory.db)
    expect(disabled).toMatchObject({
      id: operatorId,
      status: "deactivated",
      already_disabled: false,
    })
    expect(memory.getState().sessions.map((row) => row.userId)).toEqual([
      adminA,
    ])
    expect(memory.getState().devices).toHaveLength(0)
    expect(() =>
      assertActiveStaffForSession({
        status: disabled.status,
        email: disabled.email,
      })
    ).toThrow(APIError)
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user.disabled",
        actor: { type: "user", id: actorId },
        objectId: operatorId,
        before: { status: "active", role: "operator" },
        after: { status: "deactivated", role: "operator" },
      })
    )
  })

  it("blocks self-disable and disabling the last active admin", async () => {
    const memory = createMemory({
      users: [userRow(adminA, "admin@bigdropsmarketing.com", "admin")],
      sessions: [sessionRow("sess-admin", adminA)],
    })
    await expect(
      disableUser(adminA, { userId: adminA, requestId: "req" }, memory.db)
    ).rejects.toMatchObject({
      code: "forbidden",
    })
    await expect(disableUser(adminA, actor, memory.db)).rejects.toMatchObject({
      code: "conflict",
      details: [
        { path: "status", message: "The last active Admin cannot be disabled" },
      ],
    })
    expect(memory.getState().users[0]?.status).toBe("active")
    expect(memory.getState().sessions).toHaveLength(1)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("lets one of two concurrent admin disables succeed", async () => {
    const memory = createMemory({
      users: [
        userRow(adminA, "a@bigdropsmarketing.com", "admin"),
        userRow(adminB, "b@bigdropsmarketing.com", "admin"),
      ],
      sessions: [sessionRow("sess-a", adminA), sessionRow("sess-b", adminB)],
      devices: [
        deviceRow("019a0000-0000-7000-8000-0000000000d1", adminA),
        deviceRow("019a0000-0000-7000-8000-0000000000d2", adminB),
      ],
    })
    const results = await Promise.allSettled([
      disableUser(adminA, actor, memory.db),
      disableUser(adminB, actor, memory.db),
    ])
    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(1)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(1)
    const active = memory
      .getState()
      .users.filter((row) => row.status === "active" && row.role === "admin")
    expect(active).toHaveLength(1)
    expect(memory.getState().sessions).toHaveLength(1)
    expect(memory.getState().devices).toHaveLength(1)
    expect(memory.getState().sessions[0]?.userId).toBe(active[0]?.id)
  })

  it("repeats a disable without a second audit", async () => {
    const memory = createMemory({
      users: [
        userRow(adminA, "admin@bigdropsmarketing.com", "admin"),
        userRow(
          operatorId,
          "op@bigdropsmarketing.com",
          "operator",
          "deactivated"
        ),
      ],
      sessions: [sessionRow("sess-op", operatorId)],
    })
    const repeated = await disableUser(operatorId, actor, memory.db)
    expect(repeated.already_disabled).toBe(true)
    expect(repeated.status).toBe("deactivated")
    expect(memory.getState().sessions).toHaveLength(0)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("does not keep a disable when the audit write fails", async () => {
    const memory = createMemory({
      users: [
        userRow(adminA, "admin@bigdropsmarketing.com", "admin"),
        userRow(operatorId, "op@bigdropsmarketing.com", "operator"),
      ],
      sessions: [sessionRow("sess-op", operatorId)],
      devices: [deviceRow("019a0000-0000-7000-8000-0000000000d1", operatorId)],
    })
    writeAudit.mockRejectedValueOnce(new Error("audit failed"))
    await expect(disableUser(operatorId, actor, memory.db)).rejects.toThrow(
      "audit failed"
    )
    expect(
      memory.getState().users.find((row) => row.id === operatorId)?.status
    ).toBe("active")
    expect(memory.getState().sessions).toHaveLength(1)
    expect(memory.getState().devices).toHaveLength(1)
  })

  it("blocks a self reset, a missing user, and delegates a real reset", async () => {
    const memory = createMemory({
      users: [userRow(operatorId, "op@bigdropsmarketing.com", "operator")],
    })
    await expect(
      resetManagedUserTwoFactor(actorId, actor, memory.db)
    ).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    })
    await expect(
      resetManagedUserTwoFactor(
        "019a0000-0000-7000-8000-000000000099",
        actor,
        memory.db
      )
    ).rejects.toMatchObject({ code: "not_found", status: 404 })
    expect(resetTwoFactorForAdmin).not.toHaveBeenCalled()

    await resetManagedUserTwoFactor(operatorId, actor, memory.db)
    expect(resetTwoFactorForAdmin).toHaveBeenCalledWith(operatorId, {
      actorId,
      requestId: "req-users",
    })
  })

  it("reads a live invitation for sign-in and consumes it once", async () => {
    const memory = createMemory()
    await inviteUser(
      { email: "ada@bigdropsmarketing.com", role: "viewer" },
      actor,
      memory.db,
      now
    )
    await expect(
      readLiveInvitationRole(memory.db, "Ada@BigDropsMarketing.com", now)
    ).resolves.toBe("viewer")
    await expect(
      readLiveInvitationRole(
        memory.db,
        "ada@bigdropsmarketing.com",
        new Date("2026-11-20T00:00:00.000Z")
      )
    ).resolves.toBeNull()
    await memory.db.transaction(async (tx) => {
      await consumeInvitation(tx, "ada@bigdropsmarketing.com")
    })
    expect(memory.getState().verifications).toHaveLength(0)
    await expect(
      readLiveInvitationRole(memory.db, "ada@bigdropsmarketing.com", now)
    ).resolves.toBeNull()
  })
})
