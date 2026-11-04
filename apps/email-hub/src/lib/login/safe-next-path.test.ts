import { describe, expect, it } from "vitest"

import { DEFAULT_POST_LOGIN_PATH, safeNextPath } from "./safe-next-path"

describe("safeNextPath", () => {
  it("keeps a same-origin relative path", () => {
    expect(safeNextPath("/dashboard")).toBe("/dashboard")
    expect(safeNextPath("/jobs?tab=failed")).toBe("/jobs?tab=failed")
    expect(safeNextPath("%2Fpage-states")).toBe("/page-states")
  })

  it("rejects absolute, protocol-relative, and empty values", () => {
    expect(safeNextPath("https://evil.example/phish")).toBe(
      DEFAULT_POST_LOGIN_PATH
    )
    expect(safeNextPath("//evil.example")).toBe(DEFAULT_POST_LOGIN_PATH)
    expect(safeNextPath("/\\evil")).toBe(DEFAULT_POST_LOGIN_PATH)
    expect(safeNextPath("dashboard")).toBe(DEFAULT_POST_LOGIN_PATH)
    expect(safeNextPath("")).toBe(DEFAULT_POST_LOGIN_PATH)
    expect(safeNextPath(null)).toBe(DEFAULT_POST_LOGIN_PATH)
  })

  it("accepts a custom fallback", () => {
    expect(safeNextPath(null, "/")).toBe("/")
  })
})
