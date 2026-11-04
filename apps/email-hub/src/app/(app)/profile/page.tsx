import type { Metadata } from "next"

import { ModulePlaceholderPage } from "@/components/app/module-placeholder-page"

export const metadata: Metadata = {
  title: "Profile",
}

export default function ProfilePage() {
  return <ModulePlaceholderPage title="Profile" />
}
