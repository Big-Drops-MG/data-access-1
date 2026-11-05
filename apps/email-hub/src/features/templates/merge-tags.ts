import { extractMergeTagNames } from "@workspace/shared"

import type { EmailType } from "@/features/templates/api"

export const CATALOG_MERGE_TAGS = [
  "first_name",
  "offer_name",
  "cta_url",
  "postal_address",
  "unsubscribe_url",
  "tier_label",
] as const

export type CatalogMergeTag = (typeof CATALOG_MERGE_TAGS)[number]

/** Tags required in the body for relationship (engagement) emails. */
export const ENGAGEMENT_REQUIRED_TAGS = [
  "postal_address",
  "unsubscribe_url",
] as const

/** Tags that have no send-time value for engagement. */
export const ENGAGEMENT_UNSUPPORTED_TAGS = ["tier_label"] as const

export type MergeTagTone = "available" | "required" | "unsupported" | "unused"

export type MergeTagChip = {
  name: string
  tone: MergeTagTone
  hint?: string
}

export function tagsInSource(subject: string, body: string): Set<string> {
  return new Set(extractMergeTagNames(subject, body))
}

export function buildMergeTagChips(
  emailType: EmailType | "" | undefined,
  subject: string,
  body: string
): MergeTagChip[] {
  const used = tagsInSource(subject, body)
  const chips: MergeTagChip[] = []

  for (const name of CATALOG_MERGE_TAGS) {
    const inSource = used.has(name)
    if (emailType === "engagement" && name === "tier_label") {
      if (inSource) {
        chips.push({
          name,
          tone: "unsupported",
          hint: "Not sent for engagement emails.",
        })
      }
      continue
    }
    if (
      emailType === "engagement" &&
      (ENGAGEMENT_REQUIRED_TAGS as readonly string[]).includes(name)
    ) {
      chips.push({
        name,
        tone: inSource ? "required" : "unused",
        hint: inSource ? undefined : "Required for engagement emails.",
      })
      continue
    }
    if (inSource) {
      chips.push({ name, tone: "available" })
    }
  }

  for (const name of used) {
    if (!(CATALOG_MERGE_TAGS as readonly string[]).includes(name)) {
      chips.push({ name, tone: "available" })
    }
  }

  return chips
}

export function engagementComplianceMessage(
  emailType: EmailType | "" | undefined,
  body: string
): string | null {
  if (emailType !== "engagement") {
    return null
  }
  const bodyTags = new Set(extractMergeTagNames(body))
  const missing = ENGAGEMENT_REQUIRED_TAGS.filter((tag) => !bodyTags.has(tag))
  if (missing.length === 0) {
    return null
  }
  return "Engagement emails must include a postal address and an unsubscribe link."
}

export function publishBlockMessage(
  emailType: EmailType | "" | undefined,
  subject: string,
  body: string
): string | null {
  if (emailType !== "engagement") {
    return null
  }
  const used = tagsInSource(subject, body)
  if (used.has("tier_label")) {
    return "{{tier_label}} has no value for engagement emails. Remove it or use a feedback-request template. Publishing is blocked until it's fixed."
  }
  const bodyTags = new Set(extractMergeTagNames(body))
  for (const tag of ENGAGEMENT_REQUIRED_TAGS) {
    if (!bodyTags.has(tag)) {
      return `Add {{${tag}}} to the HTML source before publishing engagement emails.`
    }
  }
  return null
}

export const PREVIEW_SAMPLE_MERGE: Record<string, string> = {
  first_name: "Maria",
  offer_name: "Sample offer",
  cta_url: "https://example.com/preview/cta",
  postal_address: "123 Preview Street, Sample City, ST 00000",
  unsubscribe_url: "https://example.com/preview/unsubscribe",
  tier_label: "Premium",
}
