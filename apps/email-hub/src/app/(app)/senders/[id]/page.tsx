import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { EditSenderPage } from "@/features/senders/edit-sender-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "Edit sender",
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const access = await requireRoleForPage("operator", {
    nextPath: `/senders/${id}`,
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  return <EditSenderPage senderId={id} />
}
