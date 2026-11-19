import type { Metadata } from "next"

import { RecipientDetailPage } from "@/features/recipients/recipient-detail-page"

export const metadata: Metadata = {
  title: "Recipient",
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  return <RecipientDetailPage recipientId={decodeURIComponent(id)} />
}
