import { z } from "zod"

import { paginationSchema, uuidSchema } from "@workspace/shared"

export const alertStatusSchema = z.enum(["open", "resolved"])

export const alertSeveritySchema = z.enum(["info", "warning", "critical"])

export const alertListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    status: alertStatusSchema.optional(),
    severity: alertSeveritySchema.optional(),
    type: z.string().trim().min(1).max(128).optional(),
  })
  .strict()

export const alertIdParamSchema = uuidSchema
