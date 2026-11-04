import type { Metadata } from "next"

import { ModulePlaceholderPage } from "@/components/app/module-placeholder-page"

export const metadata: Metadata = {
  title: "Ops",
}

export default function OpsPage() {
  return <ModulePlaceholderPage title="Ops" />
}
