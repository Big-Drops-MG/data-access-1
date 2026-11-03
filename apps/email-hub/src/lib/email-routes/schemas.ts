import { z } from "zod"

import { paginationSchema, uuidSchema } from "@workspace/shared"

export const emailTypeSchema = z.enum([
  "thank_you",
  "feedback_request",
  "engagement",
])

export const emailRouteStatusSchema = z.enum(["active", "inactive"])

export const emailRouteListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    status: emailRouteStatusSchema.optional(),
    email_type: emailTypeSchema.optional(),
    offer_id: uuidSchema.optional(),
    template_id: uuidSchema.optional(),
    sender_id: uuidSchema.optional(),
  })
  .strict()

export const createEmailRouteBodySchema = z
  .object({
    email_type: emailTypeSchema,
    offer_id: uuidSchema.nullable().optional(),
    template_id: uuidSchema,
    sender_id: uuidSchema,
  })
  .strict()

export const updateEmailRouteBodySchema = z
  .object({
    version: z.number().int().positive(),
    email_type: emailTypeSchema.optional(),
    offer_id: uuidSchema.nullable().optional(),
    template_id: uuidSchema.optional(),
    sender_id: uuidSchema.optional(),
    status: emailRouteStatusSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.email_type !== undefined ||
      body.offer_id !== undefined ||
      body.template_id !== undefined ||
      body.sender_id !== undefined ||
      body.status !== undefined,
    {
      message:
        "At least one of email_type, offer_id, template_id, sender_id, or status is required",
    }
  )

export const emailRouteIdParamSchema = uuidSchema
