import { apiClient, type ApiClient } from "@workspace/db"
import {
  getDb,
  type Database,
  type DatabaseTransaction,
} from "@workspace/db/client"
import { AppError, writeAudit } from "@workspace/shared"
import { desc, eq, sql } from "drizzle-orm"
import { v7 as uuidv7 } from "uuid"

import {
  MACHINE_SCOPES,
  type MachineScope,
  previousSecretExpiresAt,
} from "@/lib/auth/machine-hmac"
import {
  encryptWithAppKey,
  readAppEncryptionKeyFromEnv,
} from "@/lib/crypto/app-encryption"

import { normaliseIpAllowlist } from "./ip"
import {
  generateApiClientSecret,
  generateKeyPrefix,
  hashApiClientSecret,
} from "./secrets"
import {
  serializeApiClient,
  type ApiClientJson,
  type ApiClientWithSecretJson,
  type DisabledApiClientJson,
} from "./serialize"

const CREATE_LOCK_KEY = "emailhub:api-client-create"
const PREFIX_ATTEMPTS = 5

export type ApiClientActor = {
  userId: string
  requestId?: string | null
}

export type ApiClientDeps = {
  db?: Database
  now?: Date
  encryptionKey?: string
  secret?: () => string
  keyPrefix?: () => string
}

type Tx = DatabaseTransaction

function clientLockKey(id: string): string {
  return `emailhub:api-client:${id}`
}

