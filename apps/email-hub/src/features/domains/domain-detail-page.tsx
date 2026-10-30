"use client"

import { useQuery } from "@tanstack/react-query"
import { useRouter } from "next/navigation"

import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import { fetchDomainDetail } from "@/features/domains/api"
import { domainStatusToBadge } from "@/features/domains/domain-status"
import { isApiError } from "@/lib/api-client"
import { detailQueryOptions } from "@/lib/query-options"
import { Button } from "@workspace/ui/components/button"

type DomainDetailPageProps = {
  domainId: string
}

export function DomainDetailPage({ domainId }: DomainDetailPageProps) {
  const router = useRouter()
  const detail = useQuery(
    detailQueryOptions("domains", domainId, () => fetchDomainDetail(domainId))
  )

  if (detail.isPending) {
    return (
      <div
        className="h-40 animate-pulse rounded-md bg-surface-2"
        data-testid="domains-detail-loading"
        aria-hidden
      />
    )
  }

  if (detail.isError) {
    return (
      <InlineErrorCard
        message={
          isApiError(detail.error)
            ? detail.error.message
            : "Could not load domain."
        }
        requestId={isApiError(detail.error) ? detail.error.requestId : null}
        onRetry={() => {
          void detail.refetch()
        }}
      />
    )
  }

  const domain = detail.data
  const badgeStatus = domainStatusToBadge(domain.status)

  return (
    <div className="space-y-6" data-testid="domains-detail">
      <PageHeader
        title={domain.name}
        description="Domain detail"
        breadcrumbs={[
          { label: "Domains", href: "/domains" },
          { label: domain.name },
        ]}
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              router.push("/domains")
            }}
          >
            Back to list
          </Button>
        }
      />

      <dl className="grid gap-4 rounded-md border border-border bg-surface p-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-fg-muted">Status</dt>
          <dd className="mt-1">
            {badgeStatus ? (
              <StatusBadge status={badgeStatus} />
            ) : (
              <StatusBadge variant="neutral">{domain.status}</StatusBadge>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-fg-muted">Created</dt>
          <dd className="mt-1 text-body text-fg">
            {domain.created_at ? <EtDateTime value={domain.created_at} /> : "—"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-fg-muted">SES identity ARN</dt>
          <dd className="mt-1 font-mono text-caption break-all text-fg">
            {domain.ses_identity_arn ?? "—"}
          </dd>
        </div>
      </dl>
    </div>
  )
}
