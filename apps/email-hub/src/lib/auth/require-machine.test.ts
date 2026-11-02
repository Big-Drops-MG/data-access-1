import { beforeEach, describe, expect, it, vi } from "vitest"

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
  it("allows session-only staff requests", () => {
    expect(() =>
      assertStaffApiCaller(new Request("http://localhost/api/admin"))
    ).not.toThrow()
  })

  it("rejects machine keys on staff APIs", () => {
    expect(() =>
      assertStaffApiCaller(
        new Request("http://localhost/api/admin", {
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
