import { z } from "zod"

import { AppError, emailSchema, isoUtcTimestampSchema } from "@workspace/shared"

export const AROHAA_WEBHOOK_MAX_BODY_BYTES = 64 * 1024

const recipientTierSchema = z.enum(["standard", "premium"])

export const arohaaWebhookBodySchema = z
  .object({
    event_id: z.string().trim().min(1).max(128),
    email: emailSchema,
    tier: recipientTierSchema,
    previous_tier: recipientTierSchema.optional(),
    occurred_at: isoUtcTimestampSchema,
  })
  .strict()

export type ArohaaWebhookBody = z.infer<typeof arohaaWebhookBodySchema>

export function parseArohaaJsonBody(rawBody: Buffer): unknown {
  if (rawBody.byteLength > AROHAA_WEBHOOK_MAX_BODY_BYTES) {
    throw new AppError("bad_request", 413, [
      { path: "body", message: "Payload too large" },
    ])
  }

  const text = rawBody.toString("utf8")
  if (text.trim() === "") {
    throw AppError.badRequest([{ path: "body", message: "Must be valid JSON" }])
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    throw AppError.badRequest([{ path: "body", message: "Must be valid JSON" }])
  }
}
