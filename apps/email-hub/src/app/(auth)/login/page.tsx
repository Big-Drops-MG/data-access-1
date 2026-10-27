import type { Metadata } from "next"

import { LoginView } from "@/components/auth/login-view"
import { resolveLoginError } from "@/lib/login/login-error"
import { safeNextPath } from "@/lib/login/safe-next-path"

export const metadata: Metadata = {
  title: "Sign in · EmailHub",
}

type LoginPageProps = {
  searchParams: Promise<{
    next?: string | string[]
    error?: string | string[]
  }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0]
  }
  return value
}

/** /login — Google SSO entry + generic dead ends (T-031). */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const callbackURL = safeNextPath(firstParam(params.next))
  const error = resolveLoginError(firstParam(params.error))

  return <LoginView callbackURL={callbackURL} error={error} />
}
