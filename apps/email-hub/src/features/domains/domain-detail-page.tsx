"use client"

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { toast } from "sonner"

import { ConfirmDialog } from "@/components/app/confirm-dialog"
import { EtDateTime } from "@/components/app/et-datetime"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { useMutationDisabledProps } from "@/components/app/online-status"
import { PageHeader } from "@/components/app/page-header"
import { StatusBadge } from "@/components/app/status-badge"
import {
  checkDomainDns,
  disableDomain,
  fetchDomainDetail,
  type DomainDetailResponse,
} from "@/features/domains/api"
import { CopyButton } from "@/features/domains/copy-button"
import { DnsRecordStatusBadge } from "@/features/domains/dns-status"
import { domainStatusToBadge } from "@/features/domains/domain-status"
import {
  buildSetupStepViews,
  dnsPurposeLabel,
  dnsProgressLabel,
  formatDnsRecordsForCopy,
  shortDomainId,
  summarizeDnsProgress,
} from "@/features/domains/domain-setup-summary"
import { SetupStepper } from "@/features/domains/setup-stepper"
import { isApiError, isConflictError } from "@/lib/api-client"
import { detailQueryOptions } from "@/lib/query-options"
import { detailQueryKey, listQueryKey } from "@/lib/query-keys"
import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

type DomainDetailPageProps = {
  domainId: string
  /** Admin-only actions (check now, disable). */
  canManage?: boolean
}

