import { z } from "zod"

const limitSchema = z.coerce.number().int().min(1).max(100).default(50)

export const optOutListQuerySchema = z.object({
  limit: limitSchema,
  cursor: z.string().min(1).optional(),
  q: z.string().trim().min(1).max(320).optional(),
  scope: z.enum(["category", "all", "all_types"]).default("all_types"),
})

const httpsLogoUrlSchema = z
  .string()
  .url()
  .refine((value) => value.startsWith("https://"), {
    message: "Logo URL must use https",
  })

export const patchUnsubscribeSettingsBodySchema = z
  .object({
    logo_url: z.union([httpsLogoUrlSchema, z.null()]).optional(),
    custom_domain: z
      .union([
        z
          .string()
          .trim()
          .min(1)
          .max(253)
          .regex(
            /^(?=.{1,253}$)(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/i,
            "Must be a hostname"
          ),
        z.null(),
      ])
      .optional(),
  })
  .refine(
    (body) => body.logo_url !== undefined || body.custom_domain !== undefined,
    { message: "At least one field is required" }
  )
