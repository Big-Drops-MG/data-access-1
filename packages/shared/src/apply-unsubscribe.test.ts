import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"

const writeAudit = vi.hoisted(() => vi.fn())

vi.mock("./audit.js", () => ({
  writeAudit,
}))

import {
  applyUnsubscribe,
  LIST_UNSUBSCRIBE_ONE_CLICK_BODY,
  parseUnsubscribeRequestBody,
} from "./apply-unsubscribe.js"

const MESSAGE_ID = "0192f6c0-7a3e-7c1e-9d2b-3f6a5b8c1d44"
const RECIPIENT_ID = "01900000-0000-7000-8000-000000000047"
const CATEGORY_ID = "01900000-0000-7000-8000-000000000048"
const CATEGORY_B = "01900000-0000-7000-8000-000000000049"
const EMAIL_HASH = "abc123"

function thenableRows<T>(rows: T[]) {
  const promise = Promise.resolve(rows)
  return {
    limit: async () => rows,
    then: promise.then.bind(promise),
    catch: promise.catch.bind(promise),
  }
}

function fakeDb(selectQueue: unknown[][]) {
  const inserts: Record<string, unknown>[] = []
  const queue = [...selectQueue]

  const db = {
    select() {
      const chain = {
        from() {
          return chain
        },
        innerJoin() {
          return chain
        },
        where() {
          const rows = (queue.shift() ?? []) as unknown[]
          return thenableRows(rows)
        },
      }
      return chain
    },
    insert() {
      return {
        values(row: Record<string, unknown>) {
          inserts.push(row)
          const done = Promise.resolve(undefined)
          return Object.assign(done, {
            onConflictDoUpdate: async () => undefined,
          })
        },
      }
    },
  }

  return { db: db as unknown as Database, inserts }
}

describe("parseUnsubscribeRequestBody", () => {
  it("treats empty and one-click bodies as category opt-out", () => {
    expect(parseUnsubscribeRequestBody("")).toEqual({
      scope: "category",
      oneClick: false,
    })
    expect(
      parseUnsubscribeRequestBody(LIST_UNSUBSCRIBE_ONE_CLICK_BODY)
    ).toEqual({
      scope: "category",
      oneClick: true,
    })
    expect(
      parseUnsubscribeRequestBody(
        `List-Unsubscribe=${encodeURIComponent("One-Click")}`
      )
    ).toEqual({
      scope: "category",
      oneClick: true,
    })
    expect(
      parseUnsubscribeRequestBody("prefix List-Unsubscribe=One-Click suffix")
    ).toEqual({
      scope: "category",
      oneClick: true,
    })
    expect(parseUnsubscribeRequestBody("List-Unsubscribe=One%2DClick")).toEqual(
      {
        scope: "category",
        oneClick: true,
      }
    )
  })

  it("accepts scope all, category lists, and empty JSON object", () => {
    expect(
      parseUnsubscribeRequestBody(JSON.stringify({ scope: "all" }))
    ).toEqual({
      scope: "all",
      oneClick: false,
    })
    expect(
      parseUnsubscribeRequestBody(
        JSON.stringify({ categories: ["engagement", "news"] })
      )
    ).toEqual({
      scope: "category",
      categoryKeys: ["engagement", "news"],
      oneClick: false,
    })
    expect(parseUnsubscribeRequestBody("{}")).toEqual({
      scope: "category",
      oneClick: false,
    })
  })

  it("rejects unknown fields and invalid bodies", () => {
    expect(() => parseUnsubscribeRequestBody("{")).toThrow("invalid_json")
    expect(() =>
      parseUnsubscribeRequestBody(JSON.stringify({ foo: 1 }))
    ).toThrow("unknown_field")
    expect(() => parseUnsubscribeRequestBody("[]")).toThrow("invalid_body")
    expect(() => parseUnsubscribeRequestBody("null")).toThrow("invalid_body")
    expect(() =>
      parseUnsubscribeRequestBody(
        JSON.stringify({ scope: "all", categories: ["x"] })
      )
    ).toThrow("invalid_body")
    expect(() =>
      parseUnsubscribeRequestBody(JSON.stringify({ categories: ["", "  "] }))
    ).toThrow("invalid_body")
    expect(() =>
      parseUnsubscribeRequestBody(JSON.stringify({ scope: "category" }))
    ).toThrow("invalid_body")
  })
})

