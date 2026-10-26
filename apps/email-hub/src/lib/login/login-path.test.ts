import { describe, expect, it } from "vitest"

import { DEFAULT_POST_LOGIN_PATH } from "./safe-next-path"
import { buildLoginPath } from "./login-path"

describe("buildLoginPath", () => {
  it("includes a sanitised next path", () => {
    expect(buildLoginPath({ next: "/jobs?tab=failed" })).toBe(
      `/login?next=${encodeURIComponent("/jobs?tab=failed")}`
    )
  })

  it("falls back to the default post-login path for unsafe next", () => {
    expect(buildLoginPath({ next: "https://evil.example" })).toBe(
      `/login?next=${encodeURIComponent(DEFAULT_POST_LOGIN_PATH)}`
    )
  })

  it("appends a generic error code when provided", () => {
    expect(buildLoginPath({ next: "/dashboard", error: "unprovisioned" })).toBe(
      `/login?next=${encodeURIComponent("/dashboard")}&error=unprovisioned`
    )
  })
})
