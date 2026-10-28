import type { Metadata } from "next"

import { ModulePlaceholderPage } from "@/components/app/module-placeholder-page"

export const metadata: Metadata = {
  title: "Suppression",
}

export default function Page() {
  return <ModulePlaceholderPage title="Suppression" />
}
