"use client"

import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

type OnlineStatusContextValue = {
  isOnline: boolean
  /** Demo / tests: force offline without changing the browser. */
  setForcedOffline: (forced: boolean | null) => void
}

const OnlineStatusContext = createContext<OnlineStatusContextValue | null>(null)

function subscribeToOnlineStatus(onStoreChange: () => void) {
  window.addEventListener("online", onStoreChange)
  window.addEventListener("offline", onStoreChange)
  return () => {
    window.removeEventListener("online", onStoreChange)
    window.removeEventListener("offline", onStoreChange)
  }
}

function readBrowserOnline() {
  return navigator.onLine
}

function readServerOnline() {
  return true
}

export function OnlineStatusProvider({
  children,
  /** When non-null, overrides navigator.onLine (tests / story wrappers). */
  forceOffline = null,
}: {
  children: ReactNode
  forceOffline?: boolean | null
}) {
  const browserOnline = useSyncExternalStore(
    subscribeToOnlineStatus,
    readBrowserOnline,
    readServerOnline
  )
  const [userForced, setForcedOffline] = useState<boolean | null>(null)

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
