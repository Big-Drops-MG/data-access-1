"use client"

import { useMutation } from "@tanstack/react-query"
import { Inbox } from "lucide-react"
import { useState } from "react"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EmptyState } from "@/components/app/empty-state"
import { EtDatePicker } from "@/components/app/et-date-picker"
import { EtDateTime } from "@/components/app/et-datetime"
import { EtDateTimePicker } from "@/components/app/et-datetime-picker"
import { PageHeader } from "@/components/app/page-header"
import {
  StatusBadge,
  statusBadgeCatalog,
  type StatusBadgeStatus,
} from "@/components/app/status-badge"
import { ApiError } from "@/lib/api-client"
import { Button } from "@workspace/ui/components/button"

const statusEntries = Object.keys(statusBadgeCatalog) as StatusBadgeStatus[]

export default function UiKitDemoPage() {
  const [lastConfirm, setLastConfirm] = useState<string | null>(null)
  const [draftName, setDraftName] = useState("Spring promo")
  const conflictMutation = useMutation({
    mutationFn: async () => {
      throw new ApiError("Conflict", 409, "conflict")
    },
  })
  const [etDate, setEtDate] = useState("2026-03-08")
  const [etUtc, setEtUtc] = useState<Date | null>(
    () => new Date("2026-03-08T07:00:00.000Z")
  )

  return (
    <div className="space-y-10">
      <PageHeader
        title="App building blocks"
        description="Demo for StatusBadge, EmptyState, PageHeader, ConfirmDialog, ConflictDialog, EtDateTime, and ET pickers (T-008 / T-019 / T-050 / SD#12.4–12.9)."
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

      <section className="space-y-3" aria-labelledby="et-datetime-heading">
        <h2 id="et-datetime-heading" className="text-h4 font-semibold text-fg">
          Eastern time
        </h2>
        <p className="text-sm text-fg-muted">
          Display always uses America/New_York (
          <code className="font-mono text-caption">MMM d, yyyy, h:mm a z</code>
          ). Pickers convert ET wall time to UTC; spring-forward gaps are
          rejected and fall-back overlaps ask which occurrence.
        </p>
        <dl className="space-y-2 text-body">
          <div className="flex flex-wrap gap-2">
            <dt className="text-fg-muted">After spring forward:</dt>
            <dd>
              <EtDateTime value="2026-03-08T07:00:00.000Z" />
            </dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-fg-muted">Fall-back first (EDT):</dt>
            <dd>
              <EtDateTime value="2026-11-01T05:30:00.000Z" />
            </dd>
          </div>
          <div className="flex flex-wrap gap-2">
            <dt className="text-fg-muted">Fall-back second (EST):</dt>
            <dd>
              <EtDateTime value="2026-11-01T06:30:00.000Z" />
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-8 pt-2">
          <EtDatePicker value={etDate} onChange={setEtDate} />
          <EtDateTimePicker value={etUtc} onChange={setEtUtc} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEtDate("2026-03-08")
              setEtUtc(null)
            }}
          >
            Load spring-forward day
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEtDate("2026-11-01")
              setEtUtc(new Date("2026-11-01T05:30:00.000Z"))
            }}
          >
            Load fall-back 1:30 AM EDT
          </Button>
        </div>
        <p className="text-sm text-fg-muted">
          Selected ET date:{" "}
          <span className="font-mono text-caption text-fg">
            {etDate || "—"}
          </span>
        </p>
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

      <section className="space-y-3" aria-labelledby="conflict-dialog-heading">
        <h2
          id="conflict-dialog-heading"
          className="text-h4 font-semibold text-fg"
        >
          Conflict dialog (409)
        </h2>
        <p className="text-sm text-fg-muted">
          Mutations that throw a 409 open the global conflict dialog. Draft text
          stays until Reload (T-050 / SD#12.4).
        </p>
        <label className="block space-y-1.5 text-sm font-medium text-fg">
          Draft name
          <input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            className="block h-9 w-full max-w-sm rounded-md border border-border-strong bg-surface px-3 text-body font-normal text-fg outline-none focus-visible:shadow-[0_0_0_3px_var(--ring)]"
            data-testid="ui-kit-conflict-draft"
          />
        </label>
        <Button
          type="button"
          onClick={() => conflictMutation.mutate()}
          data-testid="ui-kit-open-conflict"
        >
          Simulate 409 conflict
        </Button>
        <p className="text-caption text-fg-muted">
          Current draft: <span className="font-mono text-fg">{draftName}</span>
        </p>
      </section>
    </div>
  )
}
