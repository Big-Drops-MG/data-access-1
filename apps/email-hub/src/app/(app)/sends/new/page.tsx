import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { CreateSendPage } from "@/features/sends/create-send-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "New send",
}

export default async function Page() {
  const access = await requireRoleForPage("operator", {
    nextPath: "/sends/new",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  return <CreateSendPage />
}
