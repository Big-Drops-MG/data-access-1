import type { Metadata } from "next"

import { DomainDetailPage } from "@/features/domains/domain-detail-page"

export const metadata: Metadata = {
  title: "Domain",
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  return <DomainDetailPage domainId={id} />
}
