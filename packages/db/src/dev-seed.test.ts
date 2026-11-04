import { createHash } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  DEV_CATEGORIES,
  DEV_FREQUENCY_RULES,
  DEV_OFFER,
  DEV_RECIPIENTS,
  DEV_USER,
  assertDevSeedTarget,
  hashNormalisedEmail,
} from "./dev-seed.js"

const ADA_EMAIL_HASH =
  "b5fc85e55755f9e0d030a10ab4429b6b2944855f9a0d60077fe832becbc41d72"

describe("dev seed catalog", () => {
  it("covers both category kinds and the email types", () => {
    expect(DEV_CATEGORIES.map((category) => category.kind).sort()).toEqual([
      "relationship",
      "transactional",
      "transactional",
    ])
    expect(new Set(DEV_CATEGORIES.map((category) => category.key))).toEqual(
      new Set(["thank_you", "feedback_request", "engagement"])
    )
  })

  it("defines one global cap and one global collision rule", () => {
    const cap = DEV_FREQUENCY_RULES.find((rule) => rule.kind === "cap")
    const collision = DEV_FREQUENCY_RULES.find(
      (rule) => rule.kind === "collision"
    )

    expect(cap).toMatchObject({ maxCount: 3, windowDays: 7 })
    expect(collision).toMatchObject({
      blocksWithType: "thank_you",
      minGapHours: 24,
    })
    expect(new Set(DEV_FREQUENCY_RULES.map((rule) => rule.kind)).size).toBe(
      DEV_FREQUENCY_RULES.length
    )
  })

  it("uses one stable offer and example.com recipients", () => {
    expect(DEV_OFFER.externalRef).toBe("dev-sample-offer")
    expect(DEV_OFFER.status).toBe("active")
    expect(DEV_USER.email.endsWith("@example.com")).toBe(true)
    expect(DEV_RECIPIENTS.map((row) => row.email)).toEqual([
      "ada@example.com",
      "blair@example.com",
      "casey@example.com",
    ])
    expect(new Set(DEV_RECIPIENTS.map((row) => row.tier))).toEqual(
      new Set(["standard", "premium"])
    )
  })

  it("hashes the normalised recipient email with sha256", () => {
    expect(hashNormalisedEmail("  Ada@Example.COM ")).toBe(ADA_EMAIL_HASH)
    expect(hashNormalisedEmail("ada@example.com")).toBe(
      createHash("sha256").update("ada@example.com", "utf8").digest("hex")
    )
  })
})

describe("dev seed target", () => {
  it("allows the application role on loopback", () => {
    expect(() =>
      assertDevSeedTarget(
        "postgresql://emailhub_app:secret@127.0.0.1:5432/emailhub"
      )
    ).not.toThrow()
  })

  it("rejects a remote database even with verify-full", () => {
    expect(() =>
      assertDevSeedTarget(
        "postgresql://emailhub_app:secret@db.example:5432/emailhub?sslmode=verify-full"
      )
    ).toThrow(/loopback/)
  })

  it("rejects the owner login", () => {
    expect(() =>
      assertDevSeedTarget(
        "postgresql://emailhub:secret@127.0.0.1:5432/emailhub"
      )
    ).toThrow(/emailhub_app/)
  })
})
