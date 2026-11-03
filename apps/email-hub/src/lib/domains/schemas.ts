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

/** Single DNS label used for the custom MAIL FROM host (`{label}.{domain}`). */
export const mailFromSubdomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(
    z
      .string()
      .min(1, "MAIL FROM subdomain is required")
      .max(63)
      .regex(
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
        "Use a single label of letters, numbers, or hyphens"
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
    mail_from_subdomain: mailFromSubdomainSchema.optional(),
  })
  .strict()

export const updateDomainBodySchema = z
  .object({
    status: domainStatusSchema,
  })
  .strict()

/** Path param: domain UUID or FQDN (`/domains/dev.quotifii.com`). */
export const domainRefSchema = z.union([uuidSchema, fqdnSchema])

/** @deprecated Prefer {@link domainRefSchema}. */
export const domainIdParamSchema = domainRefSchema
