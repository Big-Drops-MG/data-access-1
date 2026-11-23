"use client"

import { Plus } from "lucide-react"
import { useState, type ReactNode } from "react"
import Link from "next/link"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { StatusBadge } from "@/components/app/status-badge"
import type { EmailRouteListItem } from "@/features/email-routes/api"
import { emailRouteStatusToBadge } from "@/features/email-routes/email-route-status"
import { emailRoutesPrimaryControl } from "@/features/email-routes/email-routes-ui"
import { NewRouteDialog } from "@/features/email-routes/new-route-dialog"
import { useEmailRoutesList } from "@/features/email-routes/use-email-routes-list"
import { useRouteListLookups } from "@/features/email-routes/use-route-form-options"
import { isApiError } from "@/lib/api-client"

function SectionCard({
  title,
  description,
  action,
  children,
  testId,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
  testId?: string
}) {
  return (
    <section
      className="overflow-hidden rounded-xl border border-border bg-surface"
      data-testid={testId}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          {description ? (
            <p className="text-[12px] text-fg-muted">{description}</p>
          ) : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}

function EmptySection({
  message,
  testId,
}: {
  message: string
  testId: string
}) {
  return (
    <p
      className="px-4 py-10 text-center text-sm text-fg-muted"
      data-testid={testId}
    >
      {message}
    </p>
  )
}

function routeLabels(
  route: EmailRouteListItem,
  lookups: ReturnType<typeof useRouteListLookups>
) {
  const template = lookups.templatesById.get(route.template_id)
  const sender = lookups.sendersById.get(route.sender_id)
  const offer = route.offer_id
    ? lookups.offersById.get(route.offer_id)
    : undefined
  return {
    template: template?.name ?? "Template",
    sender: sender ? sender.from_email : "Sender",
    offer: route.offer_id ? (offer?.name ?? "Offer") : "No offer",
  }
}

function EmailRoutesList({ routes }: { routes: EmailRouteListItem[] }) {
  const lookups = useRouteListLookups()

  if (routes.length === 0) {
    return (
      <EmptySection
        message="No email routes. A send is skipped until this type has an active route."
        testId="dashboard-email-routes-empty"
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
        <thead className="bg-surface-2 text-caption font-medium tracking-wide text-fg-muted uppercase">
          <tr>
            <th className="px-4 py-2.5 font-medium">Email type</th>
            <th className="px-4 py-2.5 font-medium">Offer</th>
            <th className="px-4 py-2.5 font-medium">Template</th>
            <th className="px-4 py-2.5 font-medium">Sender</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route) => {
            const labels = routeLabels(route, lookups)
            return (
              <tr
                key={route.id}
                className="border-t border-border"
                data-testid="dashboard-email-route-row"
              >
                <th scope="row" className="px-4 py-2.5 font-medium text-fg">
                  <Link
                    href="/email-routes"
                    className="font-mono text-[12px] text-link hover:underline"
                  >
                    {route.email_type}
                  </Link>
                </th>
                <td className="px-4 py-2.5 text-fg">{labels.offer}</td>
                <td className="px-4 py-2.5 text-fg">{labels.template}</td>
                <td className="px-4 py-2.5 font-mono text-[13px] text-fg-muted">
                  {labels.sender}
                </td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={emailRouteStatusToBadge(route.status)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function DashboardEmailRoutes({ canWrite }: { canWrite: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)
  const list = useEmailRoutesList({ limit: 8 })

  return (
    <>
      <SectionCard
        title="Email routes"
        description="Routes the send path uses for each email type"
        action={
          <div className="flex flex-wrap items-center gap-3">
            {canWrite ? (
              <button
                type="button"
                className={emailRoutesPrimaryControl()}
                data-testid="dashboard-email-routes-add"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-3.5" strokeWidth={2} aria-hidden />
                New route
              </button>
            ) : null}
            <Link
              href="/email-routes"
              className="text-sm font-medium text-link hover:underline"
            >
              View all
            </Link>
          </div>
        }
        testId="dashboard-email-routes"
      >
        {list.isError ? (
          <InlineErrorCard
            message={
              isApiError(list.error)
                ? list.error.message
                : "Could not load email routes."
            }
            requestId={isApiError(list.error) ? list.error.requestId : null}
            onRetry={() => {
              void list.refetch()
            }}
          />
        ) : null}
        {list.isLoading ? (
          <div
            className="h-24 animate-pulse bg-surface-2"
            data-testid="dashboard-email-routes-loading"
            aria-hidden
          />
        ) : null}
        {list.data ? <EmailRoutesList routes={list.data.data} /> : null}
      </SectionCard>
      {canWrite ? (
        <NewRouteDialog open={createOpen} onOpenChange={setCreateOpen} />
      ) : null}
    </>
  )
}
