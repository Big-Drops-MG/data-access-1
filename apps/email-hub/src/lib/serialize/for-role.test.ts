import { describe, expect, it } from "vitest"

import { serializeForRole } from "@/lib/serialize/for-role"

describe("serializeForRole", () => {
  const payload = {
    id: "1",
    email: "jane@example.com",
    nested: { fromEmail: "ops@example.com" },
    list: [{ replyTo: "help@example.com" }, "plain"],
  }

  it("leaves operator and admin payloads unmasked", () => {
    expect(serializeForRole("operator", payload)).toEqual(payload)
    expect(serializeForRole("admin", payload)).toEqual(payload)
  })

  it("masks emails for viewers on known keys and email-shaped strings", () => {
    expect(serializeForRole("viewer", payload)).toEqual({
      id: "1",
      email: "ja***@example.com",
      nested: { fromEmail: "op***@example.com" },
      list: [{ replyTo: "he***@example.com" }, "plain"],
    })
  })

  it("masks a top-level email string for viewers", () => {
    expect(serializeForRole("viewer", "ada@example.com")).toBe(
      "ad***@example.com"
    )
  })
})
