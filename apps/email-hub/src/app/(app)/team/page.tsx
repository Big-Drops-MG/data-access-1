import type { Metadata } from "next"

import { ModulePlaceholderPage } from "@/components/app/module-placeholder-page"

export const metadata: Metadata = {
  title: "Team",
}

export default function TeamPage() {
  return <ModulePlaceholderPage title="Team" />
}
