import { z } from "zod"

/** UUID v7, stored and compared as lowercase (SD#10.1). */
export const uuidSchema = z.string().toLowerCase().pipe(z.uuidv7())

/** Email trimmed and lowercased on input (SD#10.1), max 254 chars. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))

/** ISO 8601 UTC timestamp with `Z` (SD#10.1). */
export const isoUtcTimestampSchema = z.iso.datetime()

/**
 * Staff list pagination query (SD#10.1): `limit` default 50, max 200, optional cursor.
 * Unknown fields are rejected.
 */
export const paginationSchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().min(1).optional(),
  })
  .strict()

export type Uuid = z.infer<typeof uuidSchema>
export type Email = z.infer<typeof emailSchema>
export type IsoUtcTimestamp = z.infer<typeof isoUtcTimestampSchema>
export type Pagination = z.infer<typeof paginationSchema>
