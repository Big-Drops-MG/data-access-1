import type { ApplyUnsubscribeScope } from "@workspace/shared"

export type UnsubscribeConfirmCopy = {
  categoryLabel: string
  categoryDescription: string
  allDescription: string
}

export function unsubscribeConfirmCopy(
  categoryName: string | null | undefined
): UnsubscribeConfirmCopy {
  const categoryLabel = categoryName?.trim() || "this email type"
  return {
    categoryLabel,
    categoryDescription: `Stop emails in "${categoryLabel}" only.`,
    allDescription:
      "Stop relationship emails and add a list-unsubscribe suppression.",
  }
}

export function unsubscribeDoneMessage(scope: ApplyUnsubscribeScope): string {
  if (scope === "all") {
    return "You are unsubscribed from relationship emails."
  }
  return "You are unsubscribed from this email type."
}

export function unsubscribeExpiredMessage(): string {
  return "This unsubscribe link has expired. No preferences were changed."
}
