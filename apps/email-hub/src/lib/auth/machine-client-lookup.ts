import { eq } from "drizzle-orm"

import { apiClient } from "@workspace/db"
import { getDb } from "@workspace/db/client"

import {
  decryptWithAppKey,
  readAppEncryptionKeyFromEnv,
} from "@/lib/crypto/app-encryption"
import type { MachineClientAuthRecord } from "@/lib/auth/machine-hmac"

/**
 * Load an active/revoked API client by id and decrypt HMAC secrets.
 * Returns null when the key id is unknown or secrets cannot be decrypted.
 */
export async function resolveMachineClientFromDb(
  keyId: string
): Promise<MachineClientAuthRecord | null> {
  const [row] = await getDb()
    .select({
      id: apiClient.id,
      status: apiClient.status,
      scopes: apiClient.scopes,
      ipAllowlist: apiClient.ipAllowlist,
      secretEncrypted: apiClient.secretEncrypted,
      oldSecretEncrypted: apiClient.oldSecretEncrypted,
      rotatedAt: apiClient.rotatedAt,
    })
    .from(apiClient)
    .where(eq(apiClient.id, keyId))
    .limit(1)

  if (!row || !row.secretEncrypted) {
    return null
  }

  let encryptionKey: string
  try {
    encryptionKey = readAppEncryptionKeyFromEnv()
  } catch {
    return null
  }

  let secret: string
  try {
    secret = decryptWithAppKey(row.secretEncrypted, encryptionKey)
  } catch {
    return null
  }

  let oldSecret: string | null = null
  if (row.oldSecretEncrypted) {
    try {
      oldSecret = decryptWithAppKey(row.oldSecretEncrypted, encryptionKey)
    } catch {
      oldSecret = null
    }
  }

  return {
    id: row.id,
    status: row.status,
    scopes: row.scopes ?? [],
    ipAllowlist: row.ipAllowlist ?? [],
    secret,
    oldSecret,
    rotatedAt: row.rotatedAt,
  }
}

export async function touchMachineClientLastUsed(keyId: string): Promise<void> {
  await getDb()
    .update(apiClient)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiClient.id, keyId))
}
