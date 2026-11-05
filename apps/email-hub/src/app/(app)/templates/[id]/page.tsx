import type { Metadata } from "next"

import { TemplateEditorPage } from "@/features/templates/template-editor-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Template",
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function Page({ params }: PageProps) {
  const { id } = await params
  const session = await getSession()
  const canWrite = hasAtLeastRole(session, "operator")

  return (
    <TemplateEditorPage
      mode="edit"
      templateId={id}
      canWrite={canWrite}
      operatorEmail={session?.email ?? null}
    />
  )
}
