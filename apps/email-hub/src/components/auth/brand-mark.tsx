import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

type BrandMarkProps = {
  className?: string
}

/** DA1 | EmailHub logo for auth surfaces (theme-aware asset). */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      aria-label="DA1 EmailHub"
    >
      <Image
        src="/brand-logo.svg"
        alt="DA1 EmailHub"
        width={150}
        height={19}
        priority
        className="h-6 w-auto dark:hidden"
      />
      <Image
        src="/brand-logo-white.svg"
        alt=""
        width={150}
        height={19}
        priority
        className="hidden h-6 w-auto dark:block"
        aria-hidden
      />
    </div>
  )
}
