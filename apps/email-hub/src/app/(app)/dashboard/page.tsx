import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"

export const metadata: Metadata = {
  title: "Dashboard",
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Auth-less shell with Email Hub design tokens. Press d to toggle theme."
        actions={
          <Link
            href="/ui-kit"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-on-primary"
            data-testid="dashboard-ui-kit-link"
          >
            Open UI kit demo
          </Link>
        }
      />
      <div className="flex flex-wrap gap-2">
        <StatusBadge status="queued" />
        <StatusBadge status="scheduled" />
        <StatusBadge status="completed" />
        <StatusBadge status="dispatching" />
        <StatusBadge status="pending" />
        <StatusBadge status="failed" />
      </div>
    </div>
  )
}
