import type { Metadata } from "next"

import { DomainDetailPage } from "@/features/domains/domain-detail-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Domain",
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const session = await getSession()
  return (
    <DomainDetailPage
      domainId={id}
      canManage={hasAtLeastRole(session, "admin")}
    />
  )
}
