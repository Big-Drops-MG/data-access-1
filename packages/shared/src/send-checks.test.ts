import { describe, expect, it } from "vitest"

import {
  firstFailedSendCheck,
  isTransactionalEmailType,
  type SendCheckFacts,
} from "./send-checks.js"

const baseFacts = (): SendCheckFacts => ({
  emailType: "engagement",
  recipientStatus: "active",
  recipientTier: "standard",
  hardOrComplaintSuppressed: false,
  engagementSuppressed: false,
  categoryOptedOut: false,
  collisionHit: false,
  frequencyCapHit: false,
})

describe("isTransactionalEmailType", () => {
  it("treats thank_you and feedback_request as transactional", () => {
    expect(isTransactionalEmailType("thank_you")).toBe(true)
    expect(isTransactionalEmailType("feedback_request")).toBe(true)
    expect(isTransactionalEmailType("engagement")).toBe(false)
  })
})

describe("firstFailedSendCheck", () => {
  it("returns null when every check passes", () => {
    expect(firstFailedSendCheck(baseFacts())).toBeNull()
  })

  it("returns recipient_bounced when status is not active", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        recipientStatus: "bounced",
        hardOrComplaintSuppressed: true,
        engagementSuppressed: true,
      })
    ).toBe("recipient_bounced")
  })

  it("returns suppressed for hard bounce / complaint on all types", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "thank_you",
        hardOrComplaintSuppressed: true,
      })
    ).toBe("suppressed")
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "engagement",
        hardOrComplaintSuppressed: true,
      })
    ).toBe("suppressed")
  })

  it("returns suppressed for engagement Optizmo/list/manual suppressions", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "engagement",
        engagementSuppressed: true,
      })
    ).toBe("suppressed")
  })

  it("ignores engagement suppressions for transactional types", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "thank_you",
        engagementSuppressed: true,
        categoryOptedOut: true,
      })
    ).toBeNull()
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "feedback_request",
        recipientTier: "premium",
        engagementSuppressed: true,
        categoryOptedOut: true,
      })
    ).toBeNull()
  })

  it("returns opted_out for engagement category opt-out", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "engagement",
        categoryOptedOut: true,
      })
    ).toBe("opted_out")
  })

  it("returns not_premium for feedback_request on non-premium recipients", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "feedback_request",
        recipientTier: "standard",
      })
    ).toBe("not_premium")
  })

  it("allows feedback_request for premium recipients", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "feedback_request",
        recipientTier: "premium",
      })
    ).toBeNull()
  })

  it("returns collision for feedback_request when a blocking send is recent", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "feedback_request",
        recipientTier: "premium",
        collisionHit: true,
      })
    ).toBe("collision")
  })

  it("does not apply collision or not_premium outside feedback_request", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "thank_you",
        recipientTier: "standard",
        collisionHit: true,
      })
    ).toBeNull()
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "engagement",
        recipientTier: "standard",
        collisionHit: true,
      })
    ).toBeNull()
  })

  it("returns frequency_cap when the cap is hit", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "engagement",
        frequencyCapHit: true,
      })
    ).toBe("frequency_cap")
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "thank_you",
        frequencyCapHit: true,
      })
    ).toBe("frequency_cap")
  })

  it("evaluates checks in SD#7 order", () => {
    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "feedback_request",
        recipientStatus: "bounced",
        recipientTier: "standard",
        hardOrComplaintSuppressed: true,
        engagementSuppressed: true,
        categoryOptedOut: true,
        collisionHit: true,
        frequencyCapHit: true,
      })
    ).toBe("recipient_bounced")

    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "engagement",
        hardOrComplaintSuppressed: true,
        engagementSuppressed: true,
        categoryOptedOut: true,
        frequencyCapHit: true,
      })
    ).toBe("suppressed")

    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "engagement",
        engagementSuppressed: true,
        categoryOptedOut: true,
        frequencyCapHit: true,
      })
    ).toBe("suppressed")

    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "engagement",
        categoryOptedOut: true,
        frequencyCapHit: true,
      })
    ).toBe("opted_out")

    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "feedback_request",
        recipientTier: "standard",
        collisionHit: true,
        frequencyCapHit: true,
      })
    ).toBe("not_premium")

    expect(
      firstFailedSendCheck({
        ...baseFacts(),
        emailType: "feedback_request",
        recipientTier: "premium",
        collisionHit: true,
        frequencyCapHit: true,
      })
    ).toBe("collision")
  })
})
