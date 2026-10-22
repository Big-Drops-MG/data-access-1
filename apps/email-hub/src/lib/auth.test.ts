import { beforeEach, describe, expect, it, vi } from "vitest"

const getSessionApi = vi.fn()
const signOutApi = vi.fn()
const revokeSessionsApi = vi.fn()

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}))

vi.mock("./auth/server", () => ({
  getAuth: () => ({
    api: {
      getSession: getSessionApi,
      signOut: signOutApi,
      revokeSessions: revokeSessionsApi,
    },
  }),
}))

describe("getSession", () => {
  beforeEach(() => {
    getSessionApi.mockReset()
    signOutApi.mockReset()
    revokeSessionsApi.mockReset()
  })

  it("returns null when Better Auth has no session", async () => {
    getSessionApi.mockResolvedValue(null)
    const { getSession } = await import("./auth.js")
    await expect(getSession()).resolves.toBeNull()
  })

  it("returns the staff user when the session is valid", async () => {
    getSessionApi.mockResolvedValue({
      session: { createdAt: new Date() },
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "admin@example.com",
        name: "Admin",
        role: "admin",
        status: "active",
      },
    })
    const { getSession } = await import("./auth.js")
    await expect(getSession()).resolves.toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      email: "admin@example.com",
      name: "Admin",
      role: "admin",
    })
  })

  it("signs out and returns null past the absolute 12 h limit", async () => {
    const createdAt = new Date(Date.now() - 13 * 60 * 60 * 1000)
    getSessionApi.mockResolvedValue({
      session: { createdAt },
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "admin@example.com",
        name: "Admin",
        role: "admin",
        status: "active",
      },
    })
    signOutApi.mockResolvedValue(undefined)
    const { getSession } = await import("./auth.js")
    await expect(getSession()).resolves.toBeNull()
    expect(signOutApi).toHaveBeenCalledOnce()
  })

  it("signs out inactive users", async () => {
    getSessionApi.mockResolvedValue({
      session: { createdAt: new Date() },
      user: {
        id: "11111111-1111-1111-1111-111111111111",
        email: "admin@example.com",
        name: "Admin",
        role: "admin",
        status: "deactivated",
      },
    })
    signOutApi.mockResolvedValue(undefined)
    const { getSession } = await import("./auth.js")
    await expect(getSession()).resolves.toBeNull()
    expect(signOutApi).toHaveBeenCalledOnce()
  })
})

describe("signOut / signOutEverywhere", () => {
  beforeEach(() => {
    signOutApi.mockReset()
    revokeSessionsApi.mockReset()
  })

  it("signOut calls Better Auth signOut", async () => {
    signOutApi.mockResolvedValue(undefined)
    const { signOut } = await import("./auth.js")
    await signOut()
    expect(signOutApi).toHaveBeenCalledOnce()
  })

  it("signOutEverywhere revokes all sessions then clears the cookie", async () => {
    revokeSessionsApi.mockResolvedValue(undefined)
    signOutApi.mockResolvedValue(undefined)
    const { signOutEverywhere } = await import("./auth.js")
    await signOutEverywhere()
    expect(revokeSessionsApi).toHaveBeenCalledOnce()
    expect(signOutApi).toHaveBeenCalledOnce()
  })
})
