import { z } from "zod"

import { paginationSchema, uuidSchema } from "@workspace/shared"

export const feedbackSourceSchema = z.enum([
  "provider_fbl",
  "feedback_form",
  "mailbox_report",
])

export const feedbackStatusSchema = z.enum(["pending", "in_review", "resolved"])

export const feedbackDecisionSchema = z.enum([
  "no_action",
  "suppress",
  "escalate",
])

export const feedbackListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    status: feedbackStatusSchema.optional(),
    source: feedbackSourceSchema.optional(),
    offer_id: uuidSchema.optional(),
  })
  .strict()

export const feedbackIdParamSchema = uuidSchema

export const decideFeedbackBodySchema = z
  .object({
    classification_id: uuidSchema,
    decision: feedbackDecisionSchema,
  })
  .strict()
