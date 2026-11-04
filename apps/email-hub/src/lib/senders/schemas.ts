import { z } from "zod"

import { emailSchema, paginationSchema, uuidSchema } from "@workspace/shared"

/**
 * Email local-part: lowercase, 1–64 chars, alnum with interior `. _ + -`.
 * Composed with the domain name via `emailSchema` in the service.
 */
export const localPartSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(1)
      .max(64)
      .regex(
        /^(?:[a-z0-9]|[a-z0-9][a-z0-9._+-]*[a-z0-9])$/,
        "Must be a valid email local part"
      )
  )

export const senderStatusSchema = z.enum([
  "active",
  "inactive",
  "pending_verification",
])

export const senderListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    status: senderStatusSchema.optional(),
    domain_id: uuidSchema.optional(),
  })
  .strict()

export const createSenderBodySchema = z
  .object({
    domain_id: uuidSchema,
    from_name: z.string().trim().min(1).max(200),
    local_part: localPartSchema,
    reply_to: emailSchema.nullable().optional(),
  })
  .strict()

export const updateSenderBodySchema = z
  .object({
    version: z.number().int().positive(),
    from_name: z.string().trim().min(1).max(200).optional(),
    local_part: localPartSchema.optional(),
    reply_to: emailSchema.nullable().optional(),
    status: senderStatusSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.from_name !== undefined ||
      body.local_part !== undefined ||
      body.reply_to !== undefined ||
      body.status !== undefined,
    {
      message:
        "At least one of from_name, local_part, reply_to, or status is required",
    }
  )

export const senderIdParamSchema = uuidSchema
