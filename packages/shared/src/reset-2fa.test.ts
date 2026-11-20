import { beforeEach, describe, expect, it, vi } from "vitest"

import { isAppError } from "./errors.js"

const writeAudit = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock("./audit.js", () => ({
  writeAudit,
}))

import { reset2faByEmail } from "./reset-2fa.js"

function fakeDb(options: {
  user?: { id: string; email: string; twoFactorEnabled: boolean } | null
}) {
  const updates: Array<Record<string, unknown>> = []
  let deleteCalls = 0

  const tx = {
    delete() {
      deleteCalls += 1
      const call = deleteCalls
      return {
        where() {
          return {
            returning: async () => {
              if (call === 1) return [{ id: "tf1" }]
              if (call === 3) return [{ id: "s1" }, { id: "s2" }]
              if (call === 4) return [{ id: "d1" }]
              return []
            },
          }
        },
      }
    },
    update() {
      return {
        set(values: Record<string, unknown>) {
          updates.push(values)
          return {
            where: async () => undefined,
          }
        },
      }
    },
  }

  const db = {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                limit: async () => (options.user ? [options.user] : []),
              }
            },
          }
        },
      }
    },
    async transaction<T>(fn: (inner: typeof tx) => Promise<T>) {
      return fn(tx)
    },
  }

  return { db, updates }
}

describe("reset2faByEmail", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    writeAudit.mockResolvedValue(undefined)
  })

  it("rejects an empty email", async () => {
    const { db } = fakeDb({ user: null })
    await expect(reset2faByEmail(db as never, "  ")).rejects.toSatisfy(
      (error: unknown) =>
        isAppError(error) && error.code === "validation_failed"
    )
  })

  it("returns not_found when the user does not exist", async () => {
    const { db } = fakeDb({ user: null })
    await expect(
      reset2faByEmail(db as never, "missing@example.com")
    ).rejects.toSatisfy(
      (error: unknown) => isAppError(error) && error.code === "not_found"
    )
  })

  it("clears 2FA state, trusted devices, sessions, and writes a system audit", async () => {
    const { db, updates } = fakeDb({
      user: {
        id: "u1",
        email: "admin@example.com",
        twoFactorEnabled: true,
      },
    })

    const result = await reset2faByEmail(db as never, "Admin@example.com")

    expect(result).toEqual({
      user_id: "u1",
      email: "admin@example.com",
      two_factor_deleted: true,
      trusted_devices_deleted: 1,
      sessions_deleted: 2,
    })
    expect(updates[0]).toMatchObject({ twoFactorEnabled: false })
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actor: { type: "system" },
        action: "user.two_factor_reset",
        objectId: "u1",
      })
    )
  })
})
