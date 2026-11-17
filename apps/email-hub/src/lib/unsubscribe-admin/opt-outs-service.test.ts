import { describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

import { listUnsubscribeOptOuts } from "./opt-outs-service"

const categoryId = "019a0000-0000-7000-8000-0000000000c1"
const categoryPrefId = "019a0000-0000-7000-8000-0000000000aa"
const allSuppressionId = "019a0000-0000-7000-8000-0000000000bb"
const recipientId = "019a0000-0000-7000-8000-0000000000r1"
const newer = new Date("2026-11-17T12:00:00.000Z")
const older = new Date("2026-11-16T12:00:00.000Z")

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of [
    "from",
    "where",
    "orderBy",
    "limit",
    "innerJoin",
    "leftJoin",
  ]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe("listUnsubscribeOptOuts", () => {
  it("merges category and list-unsub rows newest first", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          query([
            {
              id: categoryPrefId,
              email: "ada@example.com",
              recipientId,
              categoryId,
              categoryKey: "thank_you",
              categoryName: "Thank you",
              source: "unsubscribe_link",
              occurredAt: older,
            },
          ])
        )
        .mockReturnValueOnce(
          query([
            {
              id: allSuppressionId,
              email: "ada@example.com",
              recipientId,
              source: "list_unsub",
              occurredAt: newer,
            },
          ])
        ),
    }

    const page = await listUnsubscribeOptOuts(
      { limit: 10, scope: "all_types" },
      db as never
    )

    expect(page.data).toHaveLength(2)
    expect(page.data[0]).toMatchObject({
      id: allSuppressionId,
      kind: "all",
      email: "ada@example.com",
      category_id: null,
    })
    expect(page.data[1]).toMatchObject({
      id: categoryPrefId,
      kind: "category",
      category_key: "thank_you",
    })
    expect(page.next_cursor).toBeNull()
  })

  it("skips category rows when scope is all", async () => {
    const db = {
      select: vi.fn(() =>
        query([
          {
            id: allSuppressionId,
            email: null,
            recipientId: null,
            source: "list_unsub",
            occurredAt: newer,
          },
        ])
      ),
    }

    const page = await listUnsubscribeOptOuts(
      { limit: 10, scope: "all", q: "ada" },
      db as never
    )

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(page.data).toEqual([
      {
        id: allSuppressionId,
        kind: "all",
        email: null,
        recipient_id: null,
        category_id: null,
        category_key: null,
        category_name: null,
        source: "list_unsub",
        occurred_at: newer.toISOString(),
      },
    ])
  })

  it("skips list-unsub rows when scope is category", async () => {
    const db = {
      select: vi.fn(() =>
        query([
          {
            id: categoryPrefId,
            email: "ada@example.com",
            recipientId,
            categoryId,
            categoryKey: "thank_you",
            categoryName: "Thank you",
            source: "unsubscribe_link",
            occurredAt: newer,
          },
        ])
      ),
    }

    const page = await listUnsubscribeOptOuts(
      { limit: 10, scope: "category" },
      db as never
    )

    expect(db.select).toHaveBeenCalledTimes(1)
    expect(page.data[0]?.kind).toBe("category")
  })

  it("pages with a cursor and rejects invalid cursors", async () => {
    const db = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          query([
            {
              id: categoryPrefId,
              email: "ada@example.com",
              recipientId,
              categoryId,
              categoryKey: "thank_you",
              categoryName: "Thank you",
              source: "unsubscribe_link",
              occurredAt: newer,
            },
            {
              id: "019a0000-0000-7000-8000-0000000000a0",
              email: "bob@example.com",
              recipientId: "019a0000-0000-7000-8000-0000000000r2",
              categoryId,
              categoryKey: "thank_you",
              categoryName: "Thank you",
              source: "unsubscribe_link",
              occurredAt: older,
            },
          ])
        )
        .mockReturnValueOnce(query([])),
    }

    const first = await listUnsubscribeOptOuts(
      { limit: 1, scope: "all_types" },
      db as never
    )
    expect(first.data).toHaveLength(1)
    expect(first.next_cursor).toBeTruthy()

    const secondDb = {
      select: vi
        .fn()
        .mockReturnValueOnce(
          query([
            {
              id: categoryPrefId,
              email: "ada@example.com",
              recipientId,
              categoryId,
              categoryKey: "thank_you",
              categoryName: "Thank you",
              source: "unsubscribe_link",
              occurredAt: newer,
            },
            {
              id: "019a0000-0000-7000-8000-0000000000a0",
              email: "bob@example.com",
              recipientId: "019a0000-0000-7000-8000-0000000000r2",
              categoryId,
              categoryKey: "thank_you",
              categoryName: "Thank you",
              source: "unsubscribe_link",
              occurredAt: older,
            },
          ])
        )
        .mockReturnValueOnce(query([])),
    }

    const second = await listUnsubscribeOptOuts(
      {
        limit: 10,
        scope: "all_types",
        cursor: first.next_cursor!,
      },
      secondDb as never
    )
    expect(second.data.map((row) => row.id)).toEqual([
      "019a0000-0000-7000-8000-0000000000a0",
    ])

    await expect(
      listUnsubscribeOptOuts(
        { limit: 10, scope: "all_types", cursor: "not-valid" },
        { select: vi.fn() } as never
      )
    ).rejects.toMatchObject({
      code: AppError.validationFailed([]).code,
    })
  })
})
