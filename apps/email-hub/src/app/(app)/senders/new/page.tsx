import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { CreateSenderPage } from "@/features/senders/create-sender-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "New sender",
}

export default async function Page() {
  const access = await requireRoleForPage("operator", {
    nextPath: "/senders/new",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  return <CreateSenderPage />
}
