import { getRequestId } from "@workspace/logger"
import { AppError, isAppError } from "@workspace/shared"
import { describe, expect, it } from "vitest"

import { jsonAppError, toErrorResponse } from "@/lib/api-response"

import { observeApiRequest } from "./with-api-request"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function respond(request: Request, status: "ok" | "app" | "boom") {
  return observeApiRequest(request, async () => {
    await new Promise((resolveWait) => setTimeout(resolveWait, 5))
    if (status === "ok") {
      return Response.json({ request_id: getRequestId() ?? null })
    }
    try {
      if (status === "app") {
        throw AppError.validationFailed([{ path: "name", message: "Required" }])
      }
      throw new Error("synthetic boom")
    } catch (error) {
      if (isAppError(error)) {
        return jsonAppError(error)
      }
      return toErrorResponse(error)
    }
  })
}

describe("API request ids", () => {
  it("returns a generated id on success when the header is missing", async () => {
    const response = await respond(
      new Request("http://localhost/api/health"),
      "ok"
    )
    const header = response.headers.get("x-request-id")
    expect(header).toMatch(UUID)
    await expect(response.json()).resolves.toEqual({ request_id: header })
  })

  it("preserves a valid incoming id", async () => {
    const response = await respond(
      new Request("http://localhost/api/health", {
        headers: { "x-request-id": "req-kept" },
      }),
      "ok"
    )
    expect(response.headers.get("x-request-id")).toBe("req-kept")
    await expect(response.json()).resolves.toEqual({ request_id: "req-kept" })
  })

  it("puts the id on validation and server error responses", async () => {
    const validation = await respond(
      new Request("http://localhost/api/domains", {
        headers: { "x-request-id": "req-422" },
      }),
      "app"
    )
    expect(validation.status).toBe(422)
    expect(validation.headers.get("x-request-id")).toBe("req-422")

    const server = await respond(
      new Request("http://localhost/api/domains", {
        headers: { "x-request-id": "req-500" },
      }),
      "boom"
    )
    expect(server.status).toBe(500)
    expect(server.headers.get("x-request-id")).toBe("req-500")
    const body = (await server.json()) as { error: { message: string } }
    expect(body.error.message).toBe("Internal error")
    expect(JSON.stringify(body)).not.toContain("synthetic boom")
  })

  it("does not leak request ids across concurrent calls", async () => {
    const [first, second] = await Promise.all([
      respond(
        new Request("http://localhost/api/a", {
          headers: { "x-request-id": "req-a" },
        }),
        "ok"
      ),
      respond(
        new Request("http://localhost/api/b", {
          headers: { "x-request-id": "req-b" },
        }),
        "ok"
      ),
    ])

    expect(first.headers.get("x-request-id")).toBe("req-a")
    expect(second.headers.get("x-request-id")).toBe("req-b")
    await expect(first.json()).resolves.toEqual({ request_id: "req-a" })
    await expect(second.json()).resolves.toEqual({ request_id: "req-b" })
  })
})