export function DomainDetailPage({
  domainId,
  canManage = false,
}: DomainDetailPageProps) {
  const queryClient = useQueryClient()
  const mutationDisabled = useMutationDisabledProps()
  const detail = useQuery(
    detailQueryOptions("domains", domainId, () => fetchDomainDetail(domainId))
  )

  const check = useMutation({
    mutationFn: () => checkDomainDns(domainId),
    meta: { skipConflictDialog: true },
    onSuccess: async (updated) => {
      queryClient.setQueryData(detailQueryKey("domains", domainId), updated)
      await queryClient.invalidateQueries({ queryKey: listQueryKey("domains") })
      toast.success("DNS records checked")
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not check DNS records"
      )
    },
  })

  const disable = useMutation({
    mutationFn: () => disableDomain(domainId),
    meta: { skipConflictDialog: true },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: detailQueryKey("domains", domainId),
        }),
        queryClient.invalidateQueries({ queryKey: listQueryKey("domains") }),
      ])
      toast.success("Domain disabled")
    },
    onError: (error) => {
      toast.error(
        isConflictError(error)
          ? "Deactivate this domain's senders and routes before disabling it."
          : isApiError(error)
            ? error.message
            : "Could not disable domain"
      )
    },
  })

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

  const domain: DomainDetailResponse = detail.data
  const badgeStatus = domainStatusToBadge(domain.status)
  const isDisabled = domain.status === "inactive"
  const actionsDisabled = mutationDisabled.disabled

  const steps = buildSetupStepViews({
    status: domain.status,
    setupSteps: domain.setup_steps,
    dnsRecords: domain.dns_records,
  })
  const progress = summarizeDnsProgress(domain.dns_records)

  return (
    <div className="space-y-6" data-testid="domains-detail">
      <PageHeader
        title={domain.name}
        titleBadge={
          badgeStatus ? (
            <StatusBadge status={badgeStatus} />
          ) : (
            <StatusBadge variant="neutral">{domain.status}</StatusBadge>
          )
        }
        meta={
          <>
            <span className="font-mono text-caption">
              {shortDomainId(domain.id)}
            </span>
            {domain.ses_region ? ` · ${domain.ses_region}` : null}
            {" · added "}
            <EtDateTime
              value={domain.created_at}
              className="text-body text-fg-muted"
            />
          </>
        }
        breadcrumbs={[
          { label: "Domains", href: "/domains" },
          { label: domain.name },
        ]}
        actions={
          <>
            <p className="text-body text-fg-muted">
              Last checked{" "}
              <EtDateTime
                value={domain.last_checked_at}
                fallback="never"
                className="text-body text-fg-muted"
              />
            </p>
            {canManage ? (
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={check.isPending || actionsDisabled}
                title={mutationDisabled.title}
                onClick={() => check.mutate()}
                data-testid="domains-check-now"
              >
                {check.isPending ? "Checking…" : "Check now"}
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          className="rounded-md border border-border bg-surface"
          aria-labelledby="domains-dns-heading"
          data-testid="domains-dns-records"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="space-y-0.5">
              <h2
                id="domains-dns-heading"
                className="text-body font-semibold text-fg"
              >
                DNS records
              </h2>
              <p className="text-caption text-fg-muted">
                {dnsProgressLabel(progress)}
              </p>
            </div>
            {domain.dns_records.length > 0 ? (
              <CopyButton
                variant="text"
                label="all DNS records"
                value={formatDnsRecordsForCopy(domain.dns_records)}
                testId="domains-copy-all"
              >
                Copy all records
              </CopyButton>
            ) : null}
          </header>

          {domain.dns_records.length === 0 ? (
            <p className="px-5 py-8 text-center text-body text-fg-muted">
              No DNS records for this domain.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Purpose</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Value</TableHead>
                  <TableHead scope="col">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domain.dns_records.map((record) => (
                  <TableRow
                    key={record.id}
                    data-testid={`domains-dns-row-${record.id}`}
                  >
                    <TableCell className="font-medium">
                      {dnsPurposeLabel(record, domain.name)}
                    </TableCell>
                    <TableCell className="font-mono text-caption">
                      {record.record_type}
                    </TableCell>
                    <TableCell className="max-w-64 align-top whitespace-normal">
                      <span className="flex items-start gap-1">
                        <code className="font-mono text-caption break-all">
                          {record.name}
                        </code>
                        <CopyButton
                          label={`${dnsPurposeLabel(record, domain.name)} name`}
                          value={record.name}
                          testId={`domains-copy-name-${record.id}`}
                        />
                      </span>
                    </TableCell>
                    <TableCell className="max-w-72 align-top whitespace-normal">
                      <span className="flex items-start gap-1">
                        <code className="font-mono text-caption break-all">
                          {record.expected_value}
                        </code>
                        <CopyButton
                          label={`${dnsPurposeLabel(record, domain.name)} value`}
                          value={record.expected_value}
                          testId={`domains-copy-value-${record.id}`}
                        />
                      </span>
                    </TableCell>
                    <TableCell>
                      <DnsRecordStatusBadge status={record.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <div className="space-y-6">
          <section
            className="space-y-4 rounded-md border border-border bg-surface p-5"
            aria-labelledby="domains-steps-heading"
          >
            <h2
              id="domains-steps-heading"
              className="text-body font-semibold text-fg"
            >
              What happens next
            </h2>
            <SetupStepper steps={steps} />
          </section>

          <section
            className="space-y-2 rounded-md border border-border bg-surface p-5"
            aria-labelledby="domains-senders-heading"
            data-testid="domains-senders"
          >
            <h2
              id="domains-senders-heading"
              className="text-body font-semibold text-fg"
            >
              Senders
            </h2>
            {domain.sender_count === 0 ? (
              <p className="text-body text-fg-muted">
                No senders use this domain yet.
              </p>
            ) : (
              <p className="text-body text-fg-muted">
                <span className="font-medium text-fg tabular-nums">
                  {domain.sender_count}
                </span>{" "}
                {domain.sender_count === 1 ? "sender uses" : "senders use"} this
                domain.
              </p>
            )}
            <Link
              href="/senders"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              View senders
            </Link>
          </section>

          {canManage ? (
            <section
              className="space-y-3 rounded-md border border-err/30 bg-surface p-5"
              aria-labelledby="domains-disable-heading"
              data-testid="domains-disable"
            >
              <h2
                id="domains-disable-heading"
                className="text-body font-semibold text-fg"
              >
                Disable domain
              </h2>
              <p className="text-body text-fg-muted">
                {isDisabled
                  ? "This domain is disabled and cannot be used for new senders."
                  : "Disabled domains stop sending. Senders and routes must be deactivated first."}
              </p>
              {isDisabled ? null : (
                <ConfirmDialog
                  title="Disable domain"
                  description={`Disabling ${domain.name} stops all sending from it.`}
                  confirmLabel="Disable domain"
                  confirmPhrase={domain.name}
                  destructive
                  onConfirm={() => disable.mutate()}
                  trigger={
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={disable.isPending || actionsDisabled}
                      title={mutationDisabled.title}
                      data-testid="domains-disable-trigger"
                    >
                      Disable domain
                    </Button>
                  }
                />
              )}
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
