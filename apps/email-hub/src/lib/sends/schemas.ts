import { z } from "zod"

import {
  isoUtcTimestampSchema,
  paginationSchema,
  uuidSchema,
} from "@workspace/shared"

export const emailTypeSchema = z.enum([
  "thank_you",
  "feedback_request",
  "engagement",
])

export const sendStatusSchema = z.enum([
  "draft",
  "scheduled",
  "queued",
  "dispatching",
  "completed",
  "cancelled",
  "failed",
])

export const sendListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    status: sendStatusSchema.optional(),
    email_type: emailTypeSchema.optional(),
    offer_id: uuidSchema.optional(),
    sender_id: uuidSchema.optional(),
    category_id: uuidSchema.optional(),
    template_version_id: uuidSchema.optional(),
  })
  .strict()

export const createSendBodySchema = z
  .object({
    template_version_id: uuidSchema,
    sender_id: uuidSchema,
    category_id: uuidSchema,
    offer_id: uuidSchema.nullable().optional(),
    scheduled_for: isoUtcTimestampSchema,
  })
  .strict()

export const updateSendBodySchema = z
  .object({
    version: z.number().int().positive(),
    template_version_id: uuidSchema.optional(),
    sender_id: uuidSchema.optional(),
    category_id: uuidSchema.optional(),
    offer_id: uuidSchema.nullable().optional(),
    scheduled_for: isoUtcTimestampSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.template_version_id !== undefined ||
      body.sender_id !== undefined ||
      body.category_id !== undefined ||
      body.offer_id !== undefined ||
      body.scheduled_for !== undefined,
    {
      message:
        "At least one of template_version_id, sender_id, category_id, offer_id, or scheduled_for is required",
    }
  )

export const sendVersionBodySchema = z
  .object({
    version: z.number().int().positive(),
  })
  .strict()

export const deleteSendQuerySchema = z
  .object({
    version: z.coerce.number().int().positive(),
  })
  .strict()

export const sendIdParamSchema = uuidSchema
