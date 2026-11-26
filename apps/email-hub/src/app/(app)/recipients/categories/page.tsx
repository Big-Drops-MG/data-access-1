import type { Metadata } from "next"

import { RecipientsCategoriesPage } from "@/features/recipients/recipients-categories-page"

export const metadata: Metadata = {
  title: "Recipient categories",
}

export default function Page() {
  return <RecipientsCategoriesPage />
}
