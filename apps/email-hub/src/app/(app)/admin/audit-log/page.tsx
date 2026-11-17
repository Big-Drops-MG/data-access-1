import type { Metadata } from "next"
import { Suspense } from "react"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { AuditLogPage } from "@/features/audit-log/audit-log-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "Audit log",
}

export default async function Page() {
  const access = await requireRoleForPage("operator", {
    nextPath: "/admin/audit-log",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="audit-log-list-loading"
          aria-hidden
        />
      }
    >
      <AuditLogPage />
    </Suspense>
  )
}
