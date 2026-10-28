import { describe, expect, it, vi } from "vitest"

import type { Message, Recipient } from "@workspace/db"

import { type AppError } from "./errors.js"
import {
  firstFailedSendCheck,
  insertSkippedSendCheckMessage,
  isTransactionalEmailType,
  runSendChecks,
  type SendCheckFacts,
} from "./send-checks.js"
import type { EmailHubTx } from "./trigger-email.js"

const recipientRow = {
  id: "01900000-0000-7000-8000-000000000001",
  email: "jane@example.com",
  emailHash: "abc123",
  externalUserId: null,
  tier: "standard",
  tierUpdatedAt: new Date(),
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastEmailedAt: null,
} as Recipient

const now = new Date("2026-10-28T12:00:00.000Z")

/** Queue of results for each `select()` call (thenable query chain). */
function createTx(selectResults: unknown[][]): EmailHubTx {
  let selectIndex = 0
  return {
    select: vi.fn(() => {
      const result = selectResults[selectIndex] ?? []
      selectIndex += 1
      const chain: {
        from: ReturnType<typeof vi.fn>
        where: ReturnType<typeof vi.fn>
        leftJoin: ReturnType<typeof vi.fn>
        limit: ReturnType<typeof vi.fn>
        then: (
          onFulfilled?: (value: unknown) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) => Promise<unknown>
      } = {
        from: vi.fn(),
        where: vi.fn(),
        leftJoin: vi.fn(),
        limit: vi.fn(async () => result),
        then: (onFulfilled, onRejected) =>
          Promise.resolve(result).then(onFulfilled, onRejected),
      }
      chain.from.mockReturnValue(chain)
      chain.where.mockReturnValue(chain)
      chain.leftJoin.mockReturnValue(chain)
      return chain
    }),
    insert: vi.fn(),
  } as unknown as EmailHubTx
}

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

describe("runSendChecks", () => {
  it("returns null for thank_you when suppression and cap are clear", async () => {
    // Parallel: hard/complaint only. Cap: category miss, global miss.
    const tx = createTx([[], [], []])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "thank_you",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBeNull()
  })

  it("returns suppressed when a hard_bounce row exists", async () => {
    const tx = createTx([[{ id: "sup-1" }], [], []])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "thank_you",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("suppressed")
  })

  it("returns suppressed for engagement Optizmo without checking opt-out first", async () => {
    // Parallel: hard/complaint miss, engagement hit, opt-out unused for order
    // Cap still runs: category miss, global miss
    const tx = createTx([[], [{ id: "eng-sup" }], [], [], []])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "engagement",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("suppressed")
  })

  it("checks offer-scoped engagement suppression when offerId is set", async () => {
    const tx = createTx([[], [{ id: "offer-sup" }], [], [], []])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "engagement",
        offerId: "offer-1",
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("suppressed")
  })

  it("returns opted_out for engagement category preference", async () => {
    const tx = createTx([[], [], [{ id: "pref-1" }], [], []])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "engagement",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("opted_out")
  })

  it("returns recipient_bounced from recipient status without needing suppressions", async () => {
    const bounced = { ...recipientRow, status: "bounced" as const }
    const tx = createTx([[], [], []])

    await expect(
      runSendChecks(tx, {
        recipient: bounced,
        emailType: "thank_you",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("recipient_bounced")
  })

  it("returns not_premium for feedback_request on standard tier", async () => {
    // hard/complaint; collision category miss + global miss; cap category + global
    const tx = createTx([[], [], [], [], []])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "feedback_request",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("not_premium")
  })

  it("returns collision when a blocking thank_you is in the gap window", async () => {
    const premium = { ...recipientRow, tier: "premium" as const }
    // hard/complaint; collision category rule; recent thank_you; cap category+global miss
    const tx = createTx([
      [],
      [
        {
          blocksWithType: "thank_you",
          minGapHours: 24,
          maxCount: null,
          windowDays: null,
        },
      ],
      [{ id: "msg-ty" }],
      [],
      [],
    ])

    await expect(
      runSendChecks(tx, {
        recipient: premium,
        emailType: "feedback_request",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("collision")
  })

  it("uses the global collision rule when no category rule exists", async () => {
    const premium = { ...recipientRow, tier: "premium" as const }
    const tx = createTx([
      [],
      [],
      [
        {
          blocksWithType: "thank_you",
          minGapHours: 24,
          maxCount: null,
          windowDays: null,
        },
      ],
      [{ id: "msg-ty" }],
      [],
      [],
    ])

    await expect(
      runSendChecks(tx, {
        recipient: premium,
        emailType: "feedback_request",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("collision")
  })

  it("skips collision when no collision rule is configured", async () => {
    const premium = { ...recipientRow, tier: "premium" as const }
    // hard/complaint; collision category miss; global miss; cap miss; global miss
    const tx = createTx([[], [], [], [], []])

    await expect(
      runSendChecks(tx, {
        recipient: premium,
        emailType: "feedback_request",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBeNull()
  })

  it("returns frequency_cap when the category cap is already reached", async () => {
    const tx = createTx([
      [],
      [],
      [],
      [{ maxCount: 2, windowDays: 7, blocksWithType: null, minGapHours: null }],
      [{ count: 2 }],
    ])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "engagement",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("frequency_cap")
  })

  it("uses the global frequency cap when no category cap exists", async () => {
    const tx = createTx([
      [],
      [],
      [],
      [],
      [{ maxCount: 3, windowDays: 7, blocksWithType: null, minGapHours: null }],
      [{ count: 3 }],
    ])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "engagement",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBe("frequency_cap")
  })

  it("treats a missing count row as zero under the cap", async () => {
    const tx = createTx([
      [],
      [],
      [],
      [{ maxCount: 2, windowDays: 7, blocksWithType: null, minGapHours: null }],
      [],
    ])

    await expect(
      runSendChecks(tx, {
        recipient: recipientRow,
        emailType: "engagement",
        offerId: null,
        categoryId: "cat-1",
        now,
      })
    ).resolves.toBeNull()
  })
})

describe("insertSkippedSendCheckMessage", () => {
  it("inserts a skipped message with template and sender", async () => {
    const skipped = {
      id: "01900000-0000-7000-8000-000000000099",
      status: "skipped",
      skipReason: "suppressed",
    } as Message
    const returning = vi.fn(async () => [skipped])
    const values = vi.fn(() => ({ returning }))
    const tx = {
      insert: vi.fn(() => ({ values })),
    } as unknown as EmailHubTx

    await expect(
      insertSkippedSendCheckMessage(tx, {
        recipientId: recipientRow.id,
        emailType: "thank_you",
        offerId: null,
        idempotencyKey: "key-1",
        templateVersionId: "tv-1",
        senderId: "snd-1",
        skipReason: "suppressed",
      })
    ).resolves.toBe(skipped)

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        skipReason: "suppressed",
        templateVersionId: "tv-1",
        senderId: "snd-1",
      })
    )
  })

  it("throws internal when insert returns no row", async () => {
    const returning = vi.fn(async () => [])
    const values = vi.fn(() => ({ returning }))
    const tx = {
      insert: vi.fn(() => ({ values })),
    } as unknown as EmailHubTx

    await expect(
      insertSkippedSendCheckMessage(tx, {
        recipientId: recipientRow.id,
        emailType: "thank_you",
        offerId: null,
        idempotencyKey: "key-1",
        templateVersionId: "tv-1",
        senderId: "snd-1",
        skipReason: "opted_out",
      })
    ).rejects.toMatchObject({ code: "internal" } satisfies Partial<AppError>)
  })
})
