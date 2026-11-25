import type { Metadata } from "next"
import { Suspense } from "react"

import { ForbiddenPage } from "@/components/app/full-page-message"
import { UsersPage } from "@/features/users/users-page"
import { requireRoleForPage } from "@/lib/auth/require-role"

export const metadata: Metadata = {
  title: "Users",
}

export default async function Page() {
  const access = await requireRoleForPage("admin", {
    nextPath: "/admin/users",
  })
  if ("forbidden" in access) {
    return <ForbiddenPage />
  }

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="users-list-loading"
          aria-hidden
        />
      }
    >
      <UsersPage currentUserId={access.user.id} />
    </Suspense>
  )
}
