import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@workspace/shared"

const getSession = vi.hoisted(() => vi.fn())
const removeSuppression = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/suppressions/service", () => ({
  removeSuppression,
}))

import { POST } from "./route"

function session(role: "viewer" | "operator" | "admin") {
  return {
    id: "019a0000-0000-7000-8000-000000000001",
    email: "staff@example.com",
    name: "Staff",
    image: null,
    role,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

const suppressionId = "019a0000-0000-7000-8000-0000000000aa"

function removeRequest(body?: string): Request {
  return new Request(
    `http://localhost/api/suppressions/${suppressionId}/remove`,
    {
      method: "POST",
      headers: body
        ? { "content-type": "application/json", "x-request-id": "req-remove" }
        : { "x-request-id": "req-remove" },
      body,
    }
  )
}

describe("POST /api/suppressions/{id}/remove", () => {
  beforeEach(() => {
    getSession.mockReset()
    removeSuppression.mockReset()
  })

  it("rejects a viewer, an operator, and a missing session", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const viewer = await POST(removeRequest(), {
      params: Promise.resolve({ id: suppressionId }),
    })
    expect(viewer.status).toBe(403)

    getSession.mockResolvedValue(session("operator"))
    const operator = await POST(removeRequest(), {
      params: Promise.resolve({ id: suppressionId }),
    })
    expect(operator.status).toBe(403)

    getSession.mockResolvedValue(null)
    const missing = await POST(removeRequest(), {
      params: Promise.resolve({ id: suppressionId }),
    })
    expect(missing.status).toBe(401)
    expect(removeSuppression).not.toHaveBeenCalled()
  })

  it("rejects a machine key and an invalid id", async () => {
    const machine = await POST(
      new Request(`http://localhost/api/suppressions/${suppressionId}/remove`, {
        method: "POST",
        headers: { "x-key-id": "k1" },
      }),
      { params: Promise.resolve({ id: suppressionId }) }
    )
    expect(machine.status).toBe(401)

    getSession.mockResolvedValue(session("admin"))
    const invalid = await POST(
      new Request("http://localhost/api/suppressions/not-a-uuid/remove", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    )
    expect(invalid.status).toBe(422)
    expect(removeSuppression).not.toHaveBeenCalled()
  })

  it("removes for an admin and ignores a forged body", async () => {
    getSession.mockResolvedValue(session("admin"))
    removeSuppression.mockResolvedValue({
      id: suppressionId,
      source: "manual",
      removed_at: "2026-11-05T12:00:00.000Z",
    })

    const response = await POST(
      removeRequest(
        JSON.stringify({
          source: "manual",
          added_by: "019a0000-0000-7000-8000-000000000099",
          role: "admin",
        })
      ),
      { params: Promise.resolve({ id: suppressionId }) }
    )

    expect(response.status).toBe(200)
    expect(removeSuppression).toHaveBeenCalledWith(suppressionId, {
      userId: session("admin").id,
      requestId: "req-remove",
    })
  })

  it("maps a missing suppression to 404", async () => {
    getSession.mockResolvedValue(session("admin"))
    removeSuppression.mockRejectedValue(
      AppError.notFound([{ path: "id", message: "Suppression not found" }])
    )
    const response = await POST(removeRequest(), {
      params: Promise.resolve({ id: suppressionId }),
    })
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found" },
    })
  })
})
