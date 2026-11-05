import { describe, expect, it } from "vitest"

import { serializeSuppression } from "./serialize"

const at = new Date("2026-11-05T12:00:00.000Z")
const removedAt = new Date("2026-11-05T13:00:00.000Z")

describe("serializeSuppression", () => {
  it("maps an active row and clears email_hash from the payload", () => {
    expect(
      serializeSuppression(
        {
          id: "019a0000-0000-7000-8000-0000000000aa",
          emailHash: "hash",
          recipientId: "019a0000-0000-7000-8000-0000000000bb",
          scope: "global",
          offerId: null,
          source: "manual",
          reason: null,
          addedBy: "019a0000-0000-7000-8000-000000000001",
          createdAt: at,
          removedAt: null,
        },
        "ada@example.com"
      )
    ).toEqual({
      id: "019a0000-0000-7000-8000-0000000000aa",
      email: "ada@example.com",
      recipient_id: "019a0000-0000-7000-8000-0000000000bb",
      scope: "global",
      offer_id: null,
      source: "manual",
      reason: null,
      added_by: "019a0000-0000-7000-8000-000000000001",
      created_at: "2026-11-05T12:00:00.000Z",
      removed_at: null,
    })
  })

  it("serializes a removed offer-scoped row with a null email", () => {
    expect(
      serializeSuppression(
        {
          id: "019a0000-0000-7000-8000-0000000000aa",
          emailHash: "hash",
          recipientId: null,
          scope: "offer",
          offerId: "019a0000-0000-7000-8000-000000000012",
          source: "complaint",
          reason: "spam",
          addedBy: null,
          createdAt: at,
          removedAt,
        },
        null
      )
    ).toEqual({
      id: "019a0000-0000-7000-8000-0000000000aa",
      email: null,
      recipient_id: null,
      scope: "offer",
      offer_id: "019a0000-0000-7000-8000-000000000012",
      source: "complaint",
      reason: "spam",
      added_by: null,
      created_at: "2026-11-05T12:00:00.000Z",
      removed_at: "2026-11-05T13:00:00.000Z",
    })
  })
})
