import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { ImportOfferPage } from "@/features/offers/import-offer-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "Import offer",
}

export default async function Page() {
  const access = await requireRoleForPage("admin", {
    nextPath: "/offers/new",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  return <ImportOfferPage />
}