describe("applyUnsubscribe", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue({ id: "audit-1" })
  })

  it("returns not_found when the message is missing", async () => {
    const { db, inserts } = fakeDb([[]])
    await expect(
      applyUnsubscribe(db, { messageId: MESSAGE_ID, scope: "category" })
    ).resolves.toEqual({ status: "not_found" })
    expect(inserts).toHaveLength(0)
    expect(writeAudit).not.toHaveBeenCalled()
  })

  it("opts out of the message category by default", async () => {
    const { db, inserts } = fakeDb([
      [
        {
          recipientId: RECIPIENT_ID,
          emailHash: EMAIL_HASH,
          categoryId: CATEGORY_ID,
        },
      ],
    ])

    await expect(
      applyUnsubscribe(db, {
        messageId: MESSAGE_ID,
        scope: "category",
        requestId: "req-1",
        ip: "203.0.113.10",
        userAgent: "test-agent",
      })
    ).resolves.toEqual({
      status: "applied",
      recipientId: RECIPIENT_ID,
      categoryIds: [CATEGORY_ID],
    })

    expect(inserts).toEqual([
      expect.objectContaining({
        recipientId: RECIPIENT_ID,
        categoryId: CATEGORY_ID,
        optedOut: true,
        source: "unsubscribe_link",
      }),
    ])
    expect(writeAudit).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: "recipient.unsubscribe",
        objectId: RECIPIENT_ID,
        requestId: "req-1",
        ip: "203.0.113.10",
        userAgent: "test-agent",
      })
    )
  })

  it("resolves category keys and returns not_found when none match", async () => {
    const missing = fakeDb([
      [
        {
          recipientId: RECIPIENT_ID,
          emailHash: EMAIL_HASH,
          categoryId: CATEGORY_ID,
        },
      ],
      [],
    ])
    await expect(
      applyUnsubscribe(missing.db, {
        messageId: MESSAGE_ID,
        scope: "category",
        categoryKeys: ["missing"],
      })
    ).resolves.toEqual({ status: "not_found" })

    const found = fakeDb([
      [
        {
          recipientId: RECIPIENT_ID,
          emailHash: EMAIL_HASH,
          categoryId: CATEGORY_ID,
        },
      ],
      [{ id: CATEGORY_B }],
    ])
    await expect(
      applyUnsubscribe(found.db, {
        messageId: MESSAGE_ID,
        scope: "category",
        categoryKeys: [" engagement "],
      })
    ).resolves.toEqual({
      status: "applied",
      recipientId: RECIPIENT_ID,
      categoryIds: [CATEGORY_B],
    })
  })

  it("opts out of all relationship categories and inserts list_unsub once", async () => {
    const first = fakeDb([
      [
        {
          recipientId: RECIPIENT_ID,
          emailHash: EMAIL_HASH,
          categoryId: CATEGORY_ID,
        },
      ],
      [{ id: CATEGORY_ID }, { id: CATEGORY_B }],
      [],
    ])

    await expect(
      applyUnsubscribe(first.db, { messageId: MESSAGE_ID, scope: "all" })
    ).resolves.toEqual({
      status: "applied",
      recipientId: RECIPIENT_ID,
      categoryIds: [CATEGORY_ID, CATEGORY_B],
    })
    expect(first.inserts).toHaveLength(3)
    expect(first.inserts[2]).toMatchObject({
      emailHash: EMAIL_HASH,
      recipientId: RECIPIENT_ID,
      scope: "list_unsub",
      source: "list_unsub",
      reason: "hub_unsubscribe",
    })

    const existing = fakeDb([
      [
        {
          recipientId: RECIPIENT_ID,
          emailHash: EMAIL_HASH,
          categoryId: CATEGORY_ID,
        },
      ],
      [{ id: CATEGORY_ID }],
      [{ id: "suppression-1" }],
    ])
    await applyUnsubscribe(existing.db, {
      messageId: MESSAGE_ID,
      scope: "all",
    })
    expect(existing.inserts).toHaveLength(1)
    expect(existing.inserts[0]).toMatchObject({
      categoryId: CATEGORY_ID,
      source: "unsubscribe_link",
    })
  })

  it("returns not_found when scope all has no relationship categories", async () => {
    const { db } = fakeDb([
      [
        {
          recipientId: RECIPIENT_ID,
          emailHash: EMAIL_HASH,
          categoryId: CATEGORY_ID,
        },
      ],
      [],
    ])
    await expect(
      applyUnsubscribe(db, { messageId: MESSAGE_ID, scope: "all" })
    ).resolves.toEqual({ status: "not_found" })
  })
})
