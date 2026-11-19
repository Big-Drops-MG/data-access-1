"use client"

import Link from "next/link"

import { recipientsTabClass } from "@/features/recipients/recipients-ui"

export type RecipientsTabId = "list" | "import" | "categories"

const TABS: ReadonlyArray<{
  id: RecipientsTabId
  href: string
  label: string
}> = [
  { id: "list", href: "/recipients", label: "Recipients" },
  { id: "import", href: "/recipients/import", label: "Import" },
  { id: "categories", href: "/recipients/categories", label: "Categories" },
]

type RecipientsTabsProps = {
  active: RecipientsTabId
}

export function RecipientsTabs({ active }: RecipientsTabsProps) {
  return (
    <nav
      className="flex flex-wrap items-center gap-5 border-b border-border"
      aria-label="Recipients sections"
      data-testid="recipients-tabs"
    >
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={recipientsTabClass(active === tab.id)}
          aria-current={active === tab.id ? "page" : undefined}
          data-testid={`recipients-tab-${tab.id}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
