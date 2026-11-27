import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

type ModuleSection = {
  id: string
  label: string
  href: string
}

export function ModuleSectionNav({
  label,
  current,
  items,
  testId,
}: {
  label: string
  current: string
  items: readonly ModuleSection[]
  testId: string
}) {
  return (
    <nav aria-label={label} data-testid={testId}>
      <ul className="flex flex-wrap items-center gap-5 border-b border-border">
        {items.map((item) => {
          const active = item.id === current
          return (
            <li key={item.id}>
              <Link
                href={item.href}
                className={cn(
                  "relative inline-flex items-center border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors outline-none",
                  active
                    ? "border-fg text-fg"
                    : "border-transparent text-fg-muted hover:text-fg"
                )}
                aria-current={active ? "page" : undefined}
                data-testid={`${testId}-${item.id}`}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
