import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, it, vi } from "vitest"

const info = vi.hoisted(() => vi.fn())

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({ info }),
}))

import {
  processEventsJob,
  type EnrichedMessageContext,
} from "./events-writer.js"

const context: EnrichedMessageContext = {
  messageId: "019a0000-0000-7000-8000-000000000001",
  sendId: null,
  recipientId: "019a0000-0000-7000-8000-000000000002",
  offerId: "019a0000-0000-7000-8000-000000000003",
  emailType: "thank_you",
  templateVersionId: "019a0000-0000-7000-8000-000000000004",
  senderId: "019a0000-0000-7000-8000-000000000005",
  sendingDomain: "mail.example.com",
  senderFromEmail: "news@mail.example.com",
  recipientEmail: "person@inbox.example",
}

describe("processEventsJob", () => {
  beforeEach(() => {
    info.mockReset()
  })

  it("enriches domain, offer, template, and environment, then logs lag", async () => {
    const insertEvents = vi.fn(async () => undefined)
    const occurredAt = Date.parse("2026-11-03T12:00:00.000Z")

    await processEventsJob(
      {
        sns_message_id: "sns-1",
        records: [
          {
            event_id: "evt-1",
            event_type: "delivered",
            event_time: "2026-11-03T12:00:00.000Z",
            ses_message_id: "ses-1",
            recipient_emails: ["person@other.example"],
            user_agent:
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) GoogleImageProxy",
            raw_payload: "{}",
          },
        ],
      },
      {
        db: {} as never,
        lookupMessageContext: async () => new Map([["ses-1", context]]),
        insertEvents,
        now: () => occurredAt + 2_500,
      }
    )

    expect(insertEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        sending_domain: "mail.example.com",
        recipient_domain: "inbox.example",
        offer_id: context.offerId,
        template_version_id: context.templateVersionId,
        client: "Gmail",
        device_type: "desktop",
        os: "Windows",
        is_machine: 1,
        machine_reason: "google_proxy",
      }),
    ])
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "events.inserted",
        sns_message_id: "sns-1",
        job_id: "sns-1",
        message_id: context.messageId,
        inserted_count: 1,
        lag_ms: 2_500,
      }),
      "Events inserted"
    )
  })

  it("retries when the message row is not visible yet", async () => {
    await expect(
      processEventsJob(
        {
          sns_message_id: "sns-1",
          records: [
            {
              event_id: "evt-1",
              event_type: "sent",
              event_time: "2026-11-03T12:00:00.000Z",
              ses_message_id: "missing",
            },
          ],
        },
        {
          db: {} as never,
          lookupMessageContext: async () => new Map(),
          insertEvents: vi.fn(),
        }
      )
    ).rejects.toThrow(/Message context not found/)
  })

  it("does not retry a payload with no records", async () => {
    await expect(
      processEventsJob(
        { sns_message_id: "sns-1", records: [] },
        { db: {} as never }
      )
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })
})
