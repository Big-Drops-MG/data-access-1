import { z } from "zod"

export const offerListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict()
