"use client"

import { useServerInsertedHTML } from "next/navigation"
import * as React from "react"

import {
  parseThemeChoice,
  themeBootScript,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/components/theme-script"

function systemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

function resolveTheme(theme: ThemeChoice): ResolvedTheme {
  return theme === "system" ? systemTheme() : theme
}

function readStoredTheme(): ThemeChoice {
  try {
    return parseThemeChoice(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return "system"
  }
}

const themeListeners = new Set<() => void>()

function subscribeToTheme(onStoreChange: () => void) {
  themeListeners.add(onStoreChange)
  return () => {
    themeListeners.delete(onStoreChange)
  }
}

function notifyThemeListeners() {
  for (const listener of themeListeners) {
    listener()
  }
}

function readResolvedTheme(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function readServerTheme(): ResolvedTheme {
  return "light"
}

function applyThemeClass(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.classList.remove("light", "dark")
  root.classList.add(resolved)
  root.style.colorScheme = resolved
  notifyThemeListeners()
}

function withoutThemeTransition(apply: () => void) {
  const style = document.createElement("style")
  style.appendChild(
    document.createTextNode("*,*::before,*::after{transition:none!important}")
  )
  document.head.appendChild(style)
  apply()
  window.getComputedStyle(document.body)
  window.setTimeout(() => {
    style.remove()
  }, 1)
}

function applyStoredTheme() {
  applyThemeClass(resolveTheme(readStoredTheme()))
}

function setTheme(theme: ThemeChoice) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Ignore private-mode and quota failures. The class still updates.
  }
  withoutThemeTransition(() => {
    applyThemeClass(resolveTheme(theme))
  })
}

function useTheme() {
  const resolvedTheme = React.useSyncExternalStore(
    subscribeToTheme,
    readResolvedTheme,
    readServerTheme
  )

  return { resolvedTheme, setTheme }
}

function ThemeBoot() {
  const insertedRef = React.useRef(false)

  useServerInsertedHTML(() => {
    if (insertedRef.current) {
      return null
    }
    insertedRef.current = true
    return <script id="emailhub-theme">{themeBootScript}</script>
  })

  return null
}

function ThemeProvider({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    applyStoredTheme()

    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const onPreference = () => {
      if (readStoredTheme() === "system") {
        applyStoredTheme()
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) {
        return
      }
      applyStoredTheme()
    }

    media.addEventListener("change", onPreference)
    window.addEventListener("storage", onStorage)
    return () => {
      media.removeEventListener("change", onPreference)
      window.removeEventListener("storage", onStorage)
    }
  }, [])

  return (
    <>
      <ThemeBoot />
      <ThemeHotkey />
      {children}
    </>
  )
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      const resolved = resolveTheme(readStoredTheme())
      setTheme(resolved === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [])

  return null
}

export { ThemeProvider, useTheme }
