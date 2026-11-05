import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { loadServerEnv, verifyUnsubscribeToken } from "@workspace/shared"

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

  const detail =
    verification.status === "expired"
      ? "This unsubscribe link has expired."
      : "This unsubscribe link is valid. Confirming it does not change email preferences yet."

  return (
    <section className="w-full max-w-md space-y-2 text-center">
      <h1 className="text-xl font-medium">Unsubscribe</h1>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </section>
  )
}
