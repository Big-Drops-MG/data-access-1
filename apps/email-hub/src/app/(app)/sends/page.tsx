import type { Metadata } from "next"

import { ModulePlaceholderPage } from "@/components/app/module-placeholder-page"

export const metadata: Metadata = {
  title: "Sends",
}

export default function Page() {
  return <ModulePlaceholderPage title="Sends" />
}
