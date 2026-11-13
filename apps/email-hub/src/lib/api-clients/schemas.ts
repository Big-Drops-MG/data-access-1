import { z } from "zod"

import { MACHINE_SCOPES } from "@/lib/auth/machine-hmac"

import { normaliseIpAllowlist } from "./ip"

const NAME_MAX = 120
const ALLOWLIST_MAX = 50

export const apiClientNameSchema = z
  .string()
  .trim()
  .min(1, "Required")
  .max(NAME_MAX)
  .refine((value) => {
    for (const char of value) {
      const code = char.charCodeAt(0)
      if (code < 32 || code === 127) {
        return false
      }
    }
    return true
  }, "Contains invalid characters")

export const apiClientScopesSchema = z
  .array(z.enum(MACHINE_SCOPES))
  .max(MACHINE_SCOPES.length)

export const apiClientAllowlistSchema = z
  .array(z.string().max(80))
  .max(ALLOWLIST_MAX)
  .superRefine((values, ctx) => {
    const result = normaliseIpAllowlist(values)
    if (result.ok) {
      return
    }
    ctx.addIssue({
      code: "custom",
      path: [result.index],
      message: result.message,
    })
  })

export const createApiClientBodySchema = z
  .object({
    name: apiClientNameSchema,
    scopes: apiClientScopesSchema,
    ip_allowlist: apiClientAllowlistSchema.optional(),
  })
  .strict()

export const updateApiClientScopesBodySchema = z
  .object({
    scopes: apiClientScopesSchema,
  })
  .strict()

export const updateApiClientAllowlistBodySchema = z
  .object({
    ip_allowlist: apiClientAllowlistSchema,
  })
  .strict()
