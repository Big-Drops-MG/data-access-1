import { describe, expect, it } from "vitest"

import { loadEmailCatalog } from "./email-catalog-seed.js"

describe("loadEmailCatalog", () => {
  it("loads the versioned catalog shipped with the package", () => {
    const catalog = loadEmailCatalog()
    expect(catalog.version).toBe(1)
    expect(catalog.categories.map((c) => c.key)).toEqual([
      "thank_you",
      "feedback_request",
      "engagement",
    ])
    expect(catalog.frequency_rules).toHaveLength(2)
    expect(catalog.frequency_rules[0]).toMatchObject({
      kind: "cap",
      category_key: null,
      max_count: 3,
      window_days: 7,
    })
  })
})
