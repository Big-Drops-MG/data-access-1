import type { EmailType } from "@/features/templates/api"

export const EMAIL_TYPE_OPTIONS: ReadonlyArray<{
  value: EmailType
  label: string
  tabLabel: string
}> = [
  { value: "thank_you", label: "Thank-you", tabLabel: "Thank-you" },
  {
    value: "feedback_request",
    label: "Feedback request",
    tabLabel: "Feedback request",
  },
  { value: "engagement", label: "Engagement", tabLabel: "Engagement" },
]

export function emailTypeLabel(emailType: EmailType): string {
  return (
    EMAIL_TYPE_OPTIONS.find((option) => option.value === emailType)?.label ??
    emailType
  )
}

/** Category column label matching the Templates list design. */
export function templateCategoryLabel(
  emailType: EmailType,
  categoryName: string
): string {
  if (emailType === "thank_you") {
    return "Transactional"
  }
  if (emailType === "feedback_request") {
    return "Feedback requests"
  }
  return categoryName
}

export function preferenceCategoryLabel(
  emailType: EmailType | "" | undefined,
  categoryName: string | undefined
): string {
  if (!emailType) {
    return "—"
  }
  if (categoryName) {
    return categoryName
  }
  return emailTypeLabel(emailType)
}