async function lockKey(tx: Tx, key: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}::text))`)
}

function resolveDeps(deps: ApiClientDeps) {
  return {
    db: deps.db ?? getDb(),
    now: deps.now ?? new Date(),
    encryptionKey: deps.encryptionKey,
    secret: deps.secret ?? generateApiClientSecret,
    keyPrefix: deps.keyPrefix ?? generateKeyPrefix,
  }
}

function requireEncryptionKey(explicit: string | undefined): string {
  if (explicit) {
    return explicit
  }
  return readEncryptionKey()
}

function readEncryptionKey(): string {
  try {
    return readAppEncryptionKeyFromEnv()
  } catch {
    throw AppError.internal()
  }
}

function requireScopes(scopes: readonly string[]): string[] {
  const unique = new Set(scopes)
  for (const scope of unique) {
    if (!MACHINE_SCOPES.includes(scope as MachineScope)) {
      throw AppError.validationFailed([
        { path: "scopes", message: "Unknown scope" },
      ])
    }
  }
  return MACHINE_SCOPES.filter((scope) => unique.has(scope))
}

function requireAllowlist(values: readonly string[]): string[] {
  const result = normaliseIpAllowlist(values)
  if (!result.ok) {
    throw AppError.validationFailed([
      { path: `ip_allowlist.${result.index}`, message: result.message },
    ])
  }
  return result.entries
}

function auditActor(actor: ApiClientActor) {
  return {
    actor: { type: "user" as const, id: actor.userId },
    requestId: actor.requestId,
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false
  }
  if ("code" in error && (error as { code: unknown }).code === "23505") {
    return true
  }
  if ("cause" in error) {
    return isUniqueViolation((error as { cause: unknown }).cause)
  }
  return false
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length && left.every((item, i) => item === right[i])
  )
}

async function loadClient(tx: Tx, id: string): Promise<ApiClient | undefined> {
  const [row] = await tx
    .select()
    .from(apiClient)
    .where(eq(apiClient.id, id))
    .limit(1)
    .for("update")
  return row
}

export async function createApiClient(
  input: {
    name: string
    scopes: readonly string[]
    ipAllowlist?: readonly string[]
  },
  actor: ApiClientActor,
  deps: ApiClientDeps = {}
): Promise<ApiClientWithSecretJson> {
  const { db, now, secret: nextSecret, keyPrefix } = resolveDeps(deps)
  const encryptionKey = requireEncryptionKey(deps.encryptionKey)
  const name = input.name.trim()
  const scopes = requireScopes(input.scopes)
  const ipAllowlist = requireAllowlist(input.ipAllowlist ?? [])
  const secret = nextSecret()
  let secretEncrypted: string
  try {
    secretEncrypted = encryptWithAppKey(secret, encryptionKey)
  } catch {
    throw AppError.internal()
  }
  const secretHash = hashApiClientSecret(secret)

  for (let attempt = 0; attempt < PREFIX_ATTEMPTS; attempt += 1) {
    const prefix = keyPrefix()
    try {
      const created = await db.transaction(async (tx) => {
        await lockKey(tx, CREATE_LOCK_KEY)
        const [taken] = await tx
          .select({ id: apiClient.id })
          .from(apiClient)
          .where(eq(apiClient.keyPrefix, prefix))
          .limit(1)
        if (taken) {
          throw Object.assign(new Error("duplicate api client prefix"), {
            code: "23505",
          })
        }
        const id = uuidv7()
        const [row] = await tx
          .insert(apiClient)
          .values({
            id,
            name,
            keyPrefix: prefix,
            secretHash,
            secretEncrypted,
            oldSecretHash: null,
            oldSecretEncrypted: null,
            rotatedAt: null,
            scopes,
            ipAllowlist,
            status: "active",
            lastUsedAt: null,
            expiresAt: null,
            revokedAt: null,
            createdBy: actor.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning()
        if (!row) {
          throw AppError.internal()
        }
        await writeAudit(tx, {
          ...auditActor(actor),
          action: "api_client.created",
          objectType: "api_client",
          objectId: row.id,
          before: null,
          after: {
            name: row.name,
            key_prefix: row.keyPrefix,
            scopes: row.scopes,
            ip_allowlist: row.ipAllowlist,
            status: row.status,
          },
        })
        return row
      })
      return { ...serializeApiClient(created), secret }
    } catch (error) {
      if (!isUniqueViolation(error) || attempt === PREFIX_ATTEMPTS - 1) {
        if (isUniqueViolation(error)) {
          throw AppError.conflict([
            {
              path: "key_prefix",
              message: "Could not allocate a client identifier",
            },
          ])
        }
        throw error
      }
    }
  }
  throw AppError.internal()
}

export async function listApiClients(
  deps: ApiClientDeps = {}
): Promise<{ api_clients: ApiClientJson[] }> {
  const { db } = resolveDeps(deps)
  const rows = await db
    .select({
      id: apiClient.id,
      name: apiClient.name,
      keyPrefix: apiClient.keyPrefix,
      status: apiClient.status,
      scopes: apiClient.scopes,
      ipAllowlist: apiClient.ipAllowlist,
      expiresAt: apiClient.expiresAt,
      rotatedAt: apiClient.rotatedAt,
      revokedAt: apiClient.revokedAt,
      lastUsedAt: apiClient.lastUsedAt,
      createdBy: apiClient.createdBy,
      createdAt: apiClient.createdAt,
      updatedAt: apiClient.updatedAt,
      oldSecretHash: apiClient.oldSecretHash,
    })
    .from(apiClient)
    .orderBy(desc(apiClient.createdAt))
  return { api_clients: rows.map((row) => serializeApiClient(row)) }
}

export async function getApiClient(
  id: string,
  deps: ApiClientDeps = {}
): Promise<ApiClientJson> {
  const { db } = resolveDeps(deps)
  const [row] = await db
    .select({
      id: apiClient.id,
      name: apiClient.name,
      keyPrefix: apiClient.keyPrefix,
      status: apiClient.status,
      scopes: apiClient.scopes,
      ipAllowlist: apiClient.ipAllowlist,
      expiresAt: apiClient.expiresAt,
      rotatedAt: apiClient.rotatedAt,
      revokedAt: apiClient.revokedAt,
      lastUsedAt: apiClient.lastUsedAt,
      createdBy: apiClient.createdBy,
      createdAt: apiClient.createdAt,
      updatedAt: apiClient.updatedAt,
      oldSecretHash: apiClient.oldSecretHash,
    })
    .from(apiClient)
    .where(eq(apiClient.id, id))
    .limit(1)
  if (!row) {
    throw AppError.notFound([{ path: "id", message: "API client not found" }])
  }
  return serializeApiClient(row)
}

export async function rotateApiClientSecret(
  id: string,
  actor: ApiClientActor,
  deps: ApiClientDeps = {}
): Promise<ApiClientWithSecretJson> {
  const { db, now, secret: nextSecret } = resolveDeps(deps)

  const rotated = await db.transaction(async (tx) => {
    await lockKey(tx, clientLockKey(id))
    const current = await loadClient(tx, id)
    if (!current) {
      throw AppError.notFound([{ path: "id", message: "API client not found" }])
    }
    if (current.status !== "active") {
      throw AppError.conflict([
        { path: "status", message: "API client is disabled" },
      ])
    }
    const secret = nextSecret()
    let secretEncrypted: string
    try {
      secretEncrypted = encryptWithAppKey(
        secret,
        requireEncryptionKey(deps.encryptionKey)
      )
    } catch (error) {
      if (error instanceof AppError) {
        throw error
      }
      throw AppError.internal()
    }
    const secretHash = hashApiClientSecret(secret)
    const previousExpires = previousSecretExpiresAt(now)
    const [updated] = await tx
      .update(apiClient)
      .set({
        secretHash,
        secretEncrypted,
        oldSecretHash: current.secretHash,
        oldSecretEncrypted: current.secretEncrypted,
        rotatedAt: now,
        updatedAt: now,
      })
      .where(eq(apiClient.id, id))
      .returning()
    if (!updated) {
      throw AppError.internal()
    }
    await writeAudit(tx, {
      ...auditActor(actor),
      action: "api_client.rotated",
      objectType: "api_client",
      objectId: id,
      before: {
        rotated_at: current.rotatedAt ? current.rotatedAt.toISOString() : null,
      },
      after: {
        rotated_at: now.toISOString(),
        previous_secret_expires_at: previousExpires.toISOString(),
      },
    })
    return { updated, secret }
  })
  return { ...serializeApiClient(rotated.updated), secret: rotated.secret }
}

export async function disableApiClient(
  id: string,
  actor: ApiClientActor,
  deps: ApiClientDeps = {}
): Promise<DisabledApiClientJson> {
  const { db, now } = resolveDeps(deps)
  return db.transaction(async (tx) => {
    await lockKey(tx, clientLockKey(id))
    const current = await loadClient(tx, id)
    if (!current) {
      throw AppError.notFound([{ path: "id", message: "API client not found" }])
    }
    if (current.status === "revoked") {
      return { ...serializeApiClient(current), already_disabled: true }
    }
    const [updated] = await tx
      .update(apiClient)
      .set({
        status: "revoked",
        revokedAt: now,
        updatedAt: now,
      })
      .where(eq(apiClient.id, id))
      .returning()
    if (!updated) {
      throw AppError.internal()
    }
    await writeAudit(tx, {
      ...auditActor(actor),
      action: "api_client.disabled",
      objectType: "api_client",
      objectId: id,
      before: { status: current.status, revoked_at: null },
      after: { status: "revoked", revoked_at: now.toISOString() },
    })
    return { ...serializeApiClient(updated), already_disabled: false }
  })
}

export async function updateApiClientScopes(
  id: string,
  scopesInput: readonly string[],
  actor: ApiClientActor,
  deps: ApiClientDeps = {}
): Promise<ApiClientJson> {
  const { db, now } = resolveDeps(deps)
  const scopes = requireScopes(scopesInput)
  return db.transaction(async (tx) => {
    await lockKey(tx, clientLockKey(id))
    const current = await loadClient(tx, id)
    if (!current) {
      throw AppError.notFound([{ path: "id", message: "API client not found" }])
    }
    if (sameList(current.scopes ?? [], scopes)) {
      return serializeApiClient(current)
    }
    const [updated] = await tx
      .update(apiClient)
      .set({ scopes, updatedAt: now })
      .where(eq(apiClient.id, id))
      .returning()
    if (!updated) {
      throw AppError.internal()
    }
    await writeAudit(tx, {
      ...auditActor(actor),
      action: "api_client.scopes_updated",
      objectType: "api_client",
      objectId: id,
      before: { scopes: current.scopes ?? [] },
      after: { scopes },
    })
    return serializeApiClient(updated)
  })
}

export async function updateApiClientAllowlist(
  id: string,
  allowlistInput: readonly string[],
  actor: ApiClientActor,
  deps: ApiClientDeps = {}
): Promise<ApiClientJson> {
  const { db, now } = resolveDeps(deps)
  const ipAllowlist = requireAllowlist(allowlistInput)
  return db.transaction(async (tx) => {
    await lockKey(tx, clientLockKey(id))
    const current = await loadClient(tx, id)
    if (!current) {
      throw AppError.notFound([{ path: "id", message: "API client not found" }])
    }
    if (sameList(current.ipAllowlist ?? [], ipAllowlist)) {
      return serializeApiClient(current)
    }
    const [updated] = await tx
      .update(apiClient)
      .set({ ipAllowlist, updatedAt: now })
      .where(eq(apiClient.id, id))
      .returning()
    if (!updated) {
      throw AppError.internal()
    }
    await writeAudit(tx, {
      ...auditActor(actor),
      action: "api_client.ip_allowlist_updated",
      objectType: "api_client",
      objectId: id,
      before: { ip_allowlist: current.ipAllowlist ?? [] },
      after: { ip_allowlist: ipAllowlist },
    })
    return serializeApiClient(updated)
  })
}
