import Image from "next/image"

import { cn } from "@workspace/ui/lib/utils"

type BrandMarkProps = {
  className?: string
  /** Auth cards use `lg`; top bar uses medium `md` for balance. */
  size?: "md" | "lg"
}

const sizeClass = {
  md: "h-5 w-auto",
  lg: "h-6 w-auto",
} as const

/** DA1 | EmailHub logo (theme-aware asset). */
export function BrandMark({ className, size = "lg" }: BrandMarkProps) {
  const imageClass = sizeClass[size]
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
        className={cn(imageClass, "dark:hidden")}
      />
      <Image
        src="/brand-logo-white.svg"
        alt=""
        width={150}
        height={19}
        priority
        className={cn("hidden dark:block", imageClass)}
        aria-hidden
      />
    </div>
  )
}
