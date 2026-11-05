import type { Metadata } from "next"

import { SendDetailPage } from "@/features/sends/send-detail-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Send",
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const session = await getSession()
  const canWrite = hasAtLeastRole(session, "operator")

  return <SendDetailPage sendId={id} canWrite={canWrite} />
}
