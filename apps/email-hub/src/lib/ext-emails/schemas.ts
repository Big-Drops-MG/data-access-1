import { z } from "zod"

import { AppError, emailSchema, uuidSchema } from "@workspace/shared"

/** Matches `message_status` in the database. */
export const EXTERNAL_MESSAGE_STATUSES = [
  "queued",
  "sending",
  "sent",
  "delivered",
  "bounced",
  "complained",
  "skipped",
  "failed",
] as const

export type ExternalMessageStatus = (typeof EXTERNAL_MESSAGE_STATUSES)[number]

export type ExternalEmailView = {
  message_id: string
  status: ExternalMessageStatus
}

export const EXT_EMAIL_MAX_BODY_BYTES = 64 * 1024

const mergeTagNameSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Must be a merge-tag name")

const mergeValueSchema = z.union([
  z.string().max(2_000),
  z.number().finite(),
  z.boolean(),
])

export const mergeDataSchema = z
  .record(mergeTagNameSchema, mergeValueSchema)
  .refine((data) => Object.keys(data).length <= 50, {
    message: "At most 50 keys",
  })

export const sendEmailBodySchema = z
  .object({
    to: emailSchema,
    email_type: z.enum(["thank_you", "feedback_request", "engagement"]),
    idempotency_key: z.string().trim().min(1).max(255),
    offer_id: uuidSchema.nullable().optional(),
    external_user_id: z.string().trim().min(1).max(255).nullable().optional(),
    merge_data: mergeDataSchema.optional(),
  })
  .strict()

export type SendEmailBody = z.infer<typeof sendEmailBodySchema>

export const messageIdParamSchema = uuidSchema

export function parseExtJsonBody(rawBody: Buffer): unknown {
  if (rawBody.byteLength > EXT_EMAIL_MAX_BODY_BYTES) {
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
