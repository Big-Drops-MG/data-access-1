import { OfflineBanner } from "@/components/app/offline-banner"
import { OnlineStatusProvider } from "@/components/app/online-status"

export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <OnlineStatusProvider>
      <div className="flex min-h-svh min-w-[1280px] flex-col bg-bg text-fg">
        <OfflineBanner />
        <header
          className="sticky top-0 z-10 flex h-14 items-center border-b border-topbar-line bg-topbar px-6 text-topbar-fg"
          data-testid="app-top-bar"
        >
          <span className="text-body font-medium">EmailHub</span>
          <span className="ml-3 rounded-sm bg-env-dev px-2 py-0.5 text-caption font-medium text-on-env-dev">
            DEV
          </span>
        </header>
        <nav
          className="sticky top-14 z-10 flex h-11 items-center gap-6 border-b border-border bg-surface px-6"
          data-testid="app-tab-bar"
        >
          <span className="border-b-2 border-accent pb-2.5 text-sm font-medium text-fg">
            Dashboard
          </span>
          <span className="pb-2.5 text-sm text-fg-muted">
            Navigation tabs land in a later task.
          </span>
        </nav>
        <div className="mx-auto w-full max-w-360 flex-1 p-6">{children}</div>
      </div>
    </OnlineStatusProvider>
  )
}
