"use client"

import { Inbox } from "lucide-react"
import { useState } from "react"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EmptyState } from "@/components/app/empty-state"
import { PageHeader } from "@/components/app/page-header"
import {
  StatusBadge,
  statusBadgeCatalog,
  type StatusBadgeStatus,
} from "@/components/app/status-badge"
import { Button } from "@workspace/ui/components/button"

const statusEntries = Object.keys(statusBadgeCatalog) as StatusBadgeStatus[]

export default function UiKitDemoPage() {
  const [lastConfirm, setLastConfirm] = useState<string | null>(null)

  return (
    <div className="space-y-10">
      <PageHeader
        title="App building blocks"
        description="Demo for StatusBadge, EmptyState, PageHeader, and ConfirmDialog (T-008 / SD#12.9). Badges always include text, not colour alone."
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "UI kit" },
        ]}
        actions={
          <Button type="button" data-testid="ui-kit-primary-action">
            Primary action
          </Button>
        }
      />

      <section className="space-y-3" aria-labelledby="status-badges-heading">
        <h2
          id="status-badges-heading"
          className="text-h4 font-semibold text-fg"
        >
          Status badges
        </h2>
        <ul className="flex flex-wrap gap-2">
          {statusEntries.map((status) => (
            <li key={status}>
              <StatusBadge status={status} />
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="empty-state-heading">
        <h2 id="empty-state-heading" className="text-h4 font-semibold text-fg">
          Empty state
        </h2>
        <EmptyState
          icon={<Inbox strokeWidth={1.75} />}
          title="No sends yet"
          description="When you schedule your first send, it will show up here."
          action={
            <Button type="button" data-testid="empty-state-action">
              Schedule send
            </Button>
          }
        />
      </section>

      <section className="space-y-3" aria-labelledby="confirm-dialog-heading">
        <h2
          id="confirm-dialog-heading"
          className="text-h4 font-semibold text-fg"
        >
          Confirm dialog
        </h2>
        <div className="flex flex-wrap gap-3">
          <ConfirmDialog
            title="Cancel this send?"
            description="The send will move to cancelled and will not dispatch."
            confirmLabel="Cancel send"
            destructive
            trigger={<Button type="button">Open cancel confirm</Button>}
            onConfirm={() => setLastConfirm("cancel-send")}
          />
          <ConfirmDialog
            title="Disable domain"
            description="Type the domain name to confirm. Scheduled sends that use this domain will be blocked."
            confirmLabel="Disable domain"
            confirmPhrase="example.com"
            destructive
            trigger={<Button type="button">Open typed confirm</Button>}
            onConfirm={() => setLastConfirm("disable-domain")}
          />
        </div>
        {lastConfirm ? (
          <p className="text-sm text-fg-muted">
            Last confirmed action:{" "}
            <span className="font-mono text-caption text-fg">
              {lastConfirm}
            </span>
          </p>
        ) : null}
      </section>
    </div>
  )
}
