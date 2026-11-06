import { z } from "zod"

import { emailSchema, paginationSchema, uuidSchema } from "@workspace/shared"

export const recipientStatusFilterSchema = z.enum(["active", "bounced"])

export const recipientListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    email: emailSchema.optional(),
    status: recipientStatusFilterSchema.optional(),
    opted_out_category_id: uuidSchema.optional(),
  })
  .strict()

export const recipientIdParamSchema = uuidSchema
