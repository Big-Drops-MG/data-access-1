import { describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"

import { listEmailCategories } from "./service"

function query(result: unknown) {
  const q: Record<string, unknown> = {}
  const self = () => q
  for (const method of ["select", "from", "where", "orderBy"]) {
    q[method] = vi.fn(self)
  }
  q.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected)
  return q
}

describe("listEmailCategories", () => {
  it("returns categories and frequency rules", async () => {
    const categories = [
      {
        id: "019a0000-0000-7000-8000-000000000001",
        key: "engagement",
        name: "Engagement",
        description: null,
        kind: "relationship",
        defaultOptedIn: true,
        isActive: true,
      },
    ]
    const rules = [
      {
        id: "019a0000-0000-7000-8000-000000000002",
        kind: "cap",
        categoryId: null,
        maxCount: 3,
        windowDays: 7,
        blocksWithType: null,
        minGapHours: null,
        version: 1,
      },
    ]
    let calls = 0
    const db = {
      select: vi.fn(() => {
        calls += 1
        return query(calls === 1 ? categories : rules)
      }),
    }

    const result = await listEmailCategories(db as never as Database)
    expect(result.data).toEqual([
      expect.objectContaining({ key: "engagement", name: "Engagement" }),
    ])
    expect(result.frequency_rules).toEqual([
      expect.objectContaining({ kind: "cap", max_count: 3, window_days: 7 }),
    ])
  })
})
