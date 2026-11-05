import type { Metadata } from "next"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { TemplateEditorPage } from "@/features/templates/template-editor-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "New template",
}

export default async function Page() {
  const access = await requireRoleForPage("operator", {
    nextPath: "/templates/new",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }
  return (
    <TemplateEditorPage
      mode="create"
      canWrite
      operatorEmail={access.user.email}
    />
  )
}
