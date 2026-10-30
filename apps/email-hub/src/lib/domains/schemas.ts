import { z } from "zod"

import { paginationSchema, uuidSchema } from "@workspace/shared"

/** Lowercased FQDN: labels of alnum/hyphen, at least one dot (SD#9.1). */
export const fqdnSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(1)
      .max(253)
      .regex(
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
        "Must be a valid FQDN"
      )
  )

export const domainStatusSchema = z.enum([
  "pending",
  "verifying",
  "verified",
  "failed",
  "inactive",
])

export const domainListQuerySchema = paginationSchema
  .extend({
    cursor: uuidSchema.optional(),
    status: domainStatusSchema.optional(),
  })
  .strict()

export const createDomainBodySchema = z
  .object({
    name: fqdnSchema,
  })
  .strict()

export const updateDomainBodySchema = z
  .object({
    status: domainStatusSchema,
  })
  .strict()

export const domainIdParamSchema = uuidSchema
