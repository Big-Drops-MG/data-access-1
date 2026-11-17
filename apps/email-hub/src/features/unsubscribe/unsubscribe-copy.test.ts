import { describe, expect, it } from "vitest"

import {
  unsubscribeConfirmCopy,
  unsubscribeDoneMessage,
  unsubscribeExpiredMessage,
} from "@/features/unsubscribe/unsubscribe-copy"

describe("unsubscribe-copy", () => {
  it("builds category and all confirm copy from the category name", () => {
    const copy = unsubscribeConfirmCopy("Thank you")
    expect(copy.categoryLabel).toBe("Thank you")
    expect(copy.categoryDescription).toContain("Thank you")
    expect(copy.allDescription.toLowerCase()).toContain("relationship")
  })

  it("falls back when category name is missing", () => {
    expect(unsubscribeConfirmCopy(null).categoryLabel).toBe("this email type")
    expect(unsubscribeConfirmCopy("   ").categoryLabel).toBe("this email type")
  })

  it("returns done and expired messages for page states", () => {
    expect(unsubscribeDoneMessage("category")).toContain("this email type")
    expect(unsubscribeDoneMessage("all")).toContain("relationship")
    expect(unsubscribeExpiredMessage().toLowerCase()).toContain("expired")
  })
})
