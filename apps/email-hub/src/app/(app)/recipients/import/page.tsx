import type { Metadata } from "next"

import { RecipientsImportPage } from "@/features/recipients/recipients-import-page"
import { getSession } from "@/lib/auth"
import { hasAtLeastRole } from "@/lib/permissions"

export const metadata: Metadata = {
  title: "Import recipients",
}

export default async function Page() {
  const session = await getSession()
  const canImport = hasAtLeastRole(session, "operator")
  return <RecipientsImportPage canImport={canImport} />
}
