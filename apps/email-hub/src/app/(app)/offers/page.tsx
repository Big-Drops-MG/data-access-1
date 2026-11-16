import type { Metadata } from "next"

import { OffersPage } from "@/features/offers/offers-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Offers",
}

export default async function Page() {
  const session = await getSession()
  const canImportOffer = hasAtLeastRole(session, "admin")

  return <OffersPage canImportOffer={canImportOffer} />
}
