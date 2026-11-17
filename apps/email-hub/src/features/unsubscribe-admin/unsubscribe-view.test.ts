import { describe, expect, it } from "vitest"

import { parseUnsubscribeView } from "@/features/unsubscribe-admin/unsubscribe-view"

describe("parseUnsubscribeView", () => {
  it("defaults to list and accepts settings", () => {
    expect(parseUnsubscribeView(undefined)).toBe("list")
    expect(parseUnsubscribeView("list")).toBe("list")
    expect(parseUnsubscribeView("settings")).toBe("settings")
    expect(parseUnsubscribeView("other")).toBe("list")
  })
})
