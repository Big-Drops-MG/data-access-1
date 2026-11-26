import { describe, expect, it, vi } from "vitest"

import type {
  EmailCategory,
  Message,
  Recipient,
  RecipientPreference,
} from "@workspace/db"
import {
  emailCategory,
  message,
  recipient,
  recipientPreference,
} from "@workspace/db"
import type { Database } from "@workspace/db/client"
import type * as Drizzle from "drizzle-orm"

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof Drizzle
  return {
    ...actual,
    exists: () => actual.sql`true`,
  }
})

import { getRecipientDetail, listRecipients } from "./service"

const at = new Date("2026-10-08T17:58:00.000Z")
const earlier = new Date("2026-10-08T17:57:58.000Z")
const recipientId = "019a0000-0000-7000-8000-0000000000aa"
const otherRecipientId = "019a0000-0000-7000-8000-0000000000ab"
const offerId = "019a0000-0000-7000-8000-0000000000dd"
const categoryId = "019a0000-0000-7000-8000-000000000111"

function recipientRow(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: recipientId,
    email: "maria.lopez@example.com",
    emailHash: "hash",
    firstName: "Maria",
    lastName: "Lopez",
    externalUserId: "ext-1",
    tier: "premium",
    tierUpdatedAt: at,
    status: "active",
    createdAt: at,
    updatedAt: at,
    lastEmailedAt: at,
    ...overrides,
  }
}

function messageRow(overrides: Partial<Message> = {}): Message {
  return {
    id: "019a0000-0000-7000-8000-0000000000bb",
    sendId: "019a0000-0000-7000-8000-0000000000cc",
    recipientId,
    offerId,
    emailType: "thank_you",
    templateVersionId: "019a0000-0000-7000-8000-0000000000ee",
    senderId: "019a0000-0000-7000-8000-0000000000ff",
    idempotencyKey: "thank-you-maria",
    environment: "production",
    mergeData: {},
    status: "delivered",
    skipReason: null,
    failureReason: null,
    sesMessageId: null,
    queuedAt: earlier,
    sentAt: at,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  }
}

function categoryRow(overrides: Partial<EmailCategory> = {}): EmailCategory {
  return {
    id: categoryId,
    key: "engagement",
    name: "Engagement",
    description: "Monthly updates",
    kind: "relationship",
    defaultOptedIn: true,
    isActive: true,
    createdBy: null,
    createdAt: at,
    updatedAt: at,
    ...overrides,
  }
}

function preferenceRow(
  overrides: Partial<RecipientPreference> = {}
): RecipientPreference {
  return {
    id: "019a0000-0000-7000-8000-000000000222",
    recipientId,
    categoryId,
    optedOut: true,
    source: "unsubscribe_link",
    createdAt: at,
    updatedAt: at,
    ...overrides,
  }
}

type QueryHandlers = {
  list?: unknown[]
  statusRows?: { status: string; total: number }[]
  unsubscribedTotal?: number
  messages?: Message[]
  unsubscribedIds?: { recipientId: string }[]
  offers?: { id: string; externalRef: string; name: string }[]
  detailRecipient?: unknown[]
  categories?: unknown[]
  preferences?: unknown[]
  detailMessages?: { message: Message; templateName: string | null }[]
  categoryLookup?: { id: string }[]
}

function createDb(handlers: QueryHandlers): Database {
  return {
    select(fields?: Record<string, unknown>) {
      const keys = fields ? Object.keys(fields) : []
      let result: unknown[] = []
      if (keys.includes("recipient")) {
        result = handlers.list ?? []
      } else if (keys.includes("status")) {
        result = handlers.statusRows ?? []
      } else if (keys.length === 1 && keys[0] === "total") {
        result =
          handlers.unsubscribedTotal == null
            ? []
            : [{ total: handlers.unsubscribedTotal }]
      } else if (keys.includes("recipientId")) {
        result = handlers.unsubscribedIds ?? []
      } else if (keys.includes("externalRef")) {
        result = handlers.offers ?? []
      } else if (keys.includes("templateName") || keys.includes("message")) {
        result = handlers.detailMessages ?? []
      } else if (keys.length === 1 && keys[0] === "id") {
        result = handlers.categoryLookup ?? []
      }

      const state = { result }
      const chain = {
        from(table: unknown) {
          if (!fields) {
            if (table === message) state.result = handlers.messages ?? []
            else if (table === emailCategory) {
              state.result = handlers.categories ?? []
            } else if (table === recipientPreference) {
              state.result = handlers.preferences ?? []
            } else if (table === recipient) {
              state.result = handlers.detailRecipient ?? []
            }
          }
          return chain
        },
        innerJoin() {
          return chain
        },
        leftJoin() {
          return chain
        },
        where() {
          return chain
        },
        orderBy() {
          return chain
        },
        groupBy() {
          return chain
        },
        limit(count?: number) {
          return Promise.resolve(
            count == null ? state.result : state.result.slice(0, count)
          )
        },
        then(
          onFulfilled: (value: unknown[]) => unknown,
          onRejected?: (reason: unknown) => unknown
        ) {
          return Promise.resolve(state.result).then(onFulfilled, onRejected)
        },
      }
      return chain
    },
  } as unknown as Database
}

