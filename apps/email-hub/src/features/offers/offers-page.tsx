"use client"

import { useQuery } from "@tanstack/react-query"
import Link from "next/link"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { fetchOffers } from "@/features/offers/api"
import {
  offersOutlineControl,
  offersPrimaryControl,
} from "@/features/offers/offers-ui"
import { isApiError } from "@/lib/api-client"
import { listQueryKey } from "@/lib/query-keys"

type OffersPageProps = {
  canImportOffer?: boolean
}

export function OffersPage({ canImportOffer = false }: OffersPageProps) {
  const list = useQuery({
    queryKey: listQueryKey("offers", { status: "active", limit: 200 }),
    queryFn: () => fetchOffers({ status: "active", limit: 200 }),
  })

  const rows = list.data?.data ?? []

  return (
    <div className="space-y-6" data-testid="offers-page">
      <PageHeader
        title="Offers"
        description="Everflow offers used for engagement sends and suppression sync."
        actions={
          canImportOffer ? (
            <Link
              href="/offers/new"
              className={offersPrimaryControl()}
              data-testid="offers-import"
            >
              Import offer
            </Link>
          ) : undefined
        }
      />

      {list.isError ? (
        <InlineErrorCard
          message={
            isApiError(list.error)
              ? list.error.message
              : "Could not load offers."
          }
          requestId={isApiError(list.error) ? list.error.requestId : null}
          onRetry={() => {
            void list.refetch()
          }}
        />
      ) : null}

      <section
        aria-label="Offer list"
        className="overflow-hidden rounded-xl border border-border bg-surface"
      >
        <table className="w-full border-collapse text-left text-sm">
          <thead className="border-b border-border bg-surface-2 text-[12px] tracking-wide text-fg-muted uppercase">
            <tr>
              <th scope="col" className="px-4 py-3 font-medium">
                Name
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Everflow ID
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Status
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Mailer key
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Last synced
              </th>
            </tr>
          </thead>
          <tbody>
            {list.isLoading ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-fg-muted"
                  data-testid="offers-list-loading"
                >
                  Loading offers…
                </td>
              </tr>
            ) : null}
            {!list.isLoading && rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-fg-muted">
                  No offers yet.
                  {canImportOffer ? (
                    <>
                      {" "}
                      <Link href="/offers/new" className="underline">
                        Import offer
                      </Link>
                    </>
                  ) : null}
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-4 py-3 font-medium text-fg">{row.name}</td>
                <td className="px-4 py-3 text-fg-muted">
                  {row.everflow_offer_id ?? row.external_ref}
                </td>
                <td className="px-4 py-3 text-fg-muted capitalize">
                  {row.status}
                </td>
                <td className="px-4 py-3 text-fg-muted">
                  {row.has_optizmo_mailer_access_key ? "Stored" : "Missing"}
                </td>
                <td className="px-4 py-3 text-fg-muted">
                  {row.last_synced_at
                    ? new Date(row.last_synced_at).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {canImportOffer ? (
        <p className="text-sm text-fg-muted">
          Need another campaign?{" "}
          <Link
            href="/offers/new"
            className={offersOutlineControl(
              "border-0 bg-transparent px-0 shadow-none hover:bg-transparent"
            )}
          >
            Import offer
          </Link>
        </p>
      ) : null}
    </div>
  )
}
