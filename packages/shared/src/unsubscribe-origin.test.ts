import { beforeEach, describe, expect, it, vi } from "vitest"

const selectLimit = vi.hoisted(() => vi.fn())

vi.mock("@workspace/db", () => ({
  unsubscribeSettings: { id: "unsubscribe_settings" },
}))

import { resolveUnsubscribeOrigin } from "./unsubscribe-origin.js"

function dbMock() {
  return {
    select: () => ({
      from: () => ({
        limit: selectLimit,
      }),
    }),
  }
}

describe("resolveUnsubscribeOrigin", () => {
  beforeEach(() => {
    selectLimit.mockReset()
  })

  it("returns the fallback when no settings row exists", async () => {
    selectLimit.mockResolvedValue([])
    await expect(
      resolveUnsubscribeOrigin(dbMock() as never, "https://hub.example.com/")
    ).resolves.toBe("https://hub.example.com")
  })

  it("returns https custom domain when verified", async () => {
    selectLimit.mockResolvedValue([
      {
        customDomain: "Unsub.Example.COM",
        customDomainStatus: "verified",
      },
    ])
    await expect(
      resolveUnsubscribeOrigin(dbMock() as never, "https://hub.example.com")
    ).resolves.toBe("https://unsub.example.com")
  })

  it("ignores pending custom domains", async () => {
    selectLimit.mockResolvedValue([
      {
        customDomain: "unsub.example.com",
        customDomainStatus: "pending",
      },
    ])
    await expect(
      resolveUnsubscribeOrigin(dbMock() as never, "https://hub.example.com")
    ).resolves.toBe("https://hub.example.com")
  })

  it("falls back when the settings query throws", async () => {
    selectLimit.mockRejectedValue(new Error("relation missing"))
    await expect(
      resolveUnsubscribeOrigin(dbMock() as never, "https://hub.example.com")
    ).resolves.toBe("https://hub.example.com")
  })
})
