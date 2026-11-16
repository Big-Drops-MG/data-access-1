import type {
  EmailCategory,
  Message,
  Recipient,
  RecipientPreference,
} from "@workspace/db"

function isoUtc(value: Date): string {
  return value.toISOString()
}

export type RecipientListItemJson = {
  id: string
  email: string
  status: Recipient["status"]
  tier: Recipient["tier"]
  external_user_id: string | null
  created_at: string
  updated_at: string
  last_emailed_at: string | null
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

export function serializeRecipientListItem(
  row: Recipient
): RecipientListItemJson {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    tier: row.tier,
    external_user_id: row.externalUserId,
    created_at: isoUtc(row.createdAt),
    updated_at: isoUtc(row.updatedAt),
    last_emailed_at: row.lastEmailedAt ? isoUtc(row.lastEmailedAt) : null,
  }
}

export function serializeRecipientMessage(row: Message): RecipientMessageJson {
  return {
    id: row.id,
    email_type: row.emailType,
    status: row.status,
    skip_reason: row.skipReason,
    failure_reason: row.failureReason,
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
