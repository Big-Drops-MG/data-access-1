import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Database } from "@workspace/db/client"
import type * as SharedModule from "@workspace/shared"

const writeAudit = vi.hoisted(() => vi.fn())
const deleteTrustedDevicesForUser = vi.hoisted(() => vi.fn())

vi.mock("@workspace/shared", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof SharedModule
  return { ...actual, writeAudit }
})

vi.mock("@/lib/auth/trusted-device", () => ({
  deleteTrustedDevicesForUser,
}))

import { encodeInvitationValue } from "./invitation"
import { deleteUser, listUsers, revokeInvitation } from "./service"

const actorId = "019a0000-0000-7000-8000-0000000000aa"
const targetId = "019a0000-0000-7000-8000-000000000003"
const inviteId = "019a0000-0000-7000-8000-000000000005"
const actor = { userId: actorId, requestId: "req-manage" }

describe("users service list/revoke/delete", () => {
  beforeEach(() => {
    writeAudit.mockReset()
    deleteTrustedDevicesForUser.mockReset()
    deleteTrustedDevicesForUser.mockResolvedValue(undefined)
  })

  it("lists active users, pending invitations, and deactivated users in order", async () => {
    const now = new Date("2026-11-12T12:00:00.000Z")
    const selectResults = [
      [
        {
          id: "u-disabled",
          email: "old@bigdropsmarketing.com",
          name: "Old",
          role: "viewer",
          status: "deactivated",
          twoFactorEnabled: false,
        },
        {
          id: "u-active",
          email: "sami@bigdropsmarketing.com",
          name: "Sami",
          role: "admin",
          status: "active",
          twoFactorEnabled: true,
        },
      ],
      [
        {
          userId: "u-active",
          failedAttempts: 0,
          lockedUntil: null,
          lockoutStep: 0,
          adminResetRequired: true,
        },
      ],
      [
        {
          userId: "u-active",
          lastSignInAt: new Date("2026-11-12T09:00:00.000Z"),
        },
      ],
      [
        {
          id: inviteId,
          identifier: "user-invite:nidhi@bigdropsmarketing.com",
          value: encodeInvitationValue("operator", "secret-token"),
          expiresAt: new Date("2026-11-19T12:00:00.000Z"),
        },
      ],
    ]
    let selectIdx = 0
    const db = {
      select: () => {
        const rows = selectResults[selectIdx++] ?? []
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => chain,
          groupBy: () => chain,
          orderBy: () => Promise.resolve(rows),
          then: (resolve: (v: unknown) => void) => resolve(rows),
        }
        return chain
      },
    } as unknown as Database

    const result = await listUsers(db, now)
    expect(result.map((u) => u.status)).toEqual([
      "active",
      "invited",
      "deactivated",
    ])
    expect(result[0]).toMatchObject({
      id: "u-active",
      last_sign_in_at: "2026-11-12T09:00:00.000Z",
    })
    expect(result[1]).toMatchObject({
      id: inviteId,
      email: "nidhi@bigdropsmarketing.com",
      role: "operator",
      status: "invited",
    })
  })

  it("revokes an existing invitation and throws 404 when missing", async () => {
    const makeTx = (rows: unknown[]) => ({
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => ({
              for: async () => rows,
            }),
          }),
        }),
      }),
      delete: () => ({
        where: async () => undefined,
      }),
    })

    const dbMissing = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx([])),
    } as unknown as Database
    await expect(
      revokeInvitation(inviteId, actor, dbMissing)
    ).rejects.toMatchObject({ code: "not_found", status: 404 })

    const dbFound = {
      transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(
          makeTx([
            {
              id: inviteId,
              identifier: "user-invite:nidhi@bigdropsmarketing.com",
              value: encodeInvitationValue("operator", "secret-token"),
              expiresAt: new Date("2026-11-19T12:00:00.000Z"),
            },
          ])
        ),
    } as unknown as Database

    await expect(revokeInvitation(inviteId, actor, dbFound)).resolves.toEqual({
      id: inviteId,
      deleted: true,
    })
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user.invitation_revoked",
        objectId: inviteId,
      })
    )
  })

  it("enforces self-delete, last-admin, FK conflict, and deletes a user", async () => {
    await expect(
      deleteUser(actorId, actor, {} as Database)
    ).rejects.toMatchObject({ code: "forbidden", status: 403 })

    const makeDeleteDb = (
      targetRows: unknown[],
      adminRows: unknown[] = [],
      throwFk = false
    ) => {
      let selectCall = 0
      const tx = {
        execute: async () => undefined,
        select: () => {
          const idx = selectCall++
          return {
            from: () => ({
              where: () =>
                idx === 0
                  ? { limit: () => ({ for: async () => targetRows }) }
                  : { orderBy: () => ({ for: async () => adminRows }) },
            }),
          }
        },
        delete: () => ({
          where: async () => {
            if (throwFk) {
              throw { code: "23503" }
            }
          },
        }),
      }
      return {
        transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      } as unknown as Database
    }

    await expect(
      deleteUser(targetId, actor, makeDeleteDb([]))
    ).rejects.toMatchObject({ code: "not_found", status: 404 })

    await expect(
      deleteUser(
        targetId,
        actor,
        makeDeleteDb(
          [
            {
              id: targetId,
              email: "a@bigdropsmarketing.com",
              role: "admin",
              status: "active",
            },
          ],
          [{ id: targetId }]
        )
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })

    await expect(
      deleteUser(
        targetId,
        actor,
        makeDeleteDb(
          [
            {
              id: targetId,
              email: "op@bigdropsmarketing.com",
              role: "operator",
              status: "active",
            },
          ],
          [],
          true
        )
      )
    ).rejects.toMatchObject({ code: "conflict", status: 409 })

    await expect(
      deleteUser(
        targetId,
        actor,
        makeDeleteDb([
          {
            id: targetId,
            email: "op@bigdropsmarketing.com",
            role: "operator",
            status: "active",
          },
        ])
      )
    ).resolves.toEqual({ id: targetId, deleted: true })
    expect(writeAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "user.deleted",
        objectId: targetId,
      })
    )
  })
})
