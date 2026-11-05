import { asc, eq } from "drizzle-orm"

import { offer } from "@workspace/db"
import { getDb, type Database } from "@workspace/db/client"

import { serializeOffer, type OfferJson } from "./serialize"

export type ListOffersInput = {
  limit: number
  status: "active" | "inactive"
}

export async function listOffers(
  input: ListOffersInput,
  db: Database = getDb()
): Promise<{ data: OfferJson[] }> {
  const rows = await db
    .select()
    .from(offer)
    .where(eq(offer.status, input.status))
    .orderBy(asc(offer.name), asc(offer.id))
    .limit(input.limit)

  return { data: rows.map(serializeOffer) }
}
