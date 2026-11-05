import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { EditSendPage } from "@/features/sends/edit-send-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "Edit send",
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const access = await requireRoleForPage("operator", {
    nextPath: `/sends/${id}/edit`,
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  return <EditSendPage sendId={id} />
}
