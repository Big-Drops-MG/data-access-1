import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { FeedbackDetailPage } from "@/features/feedback/feedback-detail-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Feedback",
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const session = await getSession()
  if (!session) {
    redirect("/login")
  }
  const canWrite = hasAtLeastRole(session, "operator")

  return (
    <FeedbackDetailPage
      feedbackId={id}
      currentUserId={session.id}
      canWrite={canWrite}
    />
  )
}
