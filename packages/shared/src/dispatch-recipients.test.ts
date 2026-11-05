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
})
