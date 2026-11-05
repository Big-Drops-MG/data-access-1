import { z } from "zod"

import type {
  CreateSendInput,
  OfferOption,
  SenderRow,
  SendListItem,
  TemplateRow,
} from "@/features/sends/api"

export const ALL_OFFERS_VALUE = "all"
export const SEND_MIN_LEAD_MS = 5 * 60 * 1000
const FIVE_MINUTES_MS = 5 * 60 * 1000

export const sendFormSchema = z
  .object({
    name: z.string().trim().min(1, "Send name is required").max(200),
    template_version_id: z.string().uuid("Select a published template"),
    category_id: z.string().uuid("Select a published template"),
    sender_id: z.string().uuid("Select a sender"),
    offer_id: z.string().min(1),
    scheduled_for: z.iso.datetime("Pick a date and time"),
  })
  .strict()

export type SendFormValues = z.output<typeof sendFormSchema>

export type TemplateOption = {
  versionId: string
  label: string
  categoryId: string
  categoryName: string
}

export type SelectOption = {
  value: string
  label: string
}

export function defaultScheduledFor(now: Date = new Date()): string {
  const target = now.getTime() + 60 * 60 * 1000
  const rounded = Math.ceil(target / FIVE_MINUTES_MS) * FIVE_MINUTES_MS
  return new Date(rounded).toISOString()
}

export function isScheduleLeadValid(
  scheduledFor: string,
  now: Date = new Date()
): boolean {
  const ms = new Date(scheduledFor).getTime()
  return !Number.isNaN(ms) && ms >= now.getTime() + SEND_MIN_LEAD_MS
}

export function sendFormDefaults(
  initial: SendListItem | undefined,
  now: Date = new Date()
): SendFormValues {
  if (!initial) {
    return {
      name: "",
      template_version_id: "",
      category_id: "",
      sender_id: "",
      offer_id: ALL_OFFERS_VALUE,
      scheduled_for: defaultScheduledFor(now),
    }
  }
  return {
    name: initial.name,
    template_version_id: initial.template_version_id,
    category_id: initial.category_id,
    sender_id: initial.sender_id,
    offer_id: initial.offer_id ?? ALL_OFFERS_VALUE,
    scheduled_for: initial.scheduled_for,
  }
}

export function toSendPayload(values: SendFormValues): CreateSendInput {
  return {
    name: values.name.trim(),
    template_version_id: values.template_version_id,
    sender_id: values.sender_id,
    category_id: values.category_id,
    offer_id: values.offer_id === ALL_OFFERS_VALUE ? null : values.offer_id,
    scheduled_for: values.scheduled_for,
  }
}

export function buildTemplateOptions(
  templates: TemplateRow[],
  initial?: SendListItem
): TemplateOption[] {
  const options = templates.flatMap((template) =>
    template.current_version_id
      ? [
          {
            versionId: template.current_version_id,
            label: `${template.name} · v${template.current_version_no ?? 1}`,
            categoryId: template.category_id,
            categoryName: template.category_name,
          },
        ]
      : []
  )
  if (
    initial &&
    !options.some((option) => option.versionId === initial.template_version_id)
  ) {
    const version =
      initial.template_version_no != null
        ? ` · v${initial.template_version_no}`
        : ""
    options.push({
      versionId: initial.template_version_id,
      label: `${initial.template_name ?? "Template"}${version} (not current)`,
      categoryId: initial.category_id,
      categoryName: initial.category_name ?? "",
    })
  }
  return options
}

export function buildSenderOptions(
  senders: SenderRow[],
  initial?: SendListItem
): SelectOption[] {
  const options = senders.map((sender) => ({
    value: sender.id,
    label: `${sender.from_name} <${sender.from_email}>`,
  }))
  if (
    initial &&
    !options.some((option) => option.value === initial.sender_id)
  ) {
    options.push({
      value: initial.sender_id,
      label: `${initial.sender_from_name ?? "Sender"} <${initial.sender_from_email ?? "unknown"}> (inactive)`,
    })
  }
  return options
}

export function buildOfferOptions(
  offers: OfferOption[],
  initial?: SendListItem
): SelectOption[] {
  const options: SelectOption[] = [
    { value: ALL_OFFERS_VALUE, label: "All offers" },
    ...offers.map((offer) => ({ value: offer.id, label: offer.name })),
  ]
  if (
    initial?.offer_id &&
    !options.some((option) => option.value === initial.offer_id)
  ) {
    options.push({
      value: initial.offer_id,
      label: `${initial.offer_name ?? initial.offer_external_ref ?? "Offer"} (inactive)`,
    })
  }
  return options
}
