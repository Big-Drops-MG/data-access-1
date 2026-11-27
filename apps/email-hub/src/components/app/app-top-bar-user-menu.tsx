"use client"

import Image from "next/image"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import {
  ChevronDownIcon,
  LogOutIcon,
  MoonIcon,
  Settings2Icon,
  SunIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"

import { Button, buttonVariants } from "@workspace/ui/components/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { cn } from "@workspace/ui/lib/utils"

import { useTheme } from "@/components/theme-provider"
import { visibleAdminNavItems } from "@/lib/app-nav"
import { authClient } from "@/lib/auth-client"
import type { AppRole } from "@/lib/permissions"

type AppTopBarUserMenuProps = {
  name: string
  jobTitle: string
  image: string | null
  role: AppRole
}

const MENU_LINKS = [
  {
    label: "Ops",
    href: "/ops",
    icon: Settings2Icon,
    testId: "app-top-bar-ops",
  },
  { label: "Team", href: "/team", icon: UsersIcon, testId: "app-top-bar-team" },
  {
    label: "Profile",
    href: "/profile",
    icon: UserIcon,
    testId: "app-top-bar-profile",
  },
] as const

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return "?"
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase()
  }
  return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase()
}

/** Avatar + name/role trigger with account links, theme toggle, and sign out. */
export function AppTopBarUserMenu({
  name,
  jobTitle,
  image,
  role,
}: AppTopBarUserMenuProps) {
  const adminItems = visibleAdminNavItems(role)
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [signingOut, setSigningOut] = useState(false)
  const busy = pending || signingOut

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
      startTransition(() => {
        router.replace("/login")
        router.refresh()
      })
    } finally {
      setSigningOut(false)
      setOpen(false)
    }
  }

  function toggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark")
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setAdminOpen(false)
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur()
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex h-auto items-center gap-3 rounded-lg px-1.5 py-1 text-left outline-none",
              "hover:bg-muted/60",
              "focus:outline-none focus-visible:border-transparent focus-visible:ring-0 focus-visible:outline-none",
              "aria-expanded:bg-transparent"
            )}
            data-testid="app-top-bar-user-menu"
            aria-label={`Account menu for ${name}`}
          />
        }
      >
        <UserAvatar name={name} image={image} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-fg">
            {name}
          </span>
          <span className="block truncate text-caption font-normal text-fg-muted">
            {jobTitle}
          </span>
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className={cn(
          "z-50 w-48 gap-0.5 border border-border-strong bg-surface-2 p-1.5 shadow-lg",
          "ring-1 ring-black/5 dark:border-border-strong dark:bg-surface-2",
          "dark:shadow-[0_12px_40px_rgb(0_0_0_/_0.55)] dark:ring-white/12"
        )}
        data-testid="app-top-bar-user-menu-panel"
      >
        {adminItems.length > 0 ? (
          <div data-testid="app-top-bar-admin">
            <Button
              type="button"
              variant="ghost"
              className="w-full justify-between"
              aria-expanded={adminOpen}
              aria-controls="app-top-bar-admin-menu"
              onClick={() => setAdminOpen((current) => !current)}
            >
              Admin
              <ChevronDownIcon
                className={cn(
                  "size-4 transition-transform",
                  adminOpen && "rotate-180"
                )}
                aria-hidden
              />
            </Button>
            {adminOpen ? (
              <ul
                id="app-top-bar-admin-menu"
                className="m-0 list-none p-0"
                data-testid="app-top-bar-admin-menu"
              >
                {adminItems.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        buttonVariants({ variant: "ghost" }),
                        "w-full justify-start pl-6"
                      )}
                      data-testid={`app-top-bar-admin-${item.href.split("/").pop()}`}
                    >
                      {item.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="my-1 border-t border-border" role="separator" />
          </div>
        ) : null}
        {MENU_LINKS.map(({ label, href, icon: Icon, testId }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setOpen(false)}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "w-full justify-start gap-2"
            )}
            data-testid={testId}
          >
            <Icon />
            {label}
          </Link>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={toggleTheme}
          data-testid="app-top-bar-theme-toggle"
        >
          {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          {resolvedTheme === "dark" ? "Light theme" : "Dark theme"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => void handleSignOut()}
          disabled={busy}
          data-testid="app-top-bar-sign-out"
        >
          <LogOutIcon />
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

function UserAvatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        width={36}
        height={36}
        className="size-9 shrink-0 rounded-full object-cover"
        data-testid="app-top-bar-avatar"
        unoptimized
      />
    )
  }

  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#00173a] text-caption font-semibold text-white"
      aria-hidden
      data-testid="app-top-bar-avatar"
    >
      {initialsFromName(name)}
    </span>
  )
}
