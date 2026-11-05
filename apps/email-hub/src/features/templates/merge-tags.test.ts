import { describe, expect, it } from "vitest"

import {
  buildMergeTagChips,
  engagementComplianceMessage,
  publishBlockMessage,
} from "./merge-tags"

describe("template merge-tag helpers", () => {
  it("requires postal and unsubscribe for engagement bodies", () => {
    expect(
      engagementComplianceMessage("engagement", "<p>Hi {{first_name}}</p>")
    ).toMatch(/postal address and an unsubscribe link/)
    expect(
      engagementComplianceMessage(
        "engagement",
        "<p>{{postal_address}} {{unsubscribe_url}}</p>"
      )
    ).toBeNull()
    expect(engagementComplianceMessage("thank_you", "<p>Hi</p>")).toBeNull()
  })

  it("blocks publish when engagement uses tier_label", () => {
    expect(
      publishBlockMessage(
        "engagement",
        "Hi",
        "<p>{{tier_label}} {{postal_address}} {{unsubscribe_url}}</p>"
      )
    ).toMatch(/tier_label/)
  })

  it("marks required and unsupported chips for engagement", () => {
    const chips = buildMergeTagChips(
      "engagement",
      "{{first_name}}",
      "<p>{{tier_label}}{{postal_address}}</p>"
    )
    expect(chips.find((chip) => chip.name === "tier_label")?.tone).toBe(
      "unsupported"
    )
    expect(chips.find((chip) => chip.name === "postal_address")?.tone).toBe(
      "required"
    )
    expect(chips.find((chip) => chip.name === "first_name")?.tone).toBe(
      "available"
    )
  })
})
