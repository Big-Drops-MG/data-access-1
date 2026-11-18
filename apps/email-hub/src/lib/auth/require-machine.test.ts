import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())

vi.mock("@/lib/auth", () => ({ getSession }))

import { AppError } from "@workspace/shared"

import {
  assertStaffApiCaller,
  isMachineAuthAttempt,
  requireMachineCaller,
} from "@/lib/auth/require-machine"

describe("isMachineAuthAttempt", () => {
  it("detects machine auth headers", () => {
    expect(isMachineAuthAttempt(new Request("http://localhost"))).toBe(false)
    expect(
      isMachineAuthAttempt(
        new Request("http://localhost", {
          headers: { "X-Key-Id": "k1" },
        })
      )
    ).toBe(true)
  })
})

describe("assertStaffApiCaller", () => {
  const previousAuthUrl = process.env.BETTER_AUTH_URL

  beforeEach(() => {
    process.env.BETTER_AUTH_URL = "http://localhost:3000"
  })

  afterEach(() => {
    if (previousAuthUrl === undefined) {
      delete process.env.BETTER_AUTH_URL
    } else {
      process.env.BETTER_AUTH_URL = previousAuthUrl
    }
  })

  it("allows session-only staff GET requests", () => {
    expect(() =>
      assertStaffApiCaller(new Request("http://localhost:3000/api/admin"))
    ).not.toThrow()
  })

  it("allows same-origin staff POST requests", () => {
    expect(() =>
      assertStaffApiCaller(
        new Request("http://localhost:3000/api/admin", {
          method: "POST",
          headers: { Origin: "http://localhost:3000" },
        })
      )
    ).not.toThrow()
  })

  it("rejects cross-origin staff POST requests", () => {
    expect(() =>
      assertStaffApiCaller(
        new Request("http://localhost:3000/api/admin", {
          method: "POST",
          headers: { Origin: "https://evil.example" },
        })
      )
    ).toThrow(AppError)
  })

  it("rejects machine keys on staff APIs", () => {
    expect(() =>
      assertStaffApiCaller(
        new Request("http://localhost:3000/api/admin", {
          headers: { "X-Key-Id": "k1", "X-Signature": "sig" },
        })
      )
    ).toThrow(AppError)
  })
})

describe("requireMachineCaller", () => {
  beforeEach(() => {
    getSession.mockReset()
  })

  it("rejects a session caller without machine headers", async () => {
    getSession.mockResolvedValue({
      id: "1",
      email: "a@example.com",
      name: "A",
      image: null,
      role: "admin",
      jobTitle: null,
      twoFactorEnabled: true,
    })

    await expect(
      requireMachineCaller(new Request("http://localhost/api/ext/emails/send"))
    ).rejects.toMatchObject({ code: "forbidden", status: 403 })
  })

  it("rejects anonymous callers without machine headers", async () => {
    getSession.mockResolvedValue(null)
    await expect(
      requireMachineCaller(new Request("http://localhost/api/ext/emails/send"))
    ).rejects.toMatchObject({ code: "unauthorized", status: 401 })
  })

  it("allows requests that present machine headers", async () => {
    getSession.mockResolvedValue(null)
    await expect(
      requireMachineCaller(
        new Request("http://localhost/api/ext/emails/send", {
          headers: {
            "X-Key-Id": "k1",
            "X-Timestamp": "1",
            "X-Signature": "sig",
          },
        })
      )
    ).resolves.toBeUndefined()
  })
})
