import { afterEach, describe, expect, it, vi } from "vitest"

import {
  WEB_SERVICE,
  createLogger,
  setFallbackLogger,
  type AppLogger,
} from "@workspace/logger"

import { logAuthEvent, setAuthEventSink } from "./auth-events"

describe("logAuthEvent", () => {
  afterEach(() => {
    setAuthEventSink(undefined)
    setFallbackLogger(createLogger({ service: WEB_SERVICE }))
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

  it("writes a structured line via the default sink", async () => {
    const logger = createLogger({ service: WEB_SERVICE })
    setFallbackLogger(logger)
    const lines = capture(logger)
    setAuthEventSink(undefined)
    logAuthEvent("auth.2fa_enrolled", { user_id: "u1" })
    await new Promise<void>((resolveFlush) => {
      logger.flush(() => {
        resolveFlush()
      })
    })

    const payload = JSON.parse(lines.at(-1) ?? "") as {
      level: string
      event: string
      user_id: string
      service: string
    }
    expect(payload).toMatchObject({
      level: "info",
      event: "auth.2fa_enrolled",
      user_id: "u1",
      service: WEB_SERVICE,
    })
  })
})

function capture(logger: AppLogger): string[] {
  const lines: string[] = []
  const stream = (
    logger as unknown as Record<symbol, { write: (chunk: string) => void }>
  )[streamSymbol(logger)]
  if (!stream) {
    throw new Error("Logger has no stream")
  }
  const original = stream.write.bind(stream)
  stream.write = (chunk: string) => {
    lines.push(typeof chunk === "string" ? chunk : String(chunk))
    return original(chunk)
  }
  return lines
}

function streamSymbol(logger: AppLogger): symbol {
  let current: object | null = logger
  while (current) {
    const found = Object.getOwnPropertySymbols(current).find(
      (symbol) => symbol.description === "pino.stream"
    )
    if (found) {
      return found
    }
    current = Object.getPrototypeOf(current) as object | null
  }
  throw new Error("Logger has no stream")
}
