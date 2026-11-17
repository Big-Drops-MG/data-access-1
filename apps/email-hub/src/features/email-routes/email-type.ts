import type { EmailRouteEmailType } from "@/features/email-routes/api"

export const ROUTE_EMAIL_TYPE_OPTIONS: ReadonlyArray<{
  value: EmailRouteEmailType
  label: string
}> = [
  { value: "thank_you", label: "Thank-you" },
  { value: "feedback_request", label: "Feedback request" },
  { value: "engagement", label: "Engagement" },
]
