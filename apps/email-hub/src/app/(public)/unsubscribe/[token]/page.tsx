import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadServerEnv, verifyUnsubscribeToken } from "@workspace/shared"

import { AuthCard } from "@/components/auth/auth-card"
import { loadUnsubscribeContext } from "@/features/unsubscribe/load-unsubscribe-context"
import { unsubscribeExpiredMessage } from "@/features/unsubscribe/unsubscribe-copy"
import { UnsubscribeForm } from "@/features/unsubscribe/unsubscribe-form"

export const metadata: Metadata = {
  title: "Unsubscribe",
}

type UnsubscribePageProps = {
  params: Promise<{ token: string }>
}

export default async function UnsubscribePage({
  params,
}: UnsubscribePageProps) {
  const { token } = await params
  const env = loadServerEnv("web")
  const verification = verifyUnsubscribeToken(
    [env.UNSUBSCRIBE_TOKEN_SECRET, env.UNSUBSCRIBE_TOKEN_SECRET_PREVIOUS],
    token
  )

  if (verification.status === "invalid") {
    notFound()
  }

  if (verification.status === "expired") {
    return (
      <div data-testid="unsubscribe-expired">
        <AuthCard
          title="Link expired"
          description={unsubscribeExpiredMessage()}
        >
          <p className="text-center text-sm text-fg-muted">
            You can close this page.
          </p>
        </AuthCard>
      </div>
    )
  }

  const context = await loadUnsubscribeContext(verification.messageId)

  return (
    <UnsubscribeForm
      token={token}
      categoryName={context?.categoryName ?? null}
    />
  )
}
