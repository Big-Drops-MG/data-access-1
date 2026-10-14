export default function AppShellLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-svh flex-col">
      <header
        className="sticky top-0 z-40 flex h-14 items-center border-b px-6"
        data-testid="app-top-bar"
      >
        <span className="font-medium">EmailHub</span>
      </header>
      <nav
        className="sticky top-14 z-30 flex h-11 items-center border-b px-6"
        data-testid="app-tab-bar"
      >
        <span className="text-sm text-muted-foreground">
          Navigation tabs land in a later task.
        </span>
      </nav>
      <div className="mx-auto w-full max-w-360 flex-1 p-6">{children}</div>
    </div>
  )
}
