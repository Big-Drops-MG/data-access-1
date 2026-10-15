import { pgEnum } from "drizzle-orm/pg-core"

export const emailType = pgEnum("email_type", [
  "thank_you",
  "feedback_request",
  "engagement",
])
