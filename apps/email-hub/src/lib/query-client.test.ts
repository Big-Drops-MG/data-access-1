import { describe, expect, it, vi } from "vitest"

import { ApiError } from "./api-client.js"
import { registerConflictPresenter } from "./conflict-bridge.js"
import {
  DETAIL_STALE_TIME_MS,
  LIST_STALE_TIME_MS,
  createQueryClient,
} from "./query-client.js"

describe("createQueryClient", () => {
  it("defaults list stale time and refetches on focus", () => {
    const client = createQueryClient()
    const defaults = client.getDefaultOptions().queries
    expect(LIST_STALE_TIME_MS).toBe(30_000)
    expect(DETAIL_STALE_TIME_MS).toBe(0)
    expect(defaults?.staleTime).toBe(LIST_STALE_TIME_MS)
    expect(defaults?.refetchOnWindowFocus).toBe(true)
  })

  it("does not retry client ApiErrors", () => {
    const client = createQueryClient()
    const retry = client.getDefaultOptions().queries?.retry
    expect(typeof retry).toBe("function")
    if (typeof retry !== "function") {
      return
    }
    expect(retry(0, new ApiError("Nope", 422, "validation_failed"))).toBe(false)
    expect(retry(0, new Error("network"))).toBe(true)
    expect(retry(2, new Error("network"))).toBe(false)
  })

  it("opens the conflict presenter on mutation 409", async () => {
    const present = vi.fn()
    registerConflictPresenter(present)
    const client = createQueryClient()

    try {
      await client
        .getMutationCache()
        .build(client, {
          mutationFn: async () => {
            throw new ApiError("Conflict", 409, "conflict")
          },
        })
        .execute({})
    } catch {
      // expected
    }

    expect(present).toHaveBeenCalledTimes(1)
    registerConflictPresenter(null)
  })

  it("skips the conflict dialog when meta.skipConflictDialog is set", async () => {
    const present = vi.fn()
    registerConflictPresenter(present)
    const client = createQueryClient()

    try {
      await client
        .getMutationCache()
        .build(client, {
          mutationFn: async () => {
            throw new ApiError("Conflict", 409, "conflict")
          },
          meta: { skipConflictDialog: true },
        })
        .execute({})
    } catch {
      // expected
    }

    expect(present).not.toHaveBeenCalled()
    registerConflictPresenter(null)
  })
})
