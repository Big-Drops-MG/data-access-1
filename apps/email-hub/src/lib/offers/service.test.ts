import { describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"

import { listOffers } from "./service"

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

describe("listOffers", () => {
  it("returns serialized active offers", async () => {
    const at = new Date("2026-11-05T12:00:00.000Z")
    const db = {
      select: vi.fn(() =>
        query([
          {
            id: "019a0000-0000-7000-8000-0000000000aa",
            name: "Q4 relaunch",
            externalRef: "offer-42",
            status: "active",
            createdAt: at,
            updatedAt: at,
          },
        ])
      ),
    }

    await expect(
      listOffers({ limit: 50, status: "active" }, db as never as Database)
    ).resolves.toEqual({
      data: [
        {
          id: "019a0000-0000-7000-8000-0000000000aa",
          name: "Q4 relaunch",
          external_ref: "offer-42",
          status: "active",
        },
      ],
    })
  })
})
