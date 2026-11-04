"use client"

import { useRouter } from "next/navigation"

import { PageHeader } from "@/components/app/page-header"
import { CreateDomainForm } from "@/features/domains/create-domain-form"
import { SetupStepper } from "@/features/domains/setup-stepper"
import type { SetupStepView } from "@/features/domains/domain-setup-summary"

const NEXT_STEPS: readonly SetupStepView[] = [
  {
    key: "ses_identity",
    title: "Identity created in SES",
    description: "We create the identity and its DKIM keys in Amazon SES.",
    state: "pending",
  },
  {
    key: "dns_records",
    title: "DNS records in Cloudflare",
    description:
      "Auto-written when CLOUDFLARE_API_TOKEN is set; otherwise copy DKIM, SPF, and DMARC from the detail page.",
    state: "pending",
  },
  {
    key: "verification",
    title: "Records verified",
    description: "We re-check every 6 hours until every record resolves.",
    state: "pending",
  },
]

export function CreateDomainPage() {
  const router = useRouter()

  return (
    <div className="space-y-6" data-testid="domains-create-page">
      <PageHeader
        title="Add domain"
        breadcrumbs={[
          { label: "Domains", href: "/domains" },
          { label: "Add domain" },
        ]}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(16rem,3fr)]">
        <CreateDomainForm
          onSuccess={(name) => {
            router.push(`/domains/${encodeURIComponent(name)}`)
          }}
        />

        <aside
          className="space-y-4 rounded-md border border-border bg-surface p-6"
          aria-labelledby="domains-next-steps-heading"
        >
          <h2
            id="domains-next-steps-heading"
            className="text-body font-semibold text-fg"
          >
            What happens next
          </h2>
          <SetupStepper steps={NEXT_STEPS} />
        </aside>
      </div>
    </div>
  )
}
