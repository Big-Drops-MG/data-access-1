import type { Metadata } from "next"
import { Suspense } from "react"

import { RecipientsImportPage } from "@/features/recipients/recipients-import-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Import recipients",
}

export default async function Page() {
  const session = await getSession()
  const canImport = hasAtLeastRole(session, "operator")

  return (
    <Suspense
      fallback={
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="recipients-import-loading"
          aria-hidden
        />
      }
    >
      <RecipientsImportPage canImport={canImport} />
    </Suspense>
  )
}
