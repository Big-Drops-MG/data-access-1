import type { SuppressionEntry } from "@workspace/db"
import { describe, expect, it } from "vitest"

import {
  pickSuppressionToKeep,
  privacyErasedEmail,
  PRIVACY_ERASURE_REASON,
} from "./privacy.js"

function entry(
  overrides: Partial<SuppressionEntry> & Pick<SuppressionEntry, "id" | "source">
): SuppressionEntry {
  return {
    emailHash: "abc",
    recipientId: null,
    scope: "global",
    offerId: null,
    reason: null,
    addedBy: null,
    syncRunId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    removedAt: null,
    ...overrides,
  }
}

describe("privacy helpers", () => {
  it("uses the email hash as the erased address", () => {
    expect(privacyErasedEmail("deadbeef")).toBe("deadbeef")
  })

  it("prefers hard_bounce when keeping one active suppression", () => {
    const kept = pickSuppressionToKeep([
      entry({ id: "1", source: "manual" }),
      entry({ id: "2", source: "hard_bounce" }),
      entry({
        id: "3",
        source: "optizmo",
        removedAt: new Date("2026-01-02T00:00:00.000Z"),
      }),
    ])
    expect(kept?.id).toBe("2")
  })

  it("returns null when every suppression is removed", () => {
    expect(
      pickSuppressionToKeep([
        entry({
          id: "1",
          source: "manual",
          removedAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
      ])
    ).toBeNull()
  })

  it("exposes the privacy erasure reason constant", () => {
    expect(PRIVACY_ERASURE_REASON).toBe("privacy_erasure")
  })
})
