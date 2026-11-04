import { beforeEach, describe, expect, it, vi } from "vitest"

const error = vi.hoisted(() => vi.fn())
const child = vi.hoisted(() => vi.fn(() => ({ error })))

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({ error, child }),
  resolveRequestId: (value: string | undefined) => value ?? "generated-id",
}))

import {
  logThrownRequestError,
  logUnhandledRequestError,
  wasRequestErrorLogged,
} from "./request-error-log"

describe("request-error-log", () => {
  beforeEach(() => {
    error.mockReset()
    child.mockClear()
  })

  it("marks and logs thrown request errors once", () => {
    const err = new Error("boom")
    logThrownRequestError(err, "GET", "/api/domains", 12)
    expect(wasRequestErrorLogged(err)).toBe(true)
    expect(error).toHaveBeenCalledTimes(1)

    logThrownRequestError(err, "GET", "/api/domains", 12)
    expect(error).toHaveBeenCalledTimes(1)
  })

  it("logs unhandled request errors with request id and stripped path", () => {
    const err = new Error("db down")
    logUnhandledRequestError(err, {
      method: "POST",
      path: "/api/domains?page=1",
      headers: { "x-request-id": "req-1" },
    })

    expect(wasRequestErrorLogged(err)).toBe(true)
    expect(child).toHaveBeenCalledWith({ request_id: "req-1" })
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "http.unhandled_error",
        method: "POST",
        path: "/api/domains",
        err,
      }),
      "Unhandled request error"
    )

    logUnhandledRequestError(err, {
      method: "POST",
      path: "/api/domains?page=1",
      headers: { "x-request-id": "req-1" },
    })
    expect(error).toHaveBeenCalledTimes(1)
  })

  it("reads the first header value when headers are arrays", () => {
    const err = new Error("again")
    logUnhandledRequestError(err, {
      method: "GET",
      path: "/api/ready",
      headers: { "x-request-id": ["req-array", "ignored"] },
    })

    expect(child).toHaveBeenCalledWith({ request_id: "req-array" })
  })
})
