import { beforeEach, describe, expect, it, vi } from "vitest"

const findOrCreateRecipient = vi.hoisted(() => vi.fn())
const triggerEmail = vi.hoisted(() => vi.fn())
const recordIntegrationResult = vi.hoisted(() => vi.fn())

vi.mock("./trigger-email.js", () => ({
  findOrCreateRecipient,
  triggerEmail,
}))

vi.mock("./integration-sync-state.js", async () => {
  const actual = await vi.importActual("./integration-sync-state.js")
  return { ...(actual as object), recordIntegrationResult }
})

import {
  AROHAA_WEBHOOK_INTEGRATION_NAME,
  processArohaaTierSyncJob,
} from "./arohaa-tier-sync.js"

const RECIPIENT_ID = "019a0000-0000-7000-8000-0000000000aa"
const MESSAGE_ID = "019a0000-0000-7000-8000-0000000000bb"

function recipient(tier: "standard" | "premium") {
  return {
    id: RECIPIENT_ID,
    email: "jane@example.com",
    emailHash: "hash",
    externalUserId: null,
    tier,
    tierUpdatedAt: new Date("2026-01-01T00:00:00.000Z"),
    status: "active" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastEmailedAt: null,
  }
}

describe("processArohaaTierSyncJob", () => {
  const enqueueSendEmail = vi.fn(async () => undefined)
  const returning = vi.fn()
  const where = vi.fn(() => ({ returning }))
  const set = vi.fn(() => ({ where }))
  const update = vi.fn(() => ({ set }))
  const db = { update } as never

  beforeEach(() => {
    findOrCreateRecipient.mockReset()
    triggerEmail.mockReset()
    enqueueSendEmail.mockReset()
    recordIntegrationResult.mockReset()
    recordIntegrationResult.mockResolvedValue({})
    returning.mockReset()
    where.mockClear()
    set.mockClear()
    update.mockClear()
  })

  it("exits when tier is unchanged", async () => {
    findOrCreateRecipient.mockResolvedValue(recipient("premium"))

    const result = await processArohaaTierSyncJob(
      {
        arohaa_event_id: "evt_1",
        email: "Jane@Example.com",
        tier: "premium",
        occurred_at: "2026-10-07T14:00:00.000Z",
      },
      { db, enqueueSendEmail }
    )

    expect(result.kind).toBe("unchanged")
    expect(update).not.toHaveBeenCalled()
    expect(triggerEmail).not.toHaveBeenCalled()
    expect(recordIntegrationResult).toHaveBeenCalledWith(db, {
      name: AROHAA_WEBHOOK_INTEGRATION_NAME,
      ok: true,
    })
  })

  it("updates tier and triggers feedback_request on premium promotion", async () => {
    findOrCreateRecipient.mockResolvedValue(recipient("standard"))
    returning.mockResolvedValue([recipient("premium")])
    triggerEmail.mockResolvedValue({
      message: { id: MESSAGE_ID, status: "queued" },
      recipient: recipient("premium"),
      created: true,
    })

    const result = await processArohaaTierSyncJob(
      {
        arohaa_event_id: "evt_2",
        email: "jane@example.com",
        tier: "premium",
        previous_tier: "standard",
        occurred_at: "2026-10-07T14:00:00.000Z",
      },
      { db, enqueueSendEmail }
    )

    expect(result.kind).toBe("updated")
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: "premium",
        tierUpdatedAt: new Date("2026-10-07T14:00:00.000Z"),
      })
    )
    expect(triggerEmail).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        email: "jane@example.com",
        emailType: "feedback_request",
        idempotencyKey: "tier-evt_2",
        offerId: null,
      }),
      { enqueueSendEmail }
    )
    expect(recordIntegrationResult).toHaveBeenCalledWith(db, {
      name: AROHAA_WEBHOOK_INTEGRATION_NAME,
      ok: true,
    })
  })

  it("updates tier without email on demotion", async () => {
    findOrCreateRecipient.mockResolvedValue(recipient("premium"))
    returning.mockResolvedValue([recipient("standard")])

    const result = await processArohaaTierSyncJob(
      {
        arohaa_event_id: "evt_3",
        email: "jane@example.com",
        tier: "standard",
        occurred_at: "2026-10-07T14:00:00.000Z",
      },
      { db, enqueueSendEmail }
    )

    expect(result).toMatchObject({
      kind: "updated",
      previousTier: "premium",
      recipient: { id: RECIPIENT_ID, tier: "standard" },
    })
    expect(Object.hasOwn(result, "email")).toBe(false)
    expect(triggerEmail).not.toHaveBeenCalled()
    expect(recordIntegrationResult).toHaveBeenCalledWith(db, {
      name: AROHAA_WEBHOOK_INTEGRATION_NAME,
      ok: true,
    })
  })

  it("records integration failure and rethrows", async () => {
    findOrCreateRecipient.mockRejectedValue(new Error("db down"))

    await expect(
      processArohaaTierSyncJob(
        {
          arohaa_event_id: "evt_4",
          email: "jane@example.com",
          tier: "premium",
          occurred_at: "2026-10-07T14:00:00.000Z",
        },
        { db, enqueueSendEmail }
      )
    ).rejects.toThrow("db down")

    expect(recordIntegrationResult).toHaveBeenCalledWith(db, {
      name: AROHAA_WEBHOOK_INTEGRATION_NAME,
      ok: false,
      error: "db down",
    })
  })
})
