import { describe, expect, it, vi } from "vitest"

import { auditLog } from "@workspace/db"
import type { Database } from "@workspace/db/client"

import { writeAudit, type WriteAuditInput } from "./audit.js"

const USER_ID = "01900000-0000-7000-8000-000000000001"
const CLIENT_ID = "01900000-0000-7000-8000-000000000002"

function fakeDb(empty = false) {
  const inserted: Record<string, unknown>[] = []
  let table: unknown
  const db = {
    insert(next: unknown) {
      table = next
      return {
        values(row: Record<string, unknown>) {
          inserted.push(row)
          return {
            returning: async () =>
              empty
                ? []
                : [
                    {
                      id: "01900000-0000-7000-8000-0000000000aa",
                      createdAt: new Date("2026-10-29T00:00:00.000Z"),
                      ...inserted[inserted.length - 1],
                    },
                  ],
          }
        },
      }
    },
  }
  return { db: db as unknown as Database, inserted, table: () => table }
}

const base: WriteAuditInput = {
  actor: { type: "system" },
  action: "recipient.create",
  objectType: "recipient",
  objectId: USER_ID,
  requestId: "req-1",
  before: null,
  after: { status: "active" },
}

describe("writeAudit", () => {
  it("maps system, user, and api client rows", async () => {
    const system = fakeDb()
    const row = await writeAudit(system.db, base)
    expect(system.table()).toBe(auditLog)
    expect(row).toMatchObject({
      actorType: "system",
      actorId: null,
      action: "recipient.create",
      entityType: "recipient",
      entityId: USER_ID,
      requestId: "req-1",
      after: { status: "active" },
    })

    const user = fakeDb()
    await writeAudit(user.db, {
      ...base,
      actor: { type: "user", id: USER_ID.toUpperCase() },
    })
    expect(user.inserted[0]).toMatchObject({
      actorType: "user",
      actorId: USER_ID,
    })

    const client = fakeDb()
    await writeAudit(client.db, {
      ...base,
      actor: { type: "api_client", id: `  ${CLIENT_ID}  ` },
      action: "  alert.open  ",
      objectType: " alert ",
      objectId: " ",
      requestId: "",
      before: undefined,
      after: undefined,
      ip: " 203.0.113.8 ",
      userAgent: " EmailHub ",
    })
    expect(client.inserted[0]).toMatchObject({
      actorType: "api_client",
      actorId: CLIENT_ID,
      action: "alert.open",
      entityType: "alert",
      entityId: null,
      requestId: null,
      before: null,
      after: null,
      ip: "203.0.113.8",
      userAgent: "EmailHub",
    })
  })

  it("strips secrets and masks full emails without mutating the input", async () => {
    const after = {
      email: "  Jane@Example.COM ",
      from_email: "ops@example.com",
      tokenHash: "abc",
      password: "super-secret",
      access_token: "raw-token",
      "api-key": "key-1",
      passwordHash: "hash",
      clientSecret: "client",
      note: "ping jane@example.com today",
      nested: {
        replyTo: "help@example.com",
        html: "<p>secret</p>",
        body_text: "hello",
        kept: true,
      },
      when: new Date("2026-10-29T12:00:00.000Z"),
      count: 2,
      missing: undefined,
      list: ["ada@example.com", "plain"],
      ratio: Number.NaN,
      big: 12n,
      flag: false,
      sink: () => "nope",
      boxed: new Map([["email", "ada@example.com"]]),
    }
    const { db, inserted } = fakeDb()
    await writeAudit(db, { ...base, before: Symbol("audit"), after })

    expect(after.password).toBe("super-secret")
    expect(inserted[0]?.before).toBeNull()
    expect(inserted[0]?.after).toEqual({
      email: "ja***@example.com",
      from_email: "op***@example.com",
      tokenHash: "abc",
      note: "ping ja***@example.com today",
      nested: { replyTo: "he***@example.com", kept: true },
      when: "2026-10-29T12:00:00.000Z",
      count: 2,
      list: ["ad***@example.com", "plain"],
      ratio: null,
      big: "12",
      flag: false,
      sink: null,
      boxed: null,
    })
  })

  it("rejects bad input and an empty insert", async () => {
    const { db } = fakeDb()
    const rejected: Array<[Partial<WriteAuditInput>, string]> = [
      [{ actor: { type: "system", id: USER_ID } }, "actor.id"],
      [{ actor: { type: "user", id: "not-a-uuid" } }, "actor.id"],
      [
        { actor: { type: "nope" } as unknown as WriteAuditInput["actor"] },
        "actor.type",
      ],
      [{ actor: undefined as unknown as WriteAuditInput["actor"] }, "actor"],
      [{ action: "  " }, "action"],
      [{ objectType: "" }, "objectType"],
      [{ action: 1 as unknown as string }, "action"],
    ]
    for (const [patch, path] of rejected) {
      await expect(writeAudit(db, { ...base, ...patch })).rejects.toMatchObject(
        {
          code: "validation_failed",
          details: [{ path }],
        }
      )
    }

    const cycle: Record<string, unknown> = { name: "loop" }
    cycle.self = cycle
    const list: unknown[] = ["ok"]
    list.push(list)
    for (const [field, value] of [
      ["before", cycle],
      ["after", list],
    ] as const) {
      await expect(
        writeAudit(db, { ...base, [field]: value })
      ).rejects.toMatchObject({
        code: "validation_failed",
        details: [{ path: field, message: "Circular value" }],
      })
    }

    await expect(writeAudit(fakeDb(true).db, base)).rejects.toMatchObject({
      code: "internal",
    })
  })

  it("records sequential events and hides secrets when the insert fails", async () => {
    const { db, inserted } = fakeDb()
    await writeAudit(db, { ...base, action: "user.job_title_set" })
    await writeAudit(db, {
      ...base,
      action: "user.two_factor_reset",
      requestId: "req-2",
    })
    expect(inserted.map((row) => row.action)).toEqual([
      "user.job_title_set",
      "user.two_factor_reset",
    ])
    expect(inserted[1]).toMatchObject({ requestId: "req-2" })

    const failing = {
      insert() {
        return {
          values() {
            return {
              returning: async () => {
                throw new Error(
                  "insert failed password=super-secret email=jane@example.com"
                )
              },
            }
          },
        }
      },
    }
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {})
    try {
      await expect(
        writeAudit(failing as unknown as Database, {
          ...base,
          before: {
            password: "super-secret",
            email: "jane@example.com",
          },
        })
      ).rejects.toMatchObject({
        code: "internal",
        message: "Internal error",
      })
      expect(consoleError).not.toHaveBeenCalled()
      expect(consoleWarn).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
      consoleWarn.mockRestore()
    }
  })
})
