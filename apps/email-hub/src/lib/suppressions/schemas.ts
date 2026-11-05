import { z } from "zod"

import { emailSchema, paginationSchema, uuidSchema } from "@workspace/shared"

/** `suppression_source` values. Manual add accepts only `manual`. */
export const suppressionSourceSchema = z.enum([
  "optizmo",
  "list_unsub",
  "feedback_review",
  "manual",
  "hard_bounce",
])

/** `suppression_scope` values. */
export const suppressionScopeSchema = z.enum(["global", "offer", "list_unsub"])

export const suppressionListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    source: suppressionSourceSchema.optional(),
    scope: suppressionScopeSchema.optional(),
    offer_id: uuidSchema.optional(),
    email: emailSchema.optional(),
    include_removed: z.enum(["true", "false"]).optional(),
  })
  .strict()

export const createSuppressionBodySchema = z
  .object({
    email: emailSchema,
    offer_id: uuidSchema.nullable().optional(),
    reason: z.literal("manual"),
  })
  .strict()

export const suppressionIdParamSchema = uuidSchema
