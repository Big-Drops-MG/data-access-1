import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, it, vi } from "vitest"

const info = vi.hoisted(() => vi.fn())
const insertEmailEvents = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("@workspace/logger", () => ({
  getContextLogger: () => ({ info }),
}))

vi.mock("@workspace/db/clickhouse", () => ({
  insertEmailEvents,
}))

import {
  defaultLookupMessageContext,
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

  it("rejects a payload that has no sns message id or record list", async () => {
    await expect(
      processEventsJob(null as never, { db: {} as never })
    ).rejects.toBeInstanceOf(UnrecoverableError)
    await expect(
      processEventsJob(
        { sns_message_id: "", records: [{ ...deliveredRecord("ses-1") }] },
        { db: {} as never }
      )
    ).rejects.toBeInstanceOf(UnrecoverableError)
    await expect(
      processEventsJob(
        { sns_message_id: "sns-1", records: null as never },
        { db: {} as never }
      )
    ).rejects.toBeInstanceOf(UnrecoverableError)
  })

  it("fills domains and optional columns from the fallbacks", async () => {
    const insertEvents = vi.fn(async () => undefined)
    const occurredAt = Date.parse("2026-11-03T12:00:00.000Z")

    await processEventsJob(
      {
        sns_message_id: "sns-2",
        workspace_id: "ws-1",
        records: [
          {
            event_type: "bounce_hard",
            event_time: new Date(occurredAt) as unknown as string,
            ses_message_id: "ses-2",
            recipient_emails: ["person@other.example"],
            bounce_type: "Permanent",
            bounce_subtype: "General",
            smtp_status: "5.1.1",
            smtp_diagnostic: "user unknown",
            delay_type: "MailboxFull",
            complaint_type: "abuse",
            link_url: "https://example.com/a",
            user_agent: "Outlook",
            raw_payload: '{"eventType":"Bounce"}',
          },
          {
            ...deliveredRecord("ses-2"),
            event_time: occurredAt as unknown as string,
          },
        ],
      },
      {
        db: {} as never,
        lookupMessageContext: async (ids) => {
          expect(ids).toEqual(["ses-2"])
          return new Map([
            [
              "ses-2",
              {
                ...context,
                sendingDomain: "",
                recipientEmail: "",
                templateVersionId: null,
                senderId: null,
              },
            ],
          ])
        },
        insertEvents,
        now: () => occurredAt - 1_000,
      }
    )

    const rows = insertEvents.mock.calls[0]?.[0] as Array<
      Record<string, unknown>
    >
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual(
      expect.objectContaining({
        event_id: expect.any(String),
        sending_domain: "mail.example.com",
        recipient_domain: "other.example",
        template_version_id: "00000000-0000-0000-0000-000000000000",
        sender_id: "00000000-0000-0000-0000-000000000000",
        bounce_type: "Permanent",
        bounce_subtype: "General",
        smtp_status: "5.1.1",
        smtp_diagnostic: "user unknown",
        delay_type: "MailboxFull",
        complaint_type: "abuse",
        link_url: "https://example.com/a",
        user_agent: "Outlook",
        raw_payload: '{"eventType":"Bounce"}',
        event_time: "2026-11-03 12:00:00.000",
      })
    )
    expect(rows[1]?.event_time).toBe("2026-11-03 12:00:00.000")
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        workspace_id: "ws-1",
        inserted_count: 2,
        lag_ms: 0,
      }),
      "Events inserted"
    )
  })

  it("uses empty domains and the acknowledged time when nothing can be parsed", async () => {
    const insertEvents = vi.fn(async () => undefined)
    const acknowledgedAt = Date.parse("2026-11-03T12:00:00.000Z")

    await processEventsJob(
      {
        sns_message_id: "sns-3",
        records: [
          {
            event_id: "",
            event_type: "delivered",
            event_time: "not-a-time",
            ses_message_id: "ses-3",
          },
        ],
      },
      {
        db: {} as never,
        lookupMessageContext: async () =>
          new Map([
            [
              "ses-3",
              {
                ...context,
                sendingDomain: null,
                senderFromEmail: null,
                recipientEmail: null,
              },
            ],
          ]),
        insertEvents,
        now: () => acknowledgedAt,
      }
    )

    expect(insertEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        event_id: expect.any(String),
        sending_domain: "",
        recipient_domain: "",
        bounce_type: "",
        user_agent: "",
        raw_payload: "{}",
      }),
    ])
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ lag_ms: 0, inserted_count: 1 }),
      "Events inserted"
    )
  })

  it("ignores a blank ses id when looking up and still fails that record", async () => {
    const lookupMessageContext = vi.fn(
      async () => new Map([["ses-1", context]])
    )

    await expect(
      processEventsJob(
        {
          sns_message_id: "sns-4",
          records: [deliveredRecord("ses-1"), deliveredRecord("")],
        },
        { db: {} as never, lookupMessageContext }
      )
    ).rejects.toThrow(/ses_message_id: $/)
    expect(lookupMessageContext).toHaveBeenCalledWith(["ses-1"])
  })

  it("inserts through ClickHouse when no insert function is injected", async () => {
    insertEmailEvents.mockClear()

    await processEventsJob(
      {
        sns_message_id: "sns-5",
        records: [deliveredRecord("ses-1")],
      },
      {
        db: {} as never,
        lookupMessageContext: async () => new Map([["ses-1", context]]),
      }
    )

    expect(insertEmailEvents).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ lag_ms: expect.any(Number) }),
      "Events inserted"
    )
  })
})

describe("defaultLookupMessageContext", () => {
  it("does not query when there are no ses ids", async () => {
    const db = { select: vi.fn() }

    await expect(defaultLookupMessageContext(db as never, [])).resolves.toEqual(
      new Map()
    )
    expect(db.select).not.toHaveBeenCalled()
  })

  it("maps rows that have an ses id and skips the rest", async () => {
    const where = vi.fn(async () => [
      { ...context, sesMessageId: null },
      {
        sesMessageId: "ses-9",
        messageId: context.messageId,
        sendId: "send-9",
        recipientId: context.recipientId,
        offerId: null,
        emailType: "engagement",
        templateVersionId: null,
        senderId: null,
        sendingDomain: "mail.example.com",
        senderFromEmail: "news@mail.example.com",
        recipientEmail: "person@inbox.example",
      },
    ])
    const chain = {
      from: vi.fn(),
      leftJoin: vi.fn(),
      where,
    }
    chain.from.mockReturnValue(chain)
    chain.leftJoin.mockReturnValue(chain)
    const db = { select: vi.fn(() => chain) }

    const found = await defaultLookupMessageContext(db as never, ["ses-9"])

    expect(found.size).toBe(1)
    expect(found.get("ses-9")).toEqual({
      messageId: context.messageId,
      sendId: "send-9",
      recipientId: context.recipientId,
      offerId: null,
      emailType: "engagement",
      templateVersionId: null,
      senderId: null,
      sendingDomain: "mail.example.com",
      senderFromEmail: "news@mail.example.com",
      recipientEmail: "person@inbox.example",
    })
  })
})

function deliveredRecord(sesMessageId: string) {
  return {
    event_id: "evt-1",
    event_type: "delivered" as const,
    event_time: "2026-11-03T12:00:00.000Z",
    ses_message_id: sesMessageId,
  }
}
