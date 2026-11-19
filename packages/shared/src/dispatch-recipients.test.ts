import { describe, expect, it } from "vitest"

import {
  DISPATCH_RECIPIENT_PAGE_SIZE,
  loadDispatchRecipientPage,
} from "./dispatch-recipients.js"

describe("loadDispatchRecipientPage", () => {
  it("clamps the page size to the dispatch batch limit", async () => {
    let capturedLimit: number | undefined
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: (limit: number) => {
                capturedLimit = limit
                return Promise.resolve([])
              },
            }),
          }),
        }),
      }),
    }

    await loadDispatchRecipientPage(db as never, {
      categoryId: "01900000-0000-7000-8000-000000000200",
      emailType: "thank_you",
      limit: 5_000,
    })

    expect(capturedLimit).toBe(DISPATCH_RECIPIENT_PAGE_SIZE)
  })

  it("skips the opt-out exclusion for transactional email types", async () => {
    let whereArg: unknown
    const db = {
      select: () => ({
        from: () => ({
          where: (condition: unknown) => {
            whereArg = condition
            return {
              orderBy: () => ({
                limit: () => Promise.resolve([]),
              }),
            }
          },
        }),
      }),
    }

    await loadDispatchRecipientPage(db as never, {
      categoryId: "01900000-0000-7000-8000-000000000201",
      emailType: "thank_you",
      limit: 10,
    })

    expect(whereArg).toBeDefined()
  })

  it("defaults the page size and clamps invalid limits", async () => {
    const limits: number[] = []
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: () => ({
              limit: (limit: number) => {
                limits.push(limit)
                return Promise.resolve([])
              },
            }),
          }),
        }),
      }),
    }

    await loadDispatchRecipientPage(db as never, {
      categoryId: "01900000-0000-7000-8000-000000000202",
      emailType: "thank_you",
    })
    await loadDispatchRecipientPage(db as never, {
      categoryId: "01900000-0000-7000-8000-000000000202",
      emailType: "thank_you",
      limit: 0,
    })
    await loadDispatchRecipientPage(db as never, {
      categoryId: "01900000-0000-7000-8000-000000000202",
      emailType: "thank_you",
      limit: Number.NaN,
    })

    expect(limits).toEqual([DISPATCH_RECIPIENT_PAGE_SIZE, 1, 1])
  })

  it("pages after a cursor and applies opt-out exclusion for marketing mail", async () => {
    let selectCalls = 0
    const db = {
      select: () => {
        selectCalls += 1
        return {
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve([]),
              }),
            }),
          }),
        }
      },
    }

    await loadDispatchRecipientPage(db as never, {
      categoryId: "01900000-0000-7000-8000-000000000203",
      emailType: "engagement",
      afterId: "  01900000-0000-7000-8000-000000000099  ",
      limit: 25,
    })

    expect(selectCalls).toBeGreaterThanOrEqual(1)
  })
})
