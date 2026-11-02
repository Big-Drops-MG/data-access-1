import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.hoisted(() => vi.fn())
const redirect = vi.hoisted(() => vi.fn())
vi.mock("@/lib/auth", () => ({ getSession }))
vi.mock("next/navigation", () => ({ redirect }))

import { type AppError } from "@workspace/shared"

import type { SessionUser } from "@/lib/auth"
import {
  requireRole,
  requireRoleForPage,
  requireSession,
} from "@/lib/auth/require-role"

function user(role: SessionUser["role"]): SessionUser {
  return {
    id: "u1",
    email: "a@example.com",
    name: "A",
    image: null,
    role,
    jobTitle: "Web Developer",
    twoFactorEnabled: true,
  }
}

describe("requireSession / requireRole", () => {
  beforeEach(() => {
    getSession.mockReset()
    redirect.mockReset()
    redirect.mockImplementation((url: string) => {
      throw new Error(`REDIRECT:${url}`)
    })
  })

  it("requireSession throws 401 when there is no session", async () => {
    getSession.mockResolvedValue(null)
    await expect(requireSession()).rejects.toMatchObject({
      code: "unauthorized",
      status: 401,
    } satisfies Partial<AppError>)
  })

  it("requireRole throws 403 when the role is too low", async () => {
    getSession.mockResolvedValue(user("viewer"))
    await expect(requireRole("operator")).rejects.toMatchObject({
      code: "forbidden",
      status: 403,
    } satisfies Partial<AppError>)
  })

  it("requireRole returns the session when the role is sufficient", async () => {
    const session = user("operator")
    getSession.mockResolvedValue(session)
    await expect(requireRole("operator")).resolves.toBe(session)
    await expect(requireRole("viewer")).resolves.toBe(session)
  })

  it("requireRoleForPage redirects when unauthenticated", async () => {
    getSession.mockResolvedValue(null)
    await expect(
      requireRoleForPage("viewer", { nextPath: "/reports" })
    ).rejects.toThrow("REDIRECT:/login?next=%2Freports")
  })

  it("requireRoleForPage returns forbidden for under-privileged roles", async () => {
    getSession.mockResolvedValue(user("viewer"))
    await expect(requireRoleForPage("admin")).resolves.toEqual({
      forbidden: true,
    })
  })

  it("requireRoleForPage returns the user when allowed", async () => {
    const session = user("admin")
    getSession.mockResolvedValue(session)
    await expect(requireRoleForPage("admin")).resolves.toEqual({
      user: session,
    })
  })
})
