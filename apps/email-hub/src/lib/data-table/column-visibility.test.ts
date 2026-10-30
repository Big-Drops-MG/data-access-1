import { afterEach, describe, expect, it, vi } from "vitest"

import {
  columnVisibilityStorageKey,
  readColumnVisibility,
  writeColumnVisibility,
} from "@/lib/data-table/column-visibility"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("column visibility storage", () => {
  it("uses a namespaced key", () => {
    expect(columnVisibilityStorageKey("domains")).toBe(
      "email-hub:datatable:columns:domains"
    )
  })

  it("reads and writes visibility with try/catch fallbacks", () => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    })

    expect(readColumnVisibility("domains")).toEqual({})
    writeColumnVisibility("domains", { name: true, status: false })
    expect(readColumnVisibility("domains")).toEqual({
      name: true,
      status: false,
    })
  })

  it("returns empty object when localStorage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    })

    expect(readColumnVisibility("domains")).toEqual({})
    expect(() =>
      writeColumnVisibility("domains", { name: false })
    ).not.toThrow()
  })
})
