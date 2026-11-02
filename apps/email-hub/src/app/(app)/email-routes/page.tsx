import type { Metadata } from "next"

import { ModulePlaceholderPage } from "@/components/app/module-placeholder-page"

export const metadata: Metadata = {
  title: "Email routes",
}

export default function Page() {
  return <ModulePlaceholderPage title="Email routes" />
}
