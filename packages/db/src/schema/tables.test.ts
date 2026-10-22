import { getTableName } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { account, session, twoFactor, verification } from "./auth.js"
import { apiClient, apiClientStatus } from "./api-client.js"
import { auditActorType, auditLog } from "./audit-log.js"
import { trustedDevice } from "./trusted-device.js"

function indexNames(table: Parameters<typeof getTableConfig>[0]): string[] {
  return getTableConfig(table).indexes.map((entry) => entry.config.name)
}

describe("auth tables", () => {
  it("keeps the Better Auth session token unique and indexes expiry", () => {
    expect(getTableName(session)).toBe("session")
    expect(indexNames(session)).toEqual(
      expect.arrayContaining([
        "session_token_unique",
        "session_user_id_idx",
        "session_expires_at_idx",
      ])
    )
  })

  it("keeps one account row per provider account", () => {
    expect(indexNames(account)).toContain("account_provider_account_unique")
  })

  it("indexes verification lookup and expiry without making the token unique", () => {
    const names = indexNames(verification)
    expect(names).toEqual(
      expect.arrayContaining([
        "verification_identifier_idx",
        "verification_expires_at_idx",
      ])
    )
    expect(names.some((name) => name.includes("value"))).toBe(false)
  })

  it("stores one two-factor row per user", () => {
    expect(getTableName(twoFactor)).toBe("two_factor")
    expect(indexNames(twoFactor)).toEqual(
      expect.arrayContaining(["two_factor_user_id_unique"])
    )
    expect(indexNames(twoFactor).some((name) => name.includes("secret"))).toBe(
      false
    )
  })
})

describe("application tables", () => {
  it("stores only a hash for trusted devices and api clients", () => {
    expect(indexNames(trustedDevice)).toEqual(
      expect.arrayContaining([
        "trusted_device_token_hash_unique",
        "trusted_device_user_id_idx",
        "trusted_device_expires_at_idx",
      ])
    )
    expect(apiClientStatus.enumValues).toEqual(["active", "revoked"])
    expect(indexNames(apiClient)).toEqual(
      expect.arrayContaining([
        "api_client_key_prefix_unique",
        "api_client_status_idx",
      ])
    )
  })

  it("indexes audit rows without treating request id as unique", () => {
    expect(auditActorType.enumValues).toEqual(["user", "api_client", "system"])
    const names = indexNames(auditLog)
    expect(names).toEqual(
      expect.arrayContaining([
        "audit_log_created_at_idx",
        "audit_log_actor_idx",
        "audit_log_entity_idx",
        "audit_log_request_id_idx",
      ])
    )
    expect(
      getTableConfig(auditLog).checks.map((entry) => entry.name)
    ).toContain("audit_log_actor_id_check")
  })
})
