import { afterEach, describe, expect, it, vi } from "vitest"

import {
  ApiError,
  apiFetch,
  apiJson,
  isApiError,
  isConflictError,
} from "./api-client.js"

const redirectToLogin = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth-redirect", () => ({ redirectToLogin }))

describe("ApiError", () => {
  it("stores status code and optional fields", () => {
    const error = new ApiError("Nope", 422, "validation_failed", "req_1", [
      { path: "name", message: "Required" },
    ])
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("ApiError")
    expect(error.message).toBe("Nope")
    expect(error.status).toBe(422)
    expect(error.code).toBe("validation_failed")
    expect(error.requestId).toBe("req_1")
    expect(error.details).toEqual([{ path: "name", message: "Required" }])
  })

  it("detects conflict errors", () => {
    expect(isConflictError(new ApiError("Conflict", 409, "conflict"))).toBe(
      true
    )
    expect(
      isConflictError(new ApiError("Nope", 422, "validation_failed"))
    ).toBe(false)
    expect(isApiError(new Error("x"))).toBe(false)
  })
})

describe("apiFetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it("returns the response when the request succeeds", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response)
    )

    await expect(apiFetch("/api/health")).resolves.toBe(response)
    expect(fetch).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({
        credentials: "same-origin",
      })
    )
  })

  it("throws a typed ApiError for SD#10.1 error bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "validation_failed",
                message: "Validation failed",
                details: [{ path: "email", message: "Required" }],
              },
            }),
            {
              status: 422,
              headers: {
                "content-type": "application/json",
                "x-request-id": "req_abc",
              },
            }
          )
      )
    )

    await expect(apiFetch("/api/domains")).rejects.toMatchObject({
      name: "ApiError",
      status: 422,
      code: "validation_failed",
      message: "Validation failed",
      requestId: "req_abc",
      details: [{ path: "email", message: "Required" }],
    } satisfies Partial<ApiError>)
    expect(redirectToLogin).not.toHaveBeenCalled()
  })

  it("redirects to login on 401 with the current path as next", async () => {
    const assign = vi.fn()
    vi.stubGlobal("window", {
      location: {
        pathname: "/domains/1",
        search: "?tab=dns",
        assign,
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "unauthorized",
                message: "Unauthorized",
                details: [],
              },
            }),
            {
              status: 401,
              headers: { "content-type": "application/json" },
            }
          )
      )
    )

    await expect(apiFetch("/api/domains")).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
    })
    expect(redirectToLogin).toHaveBeenCalledWith("/domains/1?tab=dns")
  })

  it("parses JSON via apiJson", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: "1" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          })
      )
    )

    await expect(apiJson<{ id: string }>("/api/domains/1")).resolves.toEqual({
      id: "1",
    })
  })
})
