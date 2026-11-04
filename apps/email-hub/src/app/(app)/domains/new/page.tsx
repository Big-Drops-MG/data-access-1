import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { CreateDomainPage } from "@/features/domains/create-domain-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "Add domain",
}

export default async function Page() {
  const access = await requireRoleForPage("admin", {
    nextPath: "/domains/new",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  return <CreateDomainPage />
}
