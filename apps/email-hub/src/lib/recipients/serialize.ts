import type {
  EmailCategory,
  Message,
  Recipient,
  RecipientPreference,
} from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type RecipientLastMessageJson = {
  status: Message["status"]
  email_type: Message["emailType"]
  skip_reason: Message["skipReason"]
  failure_reason: string | null
  sent_at: string | null
  created_at: string
}

export type RecipientOfferJson = {
  id: string
  external_ref: string
  name: string
}

export type RecipientListItemJson = {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  status: Recipient["status"]
  tier: Recipient["tier"]
  tier_updated_at: string
  unsubscribed: boolean
  external_user_id: string | null
  created_at: string
  updated_at: string
  last_emailed_at: string | null
  last_message: RecipientLastMessageJson | null
  offer: RecipientOfferJson | null
}

export type RecipientPreferenceJson = {
  category_id: string
  category_key: string
  category_name: string
  kind: EmailCategory["kind"]
  opted_out: boolean
  source: RecipientPreference["source"] | null
  updated_at: string | null
}

export type RecipientMessageJson = {
  id: string
  email_type: Message["emailType"]
  status: Message["status"]
  skip_reason: Message["skipReason"]
  failure_reason: string | null
  template_name: string | null
  offer_id: string | null
  send_id: string | null
  queued_at: string | null
  sent_at: string | null
  created_at: string
}

export type RecipientDetailJson = RecipientListItemJson & {
  preferences: RecipientPreferenceJson[]
  messages: RecipientMessageJson[]
}

export function serializeRecipientLastMessage(
  row: Message
): RecipientLastMessageJson {
  return {
    status: row.status,
    email_type: row.emailType,
    skip_reason: row.skipReason,
    failure_reason: row.failureReason,
    sent_at: row.sentAt ? isoUtc(row.sentAt) : null,
    created_at: isoUtc(row.createdAt),
  }
}

export function serializeRecipientOffer(row: {
  id: string
  externalRef: string
  name: string
}): RecipientOfferJson {
  return {
    id: row.id,
    external_ref: row.externalRef,
    name: row.name,
  }
}

export function serializeRecipientListItem(
  row: Recipient,
  lastMessage: Message | null = null,
  extras?: {
    unsubscribed?: boolean
    offer?: RecipientOfferJson | null
  }
): RecipientListItemJson {
  return {
    id: row.id,
    email: row.email,
    first_name: row.firstName,
    last_name: row.lastName,
    status: row.status,
    tier: row.tier,
    tier_updated_at: isoUtc(row.tierUpdatedAt),
    unsubscribed: extras?.unsubscribed ?? false,
    external_user_id: row.externalUserId,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
    last_emailed_at: row.lastEmailedAt ? isoUtc(row.lastEmailedAt) : null,
    last_message: lastMessage
      ? serializeRecipientLastMessage(lastMessage)
      : null,
    offer: extras?.offer ?? null,
  }
}

export function serializeRecipientMessage(
  row: Message,
  templateName: string | null = null
): RecipientMessageJson {
  return {
    id: row.id,
    email_type: row.emailType,
    status: row.status,
    skip_reason: row.skipReason,
    failure_reason: row.failureReason,
    template_name: templateName,
    offer_id: row.offerId,
    send_id: row.sendId,
    queued_at: row.queuedAt ? isoUtc(row.queuedAt) : null,
    sent_at: row.sentAt ? isoUtc(row.sentAt) : null,
    created_at: isoUtc(row.createdAt),
  }
}

export function serializeRecipientPreference(input: {
  category: EmailCategory
  preference: RecipientPreference | null
}): RecipientPreferenceJson {
  const { category, preference } = input
  return {
    category_id: category.id,
    category_key: category.key,
    category_name: category.name,
    kind: category.kind,
    opted_out: preference ? preference.optedOut : !category.defaultOptedIn,
    source: preference ? preference.source : null,
    updated_at: preference ? isoUtc(preference.updatedAt) : null,
  }
}
