import { describe, expect, it } from "vitest"

import { auditLogListQuerySchema } from "./schemas"

describe("auditLogListQuerySchema", () => {
  it("applies defaults and accepts filters", () => {
    expect(
      auditLogListQuerySchema.parse({
        actor_type: "user",
        actor_id: "019a0000-0000-7000-8000-000000000001",
        action: "domain.create",
        object_type: "domain",
        object_id: "019a0000-0000-7000-8000-000000000002",
        from: "2026-11-01",
        to: "2026-11-10",
      })
    ).toMatchObject({
      limit: 50,
      actor_type: "user",
      action: "domain.create",
      object_type: "domain",
      from: "2026-11-01",
      to: "2026-11-10",
    })
  })

  it("rejects reversed ET date ranges", () => {
    expect(() =>
      auditLogListQuerySchema.parse({
        from: "2026-11-10",
        to: "2026-11-01",
      })
    ).toThrow()
  })

  it("rejects actor_id when actor_type is system", () => {
    expect(() =>
      auditLogListQuerySchema.parse({
        actor_type: "system",
        actor_id: "019a0000-0000-7000-8000-000000000001",
      })
    ).toThrow()
  })
})
