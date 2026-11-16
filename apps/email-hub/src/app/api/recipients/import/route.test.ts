import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const importRecipientsCsv = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("@/lib/recipients/import-service", () => ({ importRecipientsCsv }))

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

function multipartRequest(file?: File): Request {
  const form = new FormData()
  if (file) {
    form.set("file", file)
  }
  return new Request("http://localhost/api/recipients/import", {
    method: "POST",
    body: form,
  })
}

describe("POST /api/recipients/import", () => {
  beforeEach(() => {
    getSession.mockReset()
    importRecipientsCsv.mockReset()
  })

  it("returns 202 with upload_id for an operator", async () => {
    getSession.mockResolvedValue(session("operator"))
    importRecipientsCsv.mockResolvedValue({
      upload_id: "019a0000-0000-7000-8000-0000000000aa",
    })

    const file = new File(["email\nada@example.com\n"], "recipients.csv", {
      type: "text/csv",
    })
    const response = await POST(multipartRequest(file))

    expect(response.status).toBe(202)
    await expect(response.json()).resolves.toEqual({
      upload_id: "019a0000-0000-7000-8000-0000000000aa",
    })
    expect(importRecipientsCsv).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        userId: session("operator").id,
      })
    )
  })

  it("rejects a viewer", async () => {
    getSession.mockResolvedValue(session("viewer"))
    const file = new File(["email\nada@example.com\n"], "recipients.csv", {
      type: "text/csv",
    })
    const response = await POST(multipartRequest(file))
    expect(response.status).toBe(403)
    expect(importRecipientsCsv).not.toHaveBeenCalled()
  })

  it("rejects missing file field", async () => {
    getSession.mockResolvedValue(session("operator"))
    const response = await POST(multipartRequest())
    expect(response.status).toBe(422)
    expect(importRecipientsCsv).not.toHaveBeenCalled()
  })
})
