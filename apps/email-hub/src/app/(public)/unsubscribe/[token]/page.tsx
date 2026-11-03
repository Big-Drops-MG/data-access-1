import type { Metadata } from "next"

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
  const secret = loadServerEnv("web").UNSUBSCRIBE_TOKEN_SECRET
  const messageId = secret ? verifyUnsubscribeToken(secret, token) : null
  let detail = "This unsubscribe link is not valid."
  if (secret === undefined) {
    detail = "This unsubscribe link cannot be checked."
  } else if (messageId !== null) {
    detail =
      "This unsubscribe link is valid. Confirming it does not change email preferences yet."
  }

  return (
    <section className="w-full max-w-md space-y-2 text-center">
      <h1 className="text-xl font-medium">Unsubscribe</h1>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </section>
  )
}
