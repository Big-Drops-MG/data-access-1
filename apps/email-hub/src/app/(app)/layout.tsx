import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { AppTabs } from "@/components/app/app-tabs"
import { AppTopBar } from "@/components/app/app-top-bar"
import { OfflineBanner } from "@/components/app/offline-banner"
import { OnlineStatusProvider } from "@/components/app/online-status"
import { getSession } from "@/lib/auth"
import { buildLoginPath } from "@/lib/login/login-path"

export default async function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getSession()
  const headerStore = await headers()
  const pathname =
    headerStore.get("x-pathname") ?? headerStore.get("x-url") ?? "/dashboard"
  const returnPath = pathname.startsWith("/") ? pathname : "/dashboard"

  if (!session) {
    redirect(buildLoginPath({ next: returnPath }))
  }
  if (!session.twoFactorEnabled) {
    redirect(`/login/2fa-setup?next=${encodeURIComponent(returnPath)}`)
  }
  if (!session.jobTitle) {
    redirect("/onboarding")
  }

  return (
    <OnlineStatusProvider>
      <div className="flex min-h-svh min-w-[1280px] flex-col bg-bg text-fg">
        <OfflineBanner />
        <AppTopBar
          name={session.name}
          jobTitle={session.jobTitle}
          image={session.image}
        />
        <AppTabs />
        <div className="mx-auto w-full max-w-360 flex-1 p-6">{children}</div>
      </div>
    </OnlineStatusProvider>
  )
}
