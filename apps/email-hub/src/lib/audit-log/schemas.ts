import { z } from "zod"

import {
  getEtReportRange,
  paginationSchema,
  parseEtDateString,
  uuidSchema,
} from "@workspace/shared"

export const auditActorTypeSchema = z.enum(["user", "api_client", "system"])

const etDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
  .superRefine((value, ctx) => {
    try {
      parseEtDateString(value)
    } catch {
      ctx.addIssue({
        code: "custom",
        message: "Invalid ET calendar date",
      })
    }
  })

export const auditLogListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    actor_type: auditActorTypeSchema.optional(),
    actor_id: uuidSchema.optional(),
    action: z.string().trim().min(1).max(200).optional(),
    object_type: z.string().trim().min(1).max(200).optional(),
    object_id: z.string().trim().min(1).max(200).optional(),
    from: etDateSchema.optional(),
    to: etDateSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.from && value.to) {
      try {
        getEtReportRange(value.from, value.to)
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["to"],
          message: "to must be on or after from",
        })
      }
    }
    if (value.actor_type === "system" && value.actor_id) {
      ctx.addIssue({
        code: "custom",
        path: ["actor_id"],
        message: "system actors have no actor_id",
      })
    }
  })

export type AuditLogListQuery = z.infer<typeof auditLogListQuerySchema>
