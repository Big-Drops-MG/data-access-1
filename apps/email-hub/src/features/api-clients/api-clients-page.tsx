"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { DataTable } from "@/components/app/data-table"
import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import {
  disableApiClient,
  rotateApiClientSecret,
  type ApiClientSecretReveal,
} from "@/features/api-clients/api"
import {
  apiClientsColumns,
  type ApiClientRow,
} from "@/features/api-clients/api-clients-columns"
import { apiClientsPrimaryControl } from "@/features/api-clients/api-clients-ui"
import { CreateApiClientDialog } from "@/features/api-clients/create-api-client-dialog"
import { SecretRevealDialog } from "@/features/api-clients/secret-reveal-dialog"
import { useApiClientsList } from "@/features/api-clients/use-api-clients-list"
import { isApiError } from "@/lib/api-client"
import { useDataTableUrlState } from "@/lib/data-table/use-data-table-url-state"
import { listQueryKey } from "@/lib/query-keys"

export function ApiClientsPage() {
  const queryClient = useQueryClient()
  const tableState = useDataTableUrlState({ filterKeys: [] })
  const list = useApiClientsList()
  const [createOpen, setCreateOpen] = useState(false)
  const [secretClient, setSecretClient] =
    useState<ApiClientSecretReveal | null>(null)
  const [secretTitle, setSecretTitle] = useState("Save this secret")
  const [secretDescription, setSecretDescription] = useState(
    "This secret is shown once. Store it in your secret manager before closing."
  )

  const rows = useMemo(
    (): ApiClientRow[] => list.data?.api_clients ?? [],
    [list.data?.api_clients]
  )

  const rotateMutation = useMutation({
    mutationFn: (row: ApiClientRow) => rotateApiClientSecret(row.id),
    onSuccess: async (rotated) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("api-clients"),
      })
      setSecretTitle("Secret rotated")
      setSecretDescription(
        "Copy the new secret now. The previous secret stays valid for 24 hours."
      )
      setSecretClient(rotated)
      toast.success("API client secret rotated")
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not rotate API client secret"
      )
    },
  })

  const disableMutation = useMutation({
    mutationFn: (row: ApiClientRow) => disableApiClient(row.id),
    onSuccess: async (disabled) => {
      await queryClient.invalidateQueries({
        queryKey: listQueryKey("api-clients"),
      })
      toast.success(
        disabled.already_disabled
          ? "API client was already disabled"
          : "API client disabled"
      )
    },
    onError: (error) => {
      toast.error(
        isApiError(error) ? error.message : "Could not disable API client"
      )
    },
  })

  function rowActions(row: ApiClientRow) {
    if (row.status !== "active") {
      return [
        {
          id: "disabled",
          label: "Disabled",
          onSelect: () => {
            toast.message("This client is already disabled")
          },
        },
      ]
    }

    return [
      {
        id: "rotate",
        label: "Rotate secret",
        confirm: {
          title: "Rotate this secret?",
          description: `${row.name} gets a new secret. The old one stays valid for 24 hours.`,
          confirmLabel: "Rotate",
        },
        onSelect: (selected: ApiClientRow) => {
          rotateMutation.mutate(selected)
        },
      },
      {
        id: "disable",
        label: "Disable",
        destructive: true,
        confirm: {
          title: "Disable this API client?",
          description: `${row.name} will stop authenticating immediately. This cannot be undone from the UI.`,
          confirmLabel: "Disable",
        },
        onSelect: (selected: ApiClientRow) => {
          disableMutation.mutate(selected)
        },
      },
    ]
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API clients"
        description="Machine keys for /api/ext integrations. Create a client with arohaa:webhook for Arohaa tier sync."
        actions={
          <button
            type="button"
            className={apiClientsPrimaryControl()}
            data-testid="api-clients-create"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-3.5" strokeWidth={2} aria-hidden />
            New client
          </button>
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load API clients."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <DataTable
        storageKey="api-clients"
        columns={apiClientsColumns}
        data={rows}
        getRowId={(row) => row.id}
        nextCursor={null}
        pageSize={tableState.limit}
        onPageSizeChange={tableState.setLimit}
        onNextPage={tableState.goNext}
        onPreviousPage={tableState.goPrevious}
        canPreviousPage={false}
        isLoading={list.isPending && !list.data}
        showColumnToggle={false}
        equalColumnWidths
        animateRows
        rowActions={rowActions}
        testIdPrefix="api-clients"
        emptyState={
          <p
            className="px-4 py-10 text-center text-body text-fg-muted"
            data-testid="api-clients-empty"
          >
            No API clients yet. Create one to hand credentials to Arohaa or
            other integrations.
          </p>
        }
      />

      <CreateApiClientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => {
          setSecretTitle("Save this secret")
          setSecretDescription(
            "This secret is shown once. Store it in your secret manager before closing."
          )
          setSecretClient(created)
        }}
      />

      <SecretRevealDialog
        open={secretClient != null}
        client={secretClient}
        title={secretTitle}
        description={secretDescription}
        onOpenChange={(open) => {
          if (!open) {
            setSecretClient(null)
          }
        }}
      />
    </div>
  )
}
