import { afterEach, describe, expect, it, vi } from "vitest"

import { logAuthEvent, setAuthEventSink } from "./auth-events"

describe("logAuthEvent", () => {
  afterEach(() => {
    setAuthEventSink(undefined)
    vi.restoreAllMocks()
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

  it("writes a structured console.warn line via the default sink", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    setAuthEventSink(undefined)
    logAuthEvent("auth.2fa_enrolled", { user_id: "u1" })
    expect(warn).toHaveBeenCalledOnce()
    const payload = JSON.parse(String(warn.mock.calls[0]?.[0])) as {
      level: string
      event: string
      user_id: string
      service: string
    }
    expect(payload).toMatchObject({
      level: "info",
      event: "auth.2fa_enrolled",
      user_id: "u1",
      service: "web",
    })
  })
})
