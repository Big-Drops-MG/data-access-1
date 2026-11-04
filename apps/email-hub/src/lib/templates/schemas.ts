import { z } from "zod"

import { paginationSchema, uuidSchema } from "@workspace/shared"

export const templateStatusSchema = z.enum(["draft", "active", "archived"])
export const emailTypeSchema = z.enum([
  "thank_you",
  "feedback_request",
  "engagement",
])

export const templateListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    status: templateStatusSchema.optional(),
    email_type: emailTypeSchema.optional(),
    category_id: uuidSchema.optional(),
  })
  .strict()

export const createTemplateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    category_id: uuidSchema,
    email_type: emailTypeSchema,
  })
  .strict()

export const updateTemplateBodySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    category_id: uuidSchema.optional(),
    status: templateStatusSchema.optional(),
  })
  .strict()
  .refine(
    (body) =>
      body.name !== undefined ||
      body.category_id !== undefined ||
      body.status !== undefined,
    { message: "At least one of name, category_id, or status is required" }
  )

export const createTemplateVersionBodySchema = z
  .object({
    subject: z.string().min(1).max(998),
    body_source: z.string().min(1).max(500_000),
  })
  .strict()

export const publishTemplateBodySchema = z
  .object({
    version_id: uuidSchema,
  })
  .strict()

export const templateIdParamSchema = uuidSchema
