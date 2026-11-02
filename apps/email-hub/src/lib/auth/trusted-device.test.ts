import { createHash } from "node:crypto"

import { PgDialect } from "drizzle-orm/pg-core"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS } from "./two-factor-policy"
import {
  acceptTrustedDevice,
  deleteTrustedDevicesForUser,
  hashTrustedDeviceToken,
  issueTrustedDevice,
  liveTrustedDeviceWhere,
} from "./trusted-device"

const db = vi.hoisted(() => {
  const values = vi.fn()
  const insert = vi.fn(() => ({ values }))

  const returning = vi.fn()
  const updateWhere = vi.fn(() => ({ returning }))
  const updateSet = vi.fn(() => ({ where: updateWhere }))
  const update = vi.fn(() => ({ set: updateSet }))

  const deleteWhere = vi.fn()
  const del = vi.fn(() => ({ where: deleteWhere }))

  return {
    values,
    insert,
    returning,
    updateWhere,
    updateSet,
    update,
    delete: del,
    deleteWhere,
    getDb: vi.fn(() => ({
      insert,
      update,
      delete: del,
    })),
  }
})

vi.mock("@workspace/db/client", () => ({
  getDb: db.getDb,
}))

describe("trusted device store", () => {
  const userId = "01900000-0000-7000-8000-000000000001"
  const now = new Date("2026-10-27T12:00:00.000Z")

  beforeEach(() => {
    vi.clearAllMocks()
    db.values.mockResolvedValue(undefined)
    db.returning.mockResolvedValue([])
    db.deleteWhere.mockResolvedValue(undefined)
  })

  it("stores a sha256 hash of a random token and a 30-day expiry", async () => {
    const issued = await issueTrustedDevice({
      userId,
      userAgent: "TestBrowser",
      now,
    })
    const expectedHash = createHash("sha256")
      .update(issued.token, "utf8")
      .digest("hex")

    expect(issued.token).not.toBe(expectedHash)
    expect(hashTrustedDeviceToken(issued.token)).toBe(expectedHash)
    expect(issued.expiresAt).toEqual(
      new Date(now.getTime() + TWO_FACTOR_TRUST_DEVICE_MAX_AGE_SECONDS * 1000)
    )
    expect(db.values).toHaveBeenCalledWith({
      userId,
      tokenHash: expectedHash,
      userAgent: "TestBrowser",
      expiresAt: issued.expiresAt,
      lastUsedAt: now,
    })
  })

  it("accepts a live hash and stamps last_used_at", async () => {
    db.returning.mockResolvedValue([{ id: "device-1" }])
    await expect(
      acceptTrustedDevice({ userId, token: "raw-token", now })
    ).resolves.toBe(true)
    expect(db.updateSet).toHaveBeenCalledWith({ lastUsedAt: now })
    expect(db.updateWhere).toHaveBeenCalled()
    expect(hashTrustedDeviceToken("raw-token")).toHaveLength(64)
  })

  it("rejects a missing, revoked, or expired token", async () => {
    await expect(
      acceptTrustedDevice({ userId, token: "missing", now })
    ).resolves.toBe(false)
    expect(db.updateSet).toHaveBeenCalledWith({ lastUsedAt: now })
  })

  it("deletes every trusted device for the user", async () => {
    await deleteTrustedDevicesForUser(userId)
    expect(db.delete).toHaveBeenCalled()
    expect(db.deleteWhere).toHaveBeenCalled()
  })

  it("issues a separate hash for each remembered browser", async () => {
    const first = await issueTrustedDevice({ userId, now })
    const second = await issueTrustedDevice({ userId, now })
    expect(first.token).not.toBe(second.token)
    expect(hashTrustedDeviceToken(first.token)).not.toBe(
      hashTrustedDeviceToken(second.token)
    )
    expect(db.values).toHaveBeenCalledTimes(2)
  })

  it("binds acceptance to this user, this hash, an open revoke flag, and a future expiry", () => {
    const token = "raw-token"
    const where = liveTrustedDeviceWhere(userId, token, now)
    expect(where).toBeDefined()
    const query = new PgDialect().sqlToQuery(where!)
    expect(query.sql.toLowerCase()).toContain('"user_id"')
    expect(query.sql.toLowerCase()).toContain('"token_hash"')
    expect(query.sql.toLowerCase()).toContain('"revoked_at" is null')
    expect(query.sql.toLowerCase()).toContain('"expires_at" >')
    expect(query.params).toContain(userId)
    expect(query.params).toContain(hashTrustedDeviceToken(token))
    expect(query.params).not.toContain(
      hashTrustedDeviceToken(`${token}-edited`)
    )
  })
})
