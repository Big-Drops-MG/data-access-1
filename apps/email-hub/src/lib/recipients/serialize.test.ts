import { describe, expect, it } from "vitest"

import type {
  EmailCategory,
  Message,
  Recipient,
  RecipientPreference,
} from "@workspace/db"

import {
  serializeRecipientLastMessage,
  serializeRecipientListItem,
  serializeRecipientMessage,
  serializeRecipientOffer,
  serializeRecipientPreference,
} from "./serialize"

const at = new Date("2026-10-08T17:58:00.000Z")
const earlier = new Date("2026-10-08T17:57:58.000Z")

function recipient(overrides: Partial<Recipient> = {}): Recipient {
  return {
    id: "019a0000-0000-7000-8000-0000000000aa",
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

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "019a0000-0000-7000-8000-0000000000bb",
    sendId: "019a0000-0000-7000-8000-0000000000cc",
    recipientId: recipient().id,
    offerId: "019a0000-0000-7000-8000-0000000000dd",
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

function category(overrides: Partial<EmailCategory> = {}): EmailCategory {
  return {
    id: "019a0000-0000-7000-8000-000000000111",
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

describe("recipient serializers", () => {
  it("maps a list row with its last message, offer, and unsubscribe flag", () => {
    expect(
      serializeRecipientListItem(recipient(), message(), {
        unsubscribed: true,
        offer: {
          id: "019a0000-0000-7000-8000-0000000000dd",
          external_ref: "OFR-1042",
          name: "Auto Insurance",
        },
      })
    ).toEqual({
      id: recipient().id,
      email: "maria.lopez@example.com",
      first_name: "Maria",
      last_name: "Lopez",
      status: "active",
      tier: "premium",
      tier_updated_at: at.toISOString(),
      unsubscribed: true,
      external_user_id: "ext-1",
      created_at: at.toISOString(),
      updated_at: at.toISOString(),
      last_emailed_at: at.toISOString(),
      last_message: {
        status: "delivered",
        email_type: "thank_you",
        skip_reason: null,
        failure_reason: null,
        sent_at: at.toISOString(),
        created_at: at.toISOString(),
      },
      offer: {
        id: "019a0000-0000-7000-8000-0000000000dd",
        external_ref: "OFR-1042",
        name: "Auto Insurance",
      },
    })
  })

  it("defaults optional list fields when there is no message or offer", () => {
    expect(
      serializeRecipientListItem(
        recipient({
          firstName: null,
          lastName: null,
          externalUserId: null,
          lastEmailedAt: null,
        })
      )
    ).toMatchObject({
      first_name: null,
      last_name: null,
      external_user_id: null,
      last_emailed_at: null,
      unsubscribed: false,
      last_message: null,
      offer: null,
    })
  })

  it("leaves sent_at empty when the last message has not been sent", () => {
    expect(
      serializeRecipientLastMessage(message({ sentAt: null, status: "queued" }))
    ).toMatchObject({
      status: "queued",
      sent_at: null,
    })
  })

  it("maps an offer row to the list code", () => {
    expect(
      serializeRecipientOffer({
        id: "019a0000-0000-7000-8000-0000000000dd",
        externalRef: "OFR-1042",
        name: "Auto Insurance",
      })
    ).toEqual({
      id: "019a0000-0000-7000-8000-0000000000dd",
      external_ref: "OFR-1042",
      name: "Auto Insurance",
    })
  })

  it("includes the template name and drops empty timestamps", () => {
    expect(
      serializeRecipientMessage(
        message({ queuedAt: null, sentAt: null, offerId: null, sendId: null }),
        "Thank you · Auto Insurance v2"
      )
    ).toMatchObject({
      template_name: "Thank you · Auto Insurance v2",
      offer_id: null,
      send_id: null,
      queued_at: null,
      sent_at: null,
    })
  })

  it("uses the stored preference when one exists", () => {
    const preference: RecipientPreference = {
      id: "019a0000-0000-7000-8000-000000000222",
      recipientId: recipient().id,
      categoryId: category().id,
      optedOut: true,
      source: "unsubscribe_link",
      createdAt: at,
      updatedAt: at,
    }
    expect(
      serializeRecipientPreference({ category: category(), preference })
    ).toEqual({
      category_id: category().id,
      category_key: "engagement",
      category_name: "Engagement",
      kind: "relationship",
      opted_out: true,
      source: "unsubscribe_link",
      updated_at: at.toISOString(),
    })
  })

  it("falls back to the category default when no preference row exists", () => {
    expect(
      serializeRecipientPreference({
        category: category({ defaultOptedIn: false }),
        preference: null,
      })
    ).toMatchObject({
      opted_out: true,
      source: null,
      updated_at: null,
    })
  })
})
