import { afterEach, describe, expect, it, vi } from "vitest"

import { logAuthEvent, setAuthEventSink } from "./auth-events"

describe("logAuthEvent", () => {
  afterEach(() => {
    setAuthEventSink(undefined)
  })

  it("logs auth.login at info", () => {
    const sink = vi.fn()
    setAuthEventSink(sink)
    logAuthEvent("auth.login", { user_id: "u1" })
    expect(sink).toHaveBeenCalledWith("info", "auth.login", { user_id: "u1" })
  })

  it("logs auth.2fa_failed and auth.lockout at warn", () => {
    const sink = vi.fn()
    setAuthEventSink(sink)
    logAuthEvent("auth.2fa_failed", { user_id: "u1" })
    logAuthEvent("auth.lockout", { user_id: "u1" })
    expect(sink).toHaveBeenNthCalledWith(1, "warn", "auth.2fa_failed", {
      user_id: "u1",
    })
    expect(sink).toHaveBeenNthCalledWith(2, "warn", "auth.lockout", {
      user_id: "u1",
    })
  })
})
