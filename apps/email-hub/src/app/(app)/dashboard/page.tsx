import { StatusBadge } from "@/components/app/status-badge"

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-h2 font-semibold">Dashboard</h1>
        <p className="text-body text-fg-muted">
          Auth-less shell with Email Hub design tokens (light/dark via theme
          toggle, press <kbd className="font-mono text-caption">d</kbd>).
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusBadge variant="neutral">Queued</StatusBadge>
        <StatusBadge variant="info">Scheduled</StatusBadge>
        <StatusBadge variant="ok">Delivered</StatusBadge>
        <StatusBadge variant="brand">Dispatching</StatusBadge>
        <StatusBadge variant="warn">Pending</StatusBadge>
        <StatusBadge variant="err">Failed</StatusBadge>
      </div>
    </div>
  )
}
