import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { OffersPage } from "@/features/offers/offers-page"
import { requireRoleForPage } from "@/lib/auth/require-role"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Offers",
}

export default async function Page() {
  const access = await requireRoleForPage("operator", { nextPath: "/offers" })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  const canImportOffer = hasAtLeastRole(access.user, "admin")

  return <OffersPage canImportOffer={canImportOffer} />
}
