"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

type OnlineStatusContextValue = {
  isOnline: boolean
  /** Demo / tests: force offline without changing the browser. */
  setForcedOffline: (forced: boolean | null) => void
}

const OnlineStatusContext = createContext<OnlineStatusContextValue | null>(null)

function readNavigatorOnline(): boolean {
  if (typeof navigator === "undefined") {
    return true
  }
  return navigator.onLine
}

export function OnlineStatusProvider({
  children,
  /** When non-null, overrides navigator.onLine (tests / story wrappers). */
  forceOffline = null,
}: {
  children: ReactNode
  forceOffline?: boolean | null
}) {
  const [browserOnline, setBrowserOnline] = useState(readNavigatorOnline)
  const [userForced, setForcedOffline] = useState<boolean | null>(null)

  useEffect(() => {
    const onOnline = () => setBrowserOnline(true)
    const onOffline = () => setBrowserOnline(false)
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
  }, [])

  const forced = forceOffline ?? userForced
  const isOnline =
    forced === true ? false : forced === false ? true : browserOnline

  const value = useMemo(
    () => ({
      isOnline,
      setForcedOffline,
    }),
    [isOnline]
  )

  return (
    <OnlineStatusContext.Provider value={value}>
      {children}
    </OnlineStatusContext.Provider>
  )
}

export function useOnlineStatus(): OnlineStatusContextValue {
  const ctx = useContext(OnlineStatusContext)
  if (!ctx) {
    throw new Error("useOnlineStatus must be used within OnlineStatusProvider")
  }
  return ctx
}

/** True when mutations may run (SD#12.8 — offline disables mutations). */
export function useCanMutate(): boolean {
  return useOnlineStatus().isOnline
}

export function useMutationDisabledProps(): {
  disabled: boolean
  title?: string
} {
  const canMutate = useCanMutate()
  if (canMutate) {
    return { disabled: false }
  }
  return { disabled: true, title: "You are offline" }
}