describe("listRecipients", () => {
  it("maps the page, last offer, and unsubscribe flag", async () => {
    const older = messageRow({
      id: "019a0000-0000-7000-8000-0000000000b0",
      createdAt: earlier,
    })
    const latest = messageRow()
    const second = recipientRow({ id: otherRecipientId })
    const db = createDb({
      list: [{ recipient: recipientRow() }, { recipient: second }],
      statusRows: [
        { status: "active", total: 2 },
        { status: "bounced", total: 0 },
      ],
      unsubscribedTotal: 4,
      messages: [latest, older, messageRow({ recipientId: otherRecipientId })],
      unsubscribedIds: [{ recipientId }],
      offers: [
        { id: offerId, externalRef: "OFR-1042", name: "Auto Insurance" },
      ],
    })

    const page = await listRecipients({ limit: 1 }, db)

    expect(page.next_cursor).toBe(recipientId)
    expect(page.status_counts).toEqual({
      all: 2,
      active: 2,
      bounced: 0,
      unsubscribed: 4,
    })
    expect(page.data).toHaveLength(1)
    expect(page.data[0]).toMatchObject({
      id: recipientId,
      unsubscribed: true,
      offer: {
        id: offerId,
        external_ref: "OFR-1042",
        name: "Auto Insurance",
      },
      last_message: { status: "delivered" },
    })
  })

  it("returns an empty page when no recipients match", async () => {
    const page = await listRecipients(
      { limit: 25 },
      createDb({
        list: [],
        statusRows: [],
      })
    )

    expect(page).toEqual({
      data: [],
      next_cursor: null,
      status_counts: {
        all: 0,
        active: 0,
        bounced: 0,
        unsubscribed: 0,
      },
    })
  })

  it("applies list filters and the preference join", async () => {
    const row = recipientRow()
    const page = await listRecipients(
      {
        limit: 25,
        email: " Maria.Lopez@example.com ",
        status: "active",
        unsubscribed: true,
        offerId,
        cursor: "019a0000-0000-7000-8000-0000000000ff",
        optedOutCategoryId: categoryId,
      },
      createDb({
        categoryLookup: [{ id: categoryId }],
        list: [{ recipient: row }],
        statusRows: [{ status: "active", total: 1 }],
        unsubscribedTotal: 1,
        messages: [messageRow()],
        unsubscribedIds: [],
        offers: [],
      })
    )

    expect(page.data[0]).toMatchObject({
      id: recipientId,
      unsubscribed: false,
      offer: null,
      last_message: { status: "delivered" },
    })
    expect(page.next_cursor).toBeNull()
  })

  it("rejects an unknown opted-out category", async () => {
    await expect(
      listRecipients(
        { limit: 25, optedOutCategoryId: categoryId },
        createDb({ categoryLookup: [] })
      )
    ).rejects.toMatchObject({
      code: "validation_failed",
      details: [{ path: "opted_out_category_id" }],
    })
  })
})

describe("getRecipientDetail", () => {
  it("returns messages, the last offer, and category preferences", async () => {
    const otherCategory = categoryRow({
      id: "019a0000-0000-7000-8000-000000000112",
      key: "feedback_request",
      name: "Feedback requests",
      defaultOptedIn: false,
    })
    const detail = await getRecipientDetail(
      recipientId,
      createDb({
        detailRecipient: [recipientRow()],
        categories: [categoryRow(), otherCategory],
        preferences: [preferenceRow()],
        detailMessages: [
          {
            message: messageRow(),
            templateName: "Thank you · Auto Insurance v2",
          },
          {
            message: messageRow({
              id: "019a0000-0000-7000-8000-0000000000b0",
              offerId: null,
              templateVersionId: null,
            }),
            templateName: null,
          },
        ],
        offers: [
          { id: offerId, externalRef: "OFR-1042", name: "Auto Insurance" },
        ],
      })
    )

    expect(detail).toMatchObject({
      id: recipientId,
      unsubscribed: true,
      offer: { external_ref: "OFR-1042" },
      messages: [
        { template_name: "Thank you · Auto Insurance v2" },
        { template_name: null, offer_id: null },
      ],
    })
    expect(detail.preferences).toEqual([
      expect.objectContaining({
        category_key: "engagement",
        opted_out: true,
        source: "unsubscribe_link",
      }),
      expect.objectContaining({
        category_key: "feedback_request",
        opted_out: true,
        source: null,
      }),
    ])
  })

  it("leaves the offer empty when the last message has none", async () => {
    const detail = await getRecipientDetail(
      recipientId,
      createDb({
        detailRecipient: [recipientRow()],
        categories: [],
        preferences: [],
        detailMessages: [
          { message: messageRow({ offerId: null }), templateName: null },
        ],
        offers: [
          { id: offerId, externalRef: "OFR-1042", name: "Auto Insurance" },
        ],
      })
    )

    expect(detail.offer).toBeNull()
    expect(detail.unsubscribed).toBe(false)
    expect(detail.preferences).toEqual([])
  })

  it("leaves the offer empty when the offer row is missing", async () => {
    const detail = await getRecipientDetail(
      recipientId,
      createDb({
        detailRecipient: [recipientRow()],
        categories: [],
        preferences: [],
        detailMessages: [{ message: messageRow(), templateName: null }],
        offers: [],
      })
    )

    expect(detail.offer).toBeNull()
  })

  it("throws when the recipient does not exist", async () => {
    await expect(
      getRecipientDetail(recipientId, createDb({ detailRecipient: [] }))
    ).rejects.toMatchObject({
      code: "not_found",
      details: [{ path: "id", message: "Recipient not found" }],
    })
  })
})
