import { z } from "zod"

export const offerListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(100),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict()

export const importOfferBodySchema = z
  .object({
    everflow_offer_id: z.coerce
      .number()
      .int()
      .positive("Everflow offer ID must be a positive integer"),
  })
  .strict()

export const everflowOfferIdParamSchema = z
  .object({
    everflow_offer_id: z.coerce
      .number()
      .int()
      .positive("Everflow offer ID must be a positive integer"),
  })
  .strict()
