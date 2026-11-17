import { describe, expect, it } from "vitest"

import { parseComplaintsView } from "@/features/feedback/feedback-view"

describe("parseComplaintsView", () => {
  it("defaults to users", () => {
    expect(parseComplaintsView(undefined)).toBe("users")
    expect(parseComplaintsView("nope")).toBe("users")
  })

  it("accepts domains", () => {
    expect(parseComplaintsView("domains")).toBe("domains")
  })
})
