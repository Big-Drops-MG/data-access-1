import type { Metadata } from "next"
import localFont from "next/font/local"
import { headers } from "next/headers"

import "@workspace/ui/globals.css"
import { AppProviders } from "@/components/app/app-providers"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"

export const metadata: Metadata = {
  title: {
    default: "EmailHub",
    template: "%s · EmailHub",
  },
  description: "EmailHub by DataAccess1",
}

const inter = localFont({
  src: "./fonts/inter-latin-wght-normal.woff2",
  variable: "--font-inter",
  weight: "400 700",
  display: "swap",
})

const jetbrainsMono = localFont({
  src: "./fonts/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "400 600",
  display: "swap",
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const requestId = (await headers()).get("x-request-id")

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased",
        inter.variable,
        jetbrainsMono.variable
      )}
    >
      <head>
        {requestId ? <meta name="x-request-id" content={requestId} /> : null}
      </head>
      <body>
        <ThemeProvider>
          <AppProviders>{children}</AppProviders>
        </ThemeProvider>
      </body>
    </html>
  )
}
