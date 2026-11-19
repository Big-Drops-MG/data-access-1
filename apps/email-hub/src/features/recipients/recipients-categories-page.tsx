"use client"

import { InlineErrorCard } from "@/components/app/inline-error-card"
import { PageHeader } from "@/components/app/page-header"
import { emailTypeLabel } from "@/features/recipients/labels"
import { RecipientsTabs } from "@/features/recipients/recipients-tabs"
import { useEmailCategories } from "@/features/recipients/use-email-categories"
import { isApiError } from "@/lib/api-client"
import type {
  EmailCategoryJson,
  FrequencyRuleJson,
} from "@/lib/email-categories/serialize"

function capLabel(rule: FrequencyRuleJson | undefined): string {
  if (!rule || rule.max_count == null || rule.window_days == null) {
    return "None"
  }
  return `${rule.max_count} per ${rule.window_days} days`
}

function collisionLabel(rule: FrequencyRuleJson | undefined): string {
  if (!rule || !rule.blocks_with_type || rule.min_gap_hours == null) {
    return "—"
  }
  return `Never within ${rule.min_gap_hours} h of a ${emailTypeLabel(rule.blocks_with_type).toLowerCase()}`
}

function effectiveRuleLabel(
  category: EmailCategoryJson,
  cap: FrequencyRuleJson | undefined,
  collision: FrequencyRuleJson | undefined,
  globalCap: FrequencyRuleJson | undefined
): string {
  if (category.kind === "transactional" && category.key === "thank_you") {
    return "Always sends unless hard bounced or complained"
  }
  const parts: string[] = []
  if (cap) {
    parts.push(capLabel(cap))
  }
  if (collision) {
    parts.push(
      `and not within ${collision.min_gap_hours ?? 0} h of ${emailTypeLabel(collision.blocks_with_type ?? "").toLowerCase()}`
    )
  }
  if (globalCap && category.kind === "relationship") {
    parts.push(
      `global cap ${globalCap.max_count} per ${globalCap.window_days} days applies first`
    )
  }
  return parts.length > 0 ? parts.join(" · ") : "No additional caps"
}

export function RecipientsCategoriesPage() {
  const categoriesQuery = useEmailCategories()
  const categories = categoriesQuery.data?.data ?? []
  const rules = categoriesQuery.data?.frequency_rules ?? []

  const globalCap = rules.find(
    (rule) => rule.kind === "cap" && rule.category_id == null
  )
  const globalCollision = rules.find(
    (rule) => rule.kind === "collision" && rule.category_id == null
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recipients"
        description="Preference categories decide who can opt out and how often people hear from us."
      />
      <RecipientsTabs active="categories" />

      {categoriesQuery.isError ? (
        <InlineErrorCard
          message={
            isApiError(categoriesQuery.error)
              ? categoriesQuery.error.message
              : "Could not load categories."
          }
          requestId={
            isApiError(categoriesQuery.error)
              ? categoriesQuery.error.requestId
              : null
          }
          onRetry={() => {
            void categoriesQuery.refetch()
          }}
        />
      ) : null}

      <div
        className="overflow-hidden rounded-xl border border-border bg-surface"
        data-testid="recipients-categories-table"
      >
        <table className="w-full min-w-[56rem] border-collapse text-left text-sm">
          <thead className="bg-surface-2 text-caption font-medium tracking-wide text-fg-muted uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Category</th>
              <th className="px-4 py-3 font-medium">Email types</th>
              <th className="px-4 py-3 font-medium">Opt-out</th>
              <th className="px-4 py-3 font-medium">Frequency cap</th>
              <th className="px-4 py-3 font-medium">Collision rule</th>
              <th className="px-4 py-3 font-medium">Effective rule</th>
            </tr>
          </thead>
          <tbody>
            {categoriesQuery.isPending && categories.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-fg-muted"
                >
                  Loading categories…
                </td>
              </tr>
            ) : null}
            {categories.map((category) => {
              const cap =
                rules.find(
                  (rule) =>
                    rule.kind === "cap" && rule.category_id === category.id
                ) ?? (category.kind === "relationship" ? globalCap : undefined)
              const collision =
                rules.find(
                  (rule) =>
                    rule.kind === "collision" &&
                    rule.category_id === category.id
                ) ??
                (category.key === "feedback_request"
                  ? globalCollision
                  : undefined)
              return (
                <tr
                  key={category.id}
                  className="border-t border-border"
                  data-testid="recipients-category-row"
                >
                  <td className="px-4 py-3 font-medium text-fg">
                    {category.name}
                  </td>
                  <td className="px-4 py-3">
                    <code className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[12px] text-fg">
                      {category.key}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-fg">
                    {category.kind === "transactional" &&
                    category.key === "thank_you"
                      ? "Not allowed"
                      : "Allowed"}
                  </td>
                  <td className="px-4 py-3 text-fg">{capLabel(cap)}</td>
                  <td className="px-4 py-3 text-fg">
                    {collisionLabel(collision)}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {effectiveRuleLabel(category, cap, collision, globalCap)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <aside className="flex gap-3 rounded-xl border border-border bg-surface-2/50 px-4 py-4">
        <span
          className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-info/15 text-[12px] font-semibold text-info"
          aria-hidden
        >
          i
        </span>
        <div>
          <p className="text-sm font-semibold text-fg">
            Changed through the config file
          </p>
          <p className="mt-1 text-sm text-fg-muted">
            Categories and caps live in a versioned config file and are loaded
            by the seed command, so every change is reviewed in a pull request.
          </p>
        </div>
      </aside>
    </div>
  )
}
