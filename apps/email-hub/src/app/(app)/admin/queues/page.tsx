import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { ModulePlaceholderPage } from "@/components/app/module-placeholder-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "Queues",
}

export default async function Page() {
  const access = await requireRoleForPage("admin", {
    nextPath: "/admin/queues",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  return <ModulePlaceholderPage title="Queues" />
}
