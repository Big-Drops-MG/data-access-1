"use client"

import { useMutation } from "@tanstack/react-query"
import { Globe } from "lucide-react"

import { EmptyState } from "@/components/app/empty-state"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { useDomainsList } from "@/features/domains/use-domains-list"
import { ApiError, isApiError } from "@/lib/api-client"
import { listQueryKey } from "@/lib/query-keys"
import { Button } from "@workspace/ui/components/button"

/**
 * Domains module using TanStack Query + apiFetch (T-050 Done When).
 * List API is empty until Domains CRUD; conflict mutation proves global 409 UX.
 */
export function DomainsPage() {
  const list = useDomainsList()

  const conflictProbe = useMutation({
    mutationFn: async () => {
      throw new ApiError("Conflict", 409, "conflict", "demo-req", [
        { path: "version", message: "Stale version" },
      ])
    },
    meta: {
      conflictInvalidateKeys: [listQueryKey("domains")],
    },
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Domains"
        description="Sending domains for Email Hub."
        actions={
          <Button
            type="button"
            variant="outline"
            onClick={() => conflictProbe.mutate()}
            data-testid="domains-conflict-probe"
          >
            Simulate conflict
          </Button>
        }
      />

      {list.isPending ? (
        <div
          className="h-40 animate-pulse rounded-md bg-surface-2"
          data-testid="domains-list-loading"
          aria-hidden
        />
      ) : null}

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load domains."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      {list.isSuccess && list.data.data.length === 0 ? (
        <EmptyState
          icon={<Globe strokeWidth={1.75} />}
          title="No domains yet"
          description="When you add a sending domain, it will show up here."
        />
      ) : null}

      {list.isSuccess && list.data.data.length > 0 ? (
        <ul className="divide-y divide-border rounded-md border border-border">
          {list.data.data.map((domain) => (
            <li
              key={domain.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
              data-testid="domains-list-row"
            >
              <span className="font-medium text-fg">{domain.name}</span>
              <span className="text-fg-muted">{domain.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
